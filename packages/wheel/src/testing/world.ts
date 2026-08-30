/**
 * World: the in-process test harness. Real server engine, real
 * client engine(s), in-process SQLite (the DEFAULT backend — so the whole
 * invariant/convergence suite exercises exactly what production runs), fixed
 * clock, seeded ids, and a scriptable network in between. Zero I/O, zero timers
 * — if the harness can't reproduce it, the engine doesn't claim it.
 *
 * The SQLite backend runs on the `better-sqlite3` driver (works under
 * vitest/Node, where `bun:sqlite` cannot load) over a fresh `:memory:` database.
 * Because a `:memory:` database is per-connection, the ONE driver World builds
 * is shared: setup DDL runs on it, then the same driver is handed to the engine.
 */
import { fixedClock, seededRandomBytes } from '../sync/ids';
import type { MutationRejection } from '../sync/declarations';
import { SyncClient } from '../sync/client/client';
import { MemoryCache } from '../sync/client/local-cache';
import type { SyncTransport } from '../sync/client/transport';
import type { MutateGroupRequest, MutateResult, ServerEvent, Snapshot } from '../sync/protocol';
import type { SyncConnection, SyncServer } from '../sync/server/engine';
import { createSyncServer } from '../sync/server/node-engine';
import type { DbRow } from '../sync/protocol';
import { compileSql, type SqlFragment } from '../sync/sql';
import {
  betterSqlite3Driver,
  type SqliteDriver
} from '../sync/server/backends/sqlite-driver';

const WORLD_EPOCH = 1_700_000_000_000;

type Thunk = () => void | Promise<void>;

/**
 * Pausable per-client pipe. While paused, requests to the server and events
 * from the server queue up; resume flushes them in order.
 */
class ScriptableNetwork {
  private readonly paused = new Set<string>();
  private readonly queues = new Map<string, Thunk[]>();

  private queue(clientId: string): Thunk[] {
    let queue = this.queues.get(clientId);
    if (!queue) {
      queue = [];
      this.queues.set(clientId, queue);
    }
    return queue;
  }

  pause(clientId: string): void {
    this.paused.add(clientId);
  }

  isPaused(clientId: string): boolean {
    return this.paused.has(clientId);
  }

  async resume(clientId: string): Promise<void> {
    // Drain while still marked paused: anything NEW that arrives mid-drain
    // (e.g. deltas emitted by a queued mutation executing) appends to the
    // queue and flushes in order. Unpausing first let fresh deltas jump the
    // queue and reach the client BEFORE older ones — an ordering one WebSocket
    // cannot produce (one stream, seq order), caught by the simulator.
    const queue = this.queue(clientId);
    while (queue.length > 0) {
      const thunk = queue.shift()!;
      await thunk();
    }
    this.paused.delete(clientId);
  }

