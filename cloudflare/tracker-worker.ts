import { DurableObject } from 'cloudflare:workers';

import { systemClock } from 'wheel/sync';
import {
  SyncSocketServer,
  applyDurableObjectMigrations,
  authenticateSyncSocket,
  createCloudflareSyncBackend,
  createSyncServer,
  runDurableObjectSql,
  type DurableObjectMigration,
  type DurableObjectMigrationResult,
  type DurableObjectStorageLike,
  type SyncServer,
  type SyncServerSocket
} from 'wheel/sync/server/cloudflare';

import { runCycleRollover } from '../packages/tracker/jobs/rollover';
import { applySeed } from '../packages/tracker/seed/seed';
import { createTrackerAuthenticator } from '../packages/tracker/server/auth';
import type { TrackerServerConfig } from '../packages/tracker/server/config';
import {
  TRACKER_APPLICATION_VERSION,
  TRACKER_MINIMUM_CLIENT_VERSION
} from '../packages/tracker/sync-version';
import {
  TRACKER_SERVERS,
  TRACKER_SYNC_MODULES
} from '../packages/tracker/server/modules';
import {
  TRACKER_MIGRATIONS
} from '../packages/tracker/server/schema';

const WORKSPACE_NAME = 'axle-demo';
const ROLLOVER_INTERVAL_MS = 10 * 60 * 1_000;
export { TRACKER_APPLICATION_VERSION } from '../packages/tracker/sync-version';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface TrackerWorkerEnv {
  readonly ASSETS: AssetBinding;
  readonly TRACKER_WORKSPACES: DurableObjectNamespace<TrackerWorkspace>;
}

const DEMO_CONFIG: TrackerServerConfig = Object.freeze({
  mode: 'demo',
  port: 0,
  workspaceId: WORKSPACE_NAME,
  databaseFilename: ':memory:',
  maxBodyBytes: 256 * 1_024,
  requestsPerMinute: 1_200
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}

function storageAdapter(storage: DurableObjectStorage): DurableObjectStorageLike {
  return {
    sql: storage.sql,
    transaction: (callback) => storage.transaction(async () => callback())
  };
}

function socketAdapter(socket: WebSocket): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.deserializeAttachment(),
    setAttachment: (value) => socket.serializeAttachment(value)
  };
}

interface TrackerRuntime {
  readonly server: SyncServer;
  readonly sockets: SyncSocketServer;
}

/** One branch-local Tracker workspace and one private SQLite database. */
export class TrackerWorkspace extends DurableObject<TrackerWorkerEnv> {
  private readonly runtime: Promise<TrackerRuntime>;

  constructor(ctx: DurableObjectState, env: TrackerWorkerEnv) {
    super(ctx, env);
    this.runtime = ctx.blockConcurrencyWhile(() => this.boot());
  }

  private async boot(): Promise<TrackerRuntime> {
    const migration = await applyDurableObjectMigrations(
      storageAdapter(this.ctx.storage),
      TRACKER_MIGRATIONS
    );
    await this.ctx.storage.transaction(async () => {
      await applySeed(
        {
          query: (text, params) =>
            Promise.resolve(runDurableObjectSql(this.ctx.storage.sql, text, params))
        },
        { issueBatchSize: 5 }
      );
    });

    const backend = createCloudflareSyncBackend({
      storage: storageAdapter(this.ctx.storage),
      clock: systemClock
    });
    const server = await createSyncServer({
      backend,
      syncModules: [...TRACKER_SYNC_MODULES],
      servers: [...TRACKER_SERVERS]
    });
    const sockets = new SyncSocketServer({
      server,
      applicationVersion: TRACKER_APPLICATION_VERSION,
      minimumClientVersion: TRACKER_MINIMUM_CLIENT_VERSION,
      schemaVersion: migration.toVersion,
      maxMessageBytes: DEMO_CONFIG.maxBodyBytes,
      messagesPerMinute: DEMO_CONFIG.requestsPerMinute,
      detailedErrors: true
    });
    await sockets.restore(this.ctx.getWebSockets().map(socketAdapter));

    await this.runRollover(server);
    await this.ctx.storage.setAlarm(Date.now() + ROLLOVER_INTERVAL_MS);
    return { server, sockets };
  }

  private async runRollover(server: SyncServer): Promise<void> {
    await this.ctx.storage.transaction(async () => {
      await runCycleRollover({
        db: {
          query: (text, params) =>
            Promise.resolve(runDurableObjectSql(this.ctx.storage.sql, text, params))
        },
        server,
        now: Date.now()
      });
    });
  }

  async alarm(): Promise<void> {
    const { server } = await this.runtime;
    try {
      await this.runRollover(server);
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + ROLLOVER_INTERVAL_MS);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const runtime = await this.runtime;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/readyz') {
      try {
        this.ctx.storage.sql.exec('select 1').toArray();
        return json({ ok: true, workspaceId: WORKSPACE_NAME });
      } catch {
        return json(
          { ok: false, error: { code: 'not_ready', message: 'Database is unavailable.' } },
          503
        );
      }
    }
    if (!url.pathname.startsWith('/sync/')) {
      return json(
        { ok: false, error: { code: 'not_found', message: 'Tracker route not found.' } },
        404
      );
    }
    if (url.pathname !== '/sync/websocket') {
      return json(
        { ok: false, error: { code: 'not_found', message: 'Sync route not found.' } },
        404
      );
    }
    const authenticated = await authenticateSyncSocket(request, {
      authenticator: createTrackerAuthenticator(DEMO_CONFIG),
      workspaceId: WORKSPACE_NAME
    });
    if (!authenticated.ok) return authenticated.response;

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    runtime.sockets.accept(socketAdapter(server), authenticated.handshake);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const { sockets } = await this.runtime;
    await sockets.message(socketAdapter(socket), message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const { sockets } = await this.runtime;
    sockets.close(socketAdapter(socket));
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error('Tracker sync WebSocket error', error);
    const { sockets } = await this.runtime;
    sockets.close(socketAdapter(socket));
  }

  /** Test seam for direct storage assertions inside the Durable Object. */
  async queryForTests(
    text: string,
    params?: readonly unknown[]
  ): Promise<Record<string, unknown>[]> {
    await this.runtime;
    return runDurableObjectSql(this.ctx.storage.sql, text, params);
  }

  /** Test seam for migration ordering, history, and rollback checks on real Durable Object SQLite. */
  async applyMigrationsForTests(
    migrations: readonly DurableObjectMigration[]
  ): Promise<DurableObjectMigrationResult> {
    await this.runtime;
    return applyDurableObjectMigrations(storageAdapter(this.ctx.storage), migrations);
  }
}

export async function fetchTracker(
  request: Request,
  env: TrackerWorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') {
    return json({ ok: true });
  }
  if (url.pathname.startsWith('/sync/') || url.pathname === '/readyz') {
    return env.TRACKER_WORKSPACES.getByName(WORKSPACE_NAME).fetch(request);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const lastSegment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    if (!lastSegment.includes('.')) {
      // Was '/shell/index.html', a hand-made copy that existed only because the
      // deploy's artifact download skipped every file at the top of dist/.
      url.pathname = '/index.html';
      url.search = '';
      return env.ASSETS.fetch(new Request(url, request));
    }
  }
  return env.ASSETS.fetch(request);
}

export default { fetch: fetchTracker } satisfies ExportedHandler<TrackerWorkerEnv>;