  /** Run now, or queue until resume. Returns a promise for the thunk's completion. */
  run<T>(clientId: string, thunk: () => Promise<T>): Promise<T> {
    if (!this.paused.has(clientId)) {
      return thunk();
    }
    return new Promise<T>((resolve, reject) => {
      this.queue(clientId).push(async () => {
        try {
          resolve(await thunk());
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  deliver(clientId: string, fn: () => void): void {
    if (!this.paused.has(clientId)) {
      fn();
      return;
    }
    this.queue(clientId).push(fn);
  }

  pendingUnpaused(): boolean {
    for (const [clientId, queue] of this.queues) {
      if (!this.paused.has(clientId) && queue.length > 0) {
        return true;
      }
    }
    return false;
  }
}

class InProcessTransport implements SyncTransport {
  private readonly connections = new Map<string, SyncConnection>();

  constructor(
    private readonly server: SyncServer,
    private readonly network: ScriptableNetwork,
    private readonly rejections: Array<{ mutation: string; rejection: MutationRejection }>
  ) {}

  async connect(
    clientId: string,
    onEvent: (event: ServerEvent) => void,
    identity: { actor: string }
  ): Promise<void> {
    const connection = this.server.connect(clientId, {
      actor: identity.actor,
      workspaceId: 'world',
      sessionId: clientId
    });
    connection.onEvent((event) => this.network.deliver(clientId, () => onEvent(event)));
    this.connections.set(clientId, connection);
  }

  subscribe(clientId: string, queryName: string, params: unknown): Promise<Snapshot> {
    const connection = this.connections.get(clientId);
    if (!connection) {
      throw new Error(`World transport: client "${clientId}" is not connected.`);
    }
    return this.network.run(clientId, () => connection.subscribe(queryName, params));
  }

  unsubscribe(clientId: string, subscriptionId: string): Promise<void> {
    return this.network.run(clientId, async () => {
      this.connections.get(clientId)?.unsubscribe(subscriptionId);
    });
  }

  mutateGroup(request: MutateGroupRequest): Promise<MutateResult> {
    return this.network.run(request.clientId, async () => {
      const scripted = this.rejections.findIndex((entry) =>
        request.calls.some((call) => call.name === entry.mutation)
      );
      if (scripted >= 0) {
        const [{ rejection }] = this.rejections.splice(scripted, 1);
        return { ok: false as const, rejection };
      }
      const connection = this.connections.get(request.clientId);
      if (!connection) {
        throw new Error(`World transport: client "${request.clientId}" is not connected.`);
      }
      return this.server.mutateGroup(request, connection.principal);
    });
  }

  setPresence(clientId: string, state: Record<string, unknown> | null): Promise<void> {
    return this.network.run(clientId, async () => this.server.setPresence(clientId, state));
  }

  close(clientId: string): void {
    this.connections.get(clientId)?.close();
    this.connections.delete(clientId);
  }
}

/**
 * Raw database access for tests and seeders, in both of the shapes SQL comes in:
 *
 * 1. A sql`` FRAGMENT — compiled to SQLite placeholders.
 * 2. RAW text — handed to SQLite verbatim.
 */
export interface WorldDb {
  query(source: SqlFragment, params?: undefined): Promise<DbRow[]>;
  query(text: string, params?: readonly unknown[]): Promise<DbRow[]>;
}

/** Wrap one backend's raw `(text, params)` runner as a `WorldDb` that also compiles sql`` fragments for that backend's dialect. */
function worldDb(
  run: (text: string, params?: readonly unknown[]) => Promise<DbRow[]>
): WorldDb {
  return {
    query: (source: SqlFragment | string, params?: readonly unknown[]) => {
      if (typeof source === 'string') return run(source, params);
      const compiled = compileSql(source);
      return run(compiled.text, compiled.params);
    }
  };
}

/** What a World needs: syncModules + server bindings, a setup(db) seeder, and an optional seed for determinism. */
export interface WorldOptions {
  syncModules: object[];
  servers: object[];
  /** Create tables and seed data. Runs before the engine boots, on the same connection the engine will use. */
  setup?: (db: WorldDb) => Promise<void>;
  seed?: number;
  /** Optional SQLite driver for browser or runtime-specific tests. */
  driver?: SqliteDriver;
}

/** The in-process harness: real engine + real clients on in-process SQLite with fixed clock, seeded ids, and a pausable network - if World can't reproduce it, the engine doesn't claim it. */
export class World {
  /** Every client this World created, by id. */
  readonly clients = new Map<string, SyncClient>();
  /** The scriptable network: pause/resume per client. */
  readonly network: {
    pause(clientId: string): void;
    resume(clientId: string): Promise<void>;
  };

  private readonly scriptedRejections: Array<{ mutation: string; rejection: MutationRejection }> = [];
  private readonly scriptableNetwork = new ScriptableNetwork();
  private readonly transport: InProcessTransport;
  private clientCounter = 0;

  private constructor(
    /** Raw read access to the engine's database (the sync log, seeded rows) for invariant checks. */
    readonly db: WorldDb,
    readonly server: SyncServer,
    private readonly seed: number,
    /** Release the database resources the World owns (no-op when the backend closes them on `server.close`). */
    private readonly disposeDb: () => Promise<void>
  ) {
    this.transport = new InProcessTransport(server, this.scriptableNetwork, this.scriptedRejections);
    const network = this.scriptableNetwork;
    this.network = {
      pause: (clientId) => network.pause(clientId),
      resume: (clientId) => network.resume(clientId)
    };
  }

  /** Boot a World with in-process SQLite, a seeded engine, and fixed time. */
  static async create(options: WorldOptions): Promise<World> {
    const seed = options.seed ?? 0xc0ffee;
    const clock = fixedClock(WORLD_EPOCH, 1);
    const randomBytes = seededRandomBytes(seed);
    // Default: the real default backend, on better-sqlite3 :memory:. ONE driver,
    // shared: setup DDL runs on it, then the engine builds its backend over it.
    const driver = options.driver ?? betterSqlite3Driver(':memory:');
    const db = worldDb(
      (text, params) => Promise.resolve(driver.all(text, params) as DbRow[])
    );
    await options.setup?.(db);
    const server = await createSyncServer({
      sqlite: { driver },
      syncModules: options.syncModules,
      servers: options.servers,
      clock,
      randomBytes
    });
    // The SqliteSyncBackend closes the shared driver on `server.close`, so the
    // World's own db-dispose is a no-op (closing twice would throw).
    return new World(db, server, seed, () => Promise.resolve());
  }

  /** Create (or fetch) a deterministic client with its own seeded ids. */
  async client(clientId: string, options: { actor?: string } = {}): Promise<SyncClient> {
    const existing = this.clients.get(clientId);
    if (existing) {
      return existing;
    }
    this.clientCounter += 1;
    const client = new SyncClient({
      transport: this.transport,
      clientId,
      actor: options.actor ?? `user:${clientId}`,
      clock: fixedClock(WORLD_EPOCH + 1_000 * this.clientCounter, 1),
      randomBytes: seededRandomBytes(this.seed + this.clientCounter * 7919),
      localCache: new MemoryCache()
    });
    await client.connect();
    this.clients.set(clientId, client);
    return client;
  }

  /** Two clients at once - the convergence-test staple. */
  async twoClients(a: string, b: string): Promise<[SyncClient, SyncClient]> {
    return [await this.client(a), await this.client(b)];
  }

  /** Script the next server response for a mutation name as a rejection. */
  rejectNext(mutation: string, code: string, message = `scripted rejection of ${mutation}`): void {
    this.scriptedRejections.push({ mutation, rejection: { kind: 'rejection', code, message } });
  }

  /**
   * Drain everything in flight: unpaused clients' in-flight subscribes, the
   * server's writer loop, and unpaused pipes. Awaiting subscribes means a
   * lazily-subscribing service read (`service.rows(teamId)` mid-test) is
   * settled truth after settle() — no poll-until-rows dance.
   * PAUSED clients' subscribes are deliberately skipped: they cannot resolve
   * until resume, and settle must not deadlock on scripted offline.
   */
  async settle(): Promise<void> {
    for (let round = 0; round < 32; round += 1) {
      await Promise.all(
        [...this.clients.entries()]
          .filter(([clientId]) => !this.scriptableNetwork.isPaused(clientId))
          .map(([, client]) => client.subscribesSettled())
      );
      await this.server.idle();
      // Two microtask yields: continuations chained on promises the idle
      // pass just resolved (client `.then` chains reacting to transport
      // responses) run before the pending checks below — each yield lets one
      // more level of chaining run.
      await Promise.resolve();
      await Promise.resolve();
      if (!this.scriptableNetwork.pendingUnpaused()) {
        // One more idle pass to let responses that just resolved enqueue work.
        await this.server.idle();
        if (!this.scriptableNetwork.pendingUnpaused() && this.subscribesQuiet()) {
          return;
        }
      }
    }
    throw new Error('World.settle(): still unsettled after 32 rounds — something is looping.');
  }

  private subscribesQuiet(): boolean {
    for (const [clientId, client] of this.clients) {
      if (this.scriptableNetwork.isPaused(clientId)) continue;
      if (client.hasInflightSubscribes()) return false;
    }
    return true;
  }

  /** Tear down clients, engine, and database. */
  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close();
    }
    await this.server.close();
    await this.disposeDb();
  }
}
