/**
 * The live server engine. One workspace, one process, ONE writer loop:
 * subscribes, mutations, and query re-runs are all serialized on a single
 * promise chain. That is the whole concurrency story — seq disorder,
 * bootstrap races, and diff interleaving are impossible by construction, at
 * throughput that is free at small-team scale.
 *
 * The engine is BACKEND-AGNOSTIC: everything that touches a database lives
 * behind the `SyncBackend` seam (sync-backend.ts). The engine owns the writer
 * loop, subscriptions, presence, row validation, diff + delta emission, and
 * exactly-once replay; the backend owns DDL, the writer lease, the mutation
 * transaction, the sync-log writes, reads, and the external-change feed. The
 * default backend is SQLite (`SqliteSyncBackend` on Bun or
 * `CloudflareSyncBackend` in a Durable Object).
 *
 * Deltas are whole rows. Subscriptions die with their connection. Every row
 * is schema-validated before emit.
 */
import { canonicalParams } from '../../core/params';
import type { AuthPrincipal } from '../../auth/index';
import { validateTableKey } from '../declarations';
import type { Clock, IdGen } from '../ids';
import { createIdGen, isValidId } from '../ids';
import { buildRegistry, type Registry } from './registry';
import { JsonValueError, jsonParseIsIdentity, validateJsonValue, validateRow } from '../schema';
import type { RowSchema } from '../schema';
import type { RandomBytes } from '../ids';
import { monotonicNowMs, systemClock, systemRandomBytes } from '../../core/runtime-defaults';
import { logger } from '../../core/logger';
import type { DbRow } from '../protocol';
import { SyncServerError } from './errors';
import type { BackendMutationCall, SyncBackend } from './sync-backend';
import type { ServeMutationBinding, ServeQueryBinding, ServerMutationCtx } from './serve';
import type { RowImage } from './query-handler';
import type { SqlFragment } from '../sql';
// The wire-protocol types are the shared client/server contract; they live in
// sync so the browser client can name them without importing this server
// module. The engine imports and re-exports them.
import type {
  MutateGroupRequest,
  MutateResult,
  ServerEvent,
  Snapshot,
  SyncQueryError,
  SyncQueryStatus
} from '../protocol';
export type {
  MutateGroupRequest,
  MutateCallRequest,
  MutateResult,
  MutationError,
  QueryStatusEvent,
  RowDelta,
  ServerEvent,
  Snapshot,
  SyncQueryError,
  SyncQueryStatus
} from '../protocol';
// SyncServerError lives outside the engine so backends can throw it without a
// circular import. Re-export it from this entry point.
export { SyncServerError } from './errors';

/** Wall-clock timing for the WHEEL_TIMING=1 diagnostics — monotonic where available, never the injected test clock. */
const monotonicNow = monotonicNowMs;

/** WHEEL_TIMING=1 logs one line per mutation/external write: queue wait, txn round trips, rerun breakdown, total. */
const liveTimingEnabled = (): boolean => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.WHEEL_TIMING === '1';
};

const formatMs = (ms: number): string => `${ms.toFixed(1)}ms`;

/** What one rerunWatchers pass did — the WHEEL_TIMING breakdown. */
interface RerunStats {
  ms: number;
  queries: Array<{ query: string; rows: number; subscribers: number }>;
}

const formatRerun = (rerun: RerunStats): string =>
  rerun.queries.length === 0
    ? `rerun=${formatMs(rerun.ms)}/0q`
    : `rerun=${formatMs(rerun.ms)}/${rerun.queries.length}q (${rerun.queries
        .map((entry) => `${entry.query}=${entry.rows}r${entry.subscribers > 1 ? `x${entry.subscribers}` : ''}`)
        .join(', ')})`;

/** One row of the /sync/_debug/subscriptions table: params, dependencies, row count, run stats. */
export interface SubscriptionDebugInfo {
  readonly id: string;
  readonly clientId: string;
  readonly query: string;
  readonly params: unknown;
  readonly dependsOn: readonly string[];
  readonly handlerKind: string;
  readonly rows: number;
  readonly lastSeq: number;
  readonly status: SyncQueryStatus;
  readonly runs: number;
  readonly lastRunMs: number;
}

/**
 * Runtime-neutral engine options. Backend construction belongs to a runtime
 * entry point; the engine accepts one already-built backend and never imports
 * Node, Bun, or Cloudflare modules.
 */
export interface SyncServerOptions {
  /** The owned database backend. Runtime entry points construct it. */
  backend: SyncBackend;
  syncModules: object[];
  servers: object[];
  clock?: Clock;
  randomBytes?: RandomBytes;
  /**
   * Opt-in Tier-1 pruning: install row-level triggers capturing old/new row
   * images per write, letting handlers with a `prune` predicate skip
   * provably-irrelevant re-runs. Off by default (adds per-row write cost).
   * Only meaningful with `db`.
   */
  rowImages?: boolean;
}

interface Subscription {
  id: string;
  clientId: string;
  principal: AuthPrincipal;
  binding: ServeQueryBinding;
  params: Record<string, unknown>;
  canonicalKey: string;
  lastRows: Map<string, { row: DbRow; canonical: string }>;
  lastSeq: number;
  status: SyncQueryStatus;
  runs: number;
  lastRunMs: number;
  /** Tears down the handler's push channel (QueryHandler.subscribe), when one exists. */
  unsubscribeHandler?: () => void;
}

/** One live-query descriptor that can rebuild its in-memory comparison baseline after hibernation. */
export interface SyncSubscriptionState {
  readonly id: string;
  readonly query: string;
  readonly params: unknown;
}

/** The connection state Cloudflare stores with a hibernatable WebSocket. */
export interface SyncConnectionState {
  readonly clientId: string;
  readonly principal: AuthPrincipal;
  readonly presence: PresenceState | null;
  readonly subscriptions: readonly SyncSubscriptionState[];
}

/** One client's server-side presence: subscribe, events out, and death-drops-subscriptions. */
export interface SyncConnection {
  readonly clientId: string;
  /** Trusted identity attached when the server accepted this connection. */
  readonly principal: AuthPrincipal;
  subscribe(queryName: string, params: unknown): Promise<Snapshot>;
  unsubscribe(subscriptionId: string): void;
  onEvent(listener: (event: ServerEvent) => void): () => void;
  /** JSON-safe state required to rebuild this connection after Durable Object hibernation. */
  state(): SyncConnectionState;
  close(): void;
}

/**
 * Presence is the engine's EPHEMERAL channel: in-memory only, no seq, no
 * sync_log, no provenance. It broadcasts through each connection listener, and a
 * client's presence dies with its connection, like subscriptions do.
 * Ordering is best-effort by design; the latest state always wins.
 */
export interface PresenceState {
  readonly [key: string]: unknown;
}

/** The engine: ONE writer loop serializing subscribes, mutations, and re-runs - seq disorder and bootstrap races are unrepresentable (see module doc). */
export class SyncServer {
  private readonly registry: Registry;
  private readonly clock: Clock;
  private readonly idGen: IdGen;
  private queue: Promise<unknown> = Promise.resolve();
  private lastSeq = 0;
  private readonly connections = new Map<string, ConnectionImpl>();
  private closed = false;
  /** Releases the backend's writer lease on close (set at boot). */
  private releaseWriterLease: (() => Promise<void>) | null = null;
  /** Tears down the backend's external-change subscription on close (set at boot). */
  private releaseExternal: (() => void) | null = null;
  /** One shared teardown protects backend ownership from duplicate close calls. */
  private closePromise: Promise<void> | null = null;

  private constructor(
    private readonly backend: SyncBackend,
    private readonly options: SyncServerOptions
  ) {
    this.registry = buildRegistry({ syncModules: options.syncModules, servers: options.servers });
    this.clock = options.clock ?? systemClock;
    this.idGen = createIdGen({ clock: this.clock, randomBytes: options.randomBytes ?? systemRandomBytes });
  }

  /** Boot an engine: registry cross-check, writer lease, backend install, external-change feed, writer loop. */
  static async create(options: SyncServerOptions): Promise<SyncServer> {
    if (!options.backend) {
      throw new SyncServerError(
        'invalid_backend_config',
        'createSyncServer requires a pre-built `backend`.'
      );
    }
    const server = new SyncServer(options.backend, options);
    try {
      await server.boot();
      return server;
    } catch (bootError) {
      try {
        await server.close();
      } catch (closeError) {
        throw new AggregateError(
          [bootError, closeError],
          'SyncServer boot failed, then owned-resource cleanup also failed.'
        );
      }
      throw bootError;
    }
  }

  private async boot(): Promise<void> {
    // Lease FIRST (install must not race a second writer), then install +
    // last-seq, then subscribe to any foreign-write feed the backend provides.
    this.releaseWriterLease = await this.backend.acquireWriterLease();
    const { lastSeq } = await this.backend.init(this.syncedTables(), {
      rowImages: this.options.rowImages,
      tableSchemas: this.syncedTableSchemas()
    });
    this.lastSeq = lastSeq;
    // Writes the backend observes but the engine did not author mint a seq and
    // re-run watchers on the writer loop, like externalWrite. Current SQLite
    // backends do not fire this feed.
    this.releaseExternal = this.backend.onExternalChange((touched) => {
      void this.externalWrite({ tables: [...touched], source: 'backend:external' });
    });
  }

  /** Everything that reads or writes state goes through here — the single writer. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (this.closed) {
      return Promise.reject(new SyncServerError('server_closed', 'Live server is closed.'));
    }
    const run = this.queue.then(work);
    this.queue = run.catch(() => {});
    return run;
  }

  /** The last committed seq. */
  seq(): number {
    return this.lastSeq;
  }

  /** Physical names of every non-virtual declared table — the set the backend installs tracking on. */
  syncedTables(): string[] {
    const names: string[] = [];
    for (const [tableName, tableDecl] of this.registry.tables) {
      if (!tableDecl.virtual) {
        names.push(tableName);
      }
    }
    return names;
  }

  /**
   * Each non-virtual table's zod row schema (name → schema). Handed to the
   * backend at boot so a backend whose storage drifts from what the schemas
   * validate can repair rows at its read seam (the SQLite backend turns integer
   * 0/1 back into real booleans); backends that already return schema-shaped
   * values ignore it.
   */
  private syncedTableSchemas(): Map<string, RowSchema> {
    const schemas = new Map<string, RowSchema>();
    for (const [tableName, tableDecl] of this.registry.tables) {
      if (!tableDecl.virtual) {
        schemas.set(tableName, tableDecl.schema);
      }
    }
    return schemas;
  }

  /** Resolves when all currently queued work has drained (World.settle support). */
  idle(): Promise<void> {
    return this.enqueue(async () => {});
  }

  /** Attach a client connection (one per clientId; welcome events deferred a microtask). */
  connect(clientId: string, principal: AuthPrincipal): SyncConnection {
    if (this.connections.has(clientId)) {
      // The engine stays strict: one connection per id. The WebSocket session
      // layer closes the old connection before it creates a replacement.
      // Custom transports must do the same.
      throw new SyncServerError('client_exists', `Client "${clientId}" already has a live connection.`);
    }
    const connection = new ConnectionImpl(this, clientId, principal);
    this.connections.set(clientId, connection);
    // Deferred a microtask so callers can attach their event listener after
    // connect() returns and still receive the welcome + presence bootstrap.
    queueMicrotask(() => {
      connection.emit({ type: 'hello', clientId });
      // Ephemeral channel bootstrap: the newcomer learns everyone's current presence.
      for (const other of this.connections.values()) {
        if (other !== connection && other.presence !== null) {
          connection.emit({
            type: 'presence',
            clientId: other.clientId,
            actor: other.principal.actor,
            state: other.presence
          });
        }
      }
    });
    return connection;
  }

  /**
   * Rebuild one hibernated connection without emitting a reconnect event.
   * The socket never closed, so its subscription ids and presence identity
   * remain stable. Query handlers run again to recreate their comparison
   * baselines before the event that woke the Durable Object is processed.
   */
  async restoreConnection(state: SyncConnectionState): Promise<SyncConnection> {
    if (this.connections.has(state.clientId)) {
      throw new SyncServerError(
        'client_exists',
        `Client "${state.clientId}" already has a live connection.`
      );
    }
    const connection = new ConnectionImpl(this, state.clientId, state.principal);
    this.connections.set(state.clientId, connection);
    try {
      connection.restorePresence(state.presence);
      const ids = new Set<string>();
      for (const subscription of state.subscriptions) {
        if (ids.has(subscription.id)) {
          throw new SyncServerError(
            'invalid_subscription',
            `Connection "${state.clientId}" contains duplicate subscription id "${subscription.id}".`
          );
        }
        ids.add(subscription.id);
        await this.runSubscribe(
          connection,
          subscription.query,
          subscription.params,
          subscription.id
        );
      }
      return connection;
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  /** @internal */
  dropConnection(clientId: string): void {
    const actor = this.connections.get(clientId)?.principal.actor;
    this.connections.delete(clientId);
    if (actor) {
      this.broadcastPresence(clientId, null, actor);
    }
  }

  /** Update one client's ephemeral presence and broadcast it to everyone else. */
  setPresence(clientId: string, state: PresenceState | null): void {
    const connection = this.connections.get(clientId);
    if (!connection) {
      return; // no stream, no presence — it dies with the connection
    }
    if (state !== null) {
      try {
        validateJsonValue(`Presence for client "${clientId}"`, state);
      } catch (error) {
        if (error instanceof JsonValueError) {
          throw new SyncServerError('invalid_presence', error.message);
        }
        throw error;
      }
    }
    connection.presence = state;
    this.broadcastPresence(clientId, state, connection.principal.actor);
  }

  private broadcastPresence(
    clientId: string,
    state: PresenceState | null,
    actor: string
  ): void {
    for (const connection of this.connections.values()) {
      if (connection.clientId !== clientId) {
        connection.emit({ type: 'presence', clientId, actor, state });
      }
    }
  }

  /** @internal */
  async runSubscribe(
    connection: ConnectionImpl,
    queryName: string,
    rawParams: unknown,
    restoredId?: string
  ): Promise<Snapshot> {
    const binding = this.registry.queryBindings.get(queryName) as ServeQueryBinding | undefined;
    const decl = this.registry.queries.get(queryName);
    if (!binding || !decl) {
      throw new SyncServerError('unknown_query', `No query named "${queryName}" is registered.`);
    }
    try {
      validateJsonValue(`Params for query "${queryName}"`, rawParams);
    } catch (error) {
      if (error instanceof JsonValueError) {
        throw new SyncServerError('invalid_params', error.message);
      }
      throw error;
    }
    const parsed = decl.params.safeParse(rawParams);
    if (!parsed.success) {
      throw new SyncServerError(
        'invalid_params',
        `Params for query "${queryName}" are invalid: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`
      );
    }
    const params = parsed.data;
    if (!jsonParseIsIdentity(rawParams, params)) {
      throw new SyncServerError(
        'invalid_params',
        `Params for query "${queryName}" contain fields or parse-time normalization outside its JSON Schema contract.`
      );
    }
    return this.enqueue(async () => {
      const subscription: Subscription = {
        id: restoredId ?? this.idGen.newId('sub'),
        clientId: connection.clientId,
        principal: connection.principal,
        binding,
        params,
        canonicalKey: `${queryName}|${canonicalParams(params)}|${canonicalParams(connection.principal)}`,
        lastRows: new Map(),
        lastSeq: this.lastSeq,
        status: { kind: 'live' },
        runs: 0,
        lastRunMs: 0
      };
      let rows: Map<string, { row: DbRow; canonical: string }>;
      try {
        rows = await this.runQuery(subscription);
      } catch (error) {
        rows = new Map();
        subscription.status = { kind: 'error', error: this.publicQueryError(error) };
        this.logQueryFailure(subscription, error, 'initial');
      }
      subscription.lastRows = rows;
      subscription.lastSeq = this.lastSeq;
      connection.addSubscription(subscription);
      // Push-based invalidation: the handler signals "may have changed"; the
      // engine coalesces onto the writer loop and re-runs + diffs there.
      if (binding.handler.subscribe) {
        subscription.unsubscribeHandler = binding.handler.subscribe(
          params,
          () => this.invalidateSubscription(subscription.id),
          connection.principal
        );
      }
      return {
        subscriptionId: subscription.id,
        query: queryName,
        seq: this.lastSeq,
        rows: [...rows.values()].map((entry) => entry.row),
        status: subscription.status
      };
    });
  }

  /** Subscription ids whose handlers signaled a change; drained in one writer-loop task. */
  private readonly pendingInvalidations = new Set<string>();

  /** Coalescing entry point for QueryHandler.subscribe channels. */
  private invalidateSubscription(subscriptionId: string): void {
    if (this.closed) {
      return;
    }
    // Only the FIRST adder to an empty set enqueues the drain task; later
    // adds ride along and drain together. Enqueueing on every call would
    // flood the writer loop with one task per change signal.
    const schedule = this.pendingInvalidations.size === 0;
    this.pendingInvalidations.add(subscriptionId);
    if (!schedule) {
      return;
    }
    void this.enqueue(async () => {
      const ids = [...this.pendingInvalidations];
      this.pendingInvalidations.clear();
      for (const id of ids) {
        for (const connection of this.connections.values()) {
          for (const subscription of connection.subscriptions()) {
            if (subscription.id === id) {
              try {
                const nextRows = await this.runQuery(subscription);
                // A push source can change data OUT OF BAND — nothing wrote the
                // sync log, so this.lastSeq still names the old state. A delta
                // stamped with it would be refused by every client's
                // stale-delta guard (`delta.seq <= lastDeltaSeq`) and the
                // change would be invisible. Mint one external seq for the
                // changed result BEFORE emitting. The synthetic row carries an
                // EMPTY touched list: it mints ordering only, so recording a
                // push never re-triggers watcher re-runs — the diff below is
                // the sole emission, no feedback loop.
                if (this.rowsDiffer(subscription.lastRows, nextRows)) {
                  this.lastSeq = await this.backend.recordExternalChange({
                    mutationId: this.idGen.newId('m'),
                    mutationName: `push:${subscription.binding.name}`,
                    actor: 'system:push',
                    clientId: 'server:push',
                    committedMs: this.clock.now(),
                    touched: []
                  });
                }
                this.diffAndEmit(connection, subscription, nextRows);
                this.recoverQuery(connection, subscription);
              } catch (error) {
                this.failQueryRerun(connection, subscription, error);
              }
            }
          }
        }
      }
      this.emitCheckpoint();
    });
  }

  /** Whether two keyed result sets differ (membership or any row's canonical form). */
  private rowsDiffer(
    previous: Map<string, { row: DbRow; canonical: string }>,
    next: Map<string, { row: DbRow; canonical: string }>
  ): boolean {
    if (previous.size !== next.size) return true;
    if (!this.sameOrder(previous, next)) return true;
    for (const [id, entry] of next) {
      const before = previous.get(id);
      if (!before || before.canonical !== entry.canonical) return true;
    }
    return false;
  }

  private sameOrder(
    previous: ReadonlyMap<string, unknown>,
    next: ReadonlyMap<string, unknown>
  ): boolean {
    if (previous.size !== next.size) return false;
    const previousIds = previous.keys();
    const nextIds = next.keys();
    for (;;) {
      const previousId = previousIds.next();
      const nextId = nextIds.next();
      if (previousId.done || nextId.done) return previousId.done === nextId.done;
      if (previousId.value !== nextId.value) return false;
    }
  }

  private publicQueryError(_error: unknown): SyncQueryError {
    return {
      code: 'query_error',
      message: 'The live query failed.'
    };
  }

  private logQueryFailure(subscription: Subscription, error: unknown, phase: 'initial' | 'rerun'): void {
    logger.error('wheel: live query failed', {
      phase,
      workspaceId: subscription.principal.workspaceId,
      query: subscription.binding.name,
      params: subscription.params,
      subscriptionId: subscription.id
    }, error);
  }

  private emitQueryStatus(
    connection: ConnectionImpl,
    subscription: Subscription,
    status: SyncQueryStatus
  ): void {
    subscription.status = status;
    connection.emit({
      type: 'query_status',
      status: {
        subscriptionId: subscription.id,
        query: subscription.binding.name,
        seq: this.lastSeq,
        status
      }
    });
  }

  private failQueryRerun(
    connection: ConnectionImpl,
    subscription: Subscription,
    error: unknown
  ): void {
    const detail = this.publicQueryError(error);
    const status: SyncQueryStatus = subscription.status.kind === 'error'
      ? { kind: 'error', error: detail }
      : { kind: 'stale', error: detail };
    this.logQueryFailure(subscription, error, 'rerun');
    this.emitQueryStatus(connection, subscription, status);
  }

  private recoverQuery(connection: ConnectionImpl, subscription: Subscription): void {
    if (subscription.status.kind !== 'live') {
      this.emitQueryStatus(connection, subscription, { kind: 'live' });
    }
  }

  private emitCheckpoint(): void {
    for (const connection of this.connections.values()) {
      connection.emit({ type: 'checkpoint', seq: this.lastSeq });
    }
  }

  /** Validate + freeze + key one query's raw rows — the boundary net: no row reaches a client unvalidated. */
  private keyRows(binding: ServeQueryBinding, rawRows: readonly DbRow[]): Map<string, { row: DbRow; canonical: string }> {
    const table = binding.query.into;
    const keyed = new Map<string, { row: DbRow; canonical: string }>();
    const firstIndexes = new Map<string, number>();
    for (const [index, raw] of rawRows.entries()) {
      const row = validateRow(`query ${binding.name}`, table.schema, raw);
      const frozen = Object.freeze(row);
      const key = validateTableKey(table, frozen, `Query "${binding.name}" row ${index}`);
      const firstIndex = firstIndexes.get(key);
      if (firstIndex !== undefined) {
        throw new SyncServerError(
          'duplicate_row_key',
          `Query "${binding.name}" returned duplicate key ${JSON.stringify(key)} for table "${table.name}" at rows ${firstIndex} and ${index}.`
        );
      }
      firstIndexes.set(key, index);
      keyed.set(key, { row: frozen, canonical: canonicalParams(frozen) });
    }
    return keyed;
  }

  private async runQuery(subscription: Subscription): Promise<Map<string, { row: DbRow; canonical: string }>> {
    const started = this.clock.now();
    const handler = subscription.binding.handler;
    const context = {
      query: this.backend.reader.query.bind(this.backend.reader),
      principal: subscription.principal
    };
    // SQL-descriptor handlers take the direct read path; generic handlers run
    // through their own backend with the engine's read-only reader.
    const rawRows = handler.sql
      ? await this.backend.reader.query(handler.sql(subscription.params, subscription.principal))
      : await handler.run(subscription.params, context);
    const keyed = this.keyRows(subscription.binding, rawRows as readonly DbRow[]);
    subscription.runs += 1;
    subscription.lastRunMs = this.clock.now() - started;
    return keyed;
  }

  /** Run one atomic mutation command through the writer loop. */
  async mutateGroup(request: MutateGroupRequest, principal: AuthPrincipal): Promise<MutateResult> {
    // Pre-validation verdicts are VALUES, not throws (see MutateResult's
    // doctrine): the server definitively refuses this request and would
    // refuse it identically on every retry.
    const fail = (code: string, message: string): MutateResult => ({
      ok: false,
      error: { kind: 'error', code, message }
    });
    if (!isValidId(request.mutationId, 'm')) {
      return fail('invalid_mutation_id', `Mutation id ${JSON.stringify(request.mutationId)} is not a valid m_<uuidv7>.`);
    }
    if (request.calls.length === 0) {
      return fail('empty_mutation_group', 'A mutation group must contain at least one member.');
    }
    if (request.calls.length > 128) {
      return fail('group_too_large', 'A mutation group may contain at most 128 members.');
    }

    const prepared: Array<{
      binding: ServeMutationBinding;
      args: Record<string, unknown>;
      ids: readonly string[];
    }> = [];
    for (const call of request.calls) {
      const binding = this.registry.mutationBindings.get(call.name) as ServeMutationBinding | undefined;
      const decl = this.registry.mutations.get(call.name);
      if (!binding || !decl) {
        return fail('unknown_mutation', `No mutation named "${call.name}" is registered.`);
      }
      for (const id of call.ids) {
        if (!isValidId(id)) {
          return fail('invalid_id', `Pre-generated id ${JSON.stringify(id)} is not a valid prefixed UUIDv7.`);
        }
      }
      try {
        validateJsonValue(`Args for mutation "${call.name}"`, call.args);
      } catch (error) {
        if (error instanceof JsonValueError) return fail('invalid_args', error.message);
        throw error;
      }
      const parsed = decl.args.safeParse(call.args);
      if (!parsed.success) {
        return fail(
          'invalid_args',
          `Args for mutation "${call.name}" are invalid: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`
        );
      }
      if (!jsonParseIsIdentity(call.args, parsed.data)) {
        return fail(
          'invalid_args',
          `Args for mutation "${call.name}" contain fields or parse-time normalization outside its JSON Schema contract.`
        );
      }
      prepared.push({ binding, args: parsed.data, ids: call.ids });
    }

    const timing = liveTimingEnabled();
    const queuedAt = timing ? monotonicNow() : 0;
    return this.enqueue(async () => {
      const startedAt = timing ? monotonicNow() : 0;
      // A normal outbox replay never enters the handler. The catch-path below
      // remains for the commit/ack race and for a second process that committed
      // between this lookup and the unique log insert.
      const alreadyCommitted = await this.backend.findCommitted(request.mutationId);
      if (alreadyCommitted) {
        return { ok: true as const, seq: alreadyCommitted.seq };
      }
      const backendCalls: BackendMutationCall[] = prepared.map((call) => {
        let nextId = 0;
        const ctx: ServerMutationCtx = {
          mutationId: request.mutationId,
          clientId: request.clientId,
          actor: principal.actor,
          workspaceId: principal.workspaceId,
          sessionId: principal.sessionId,
          now: () => this.clock.now(),
          newId: (prefix: string) => {
            const id = call.ids[nextId++];
            if (id === undefined) {
              throw new SyncServerError(
                'id_stream_exhausted',
                `Mutation "${call.binding.name}" asked for more ids than the client pre-generated ` +
                  `for this group member (${call.ids.length}).`
              );
            }
            if (!id.startsWith(`${prefix}_`)) {
              throw new SyncServerError(
                'id_stream_mismatch',
                `Mutation "${call.binding.name}" id #${nextId} has prefix "${id.split('_')[0]}" but the server asked for "${prefix}".`
              );
            }
            return id;
          }
        };
        return {
          binding: call.binding,
          args: call.args,
          ctx,
          assertIdsConsumed: () => {
            if (nextId !== call.ids.length) {
              throw new SyncServerError(
                'id_stream_unused',
                `Mutation "${call.binding.name}" consumed ${nextId} of ${call.ids.length} deterministic ids.`
              );
            }
          }
        };
      });

      let result;
      try {
        // The backend runs the handler + appends the sync-log record
        // atomically, and (for echo-capable backends) records the self-echo
        // marker before this resolves (conformance rule 5).
        result = await this.backend.runMutation(backendCalls);
      } catch (error) {
        // Exactly-once replay: the outbox may re-send a mutation whose commit
        // landed but whose ack was lost (crash between commit and outbox
        // removal). The backend's mutationId uniqueness rolled this attempt
        // back; report the ORIGINAL commit as success so replay is idempotent.
        const existing = await this.backend.findCommitted(request.mutationId);
        if (existing) {
          return { ok: true as const, seq: existing.seq };
        }
        // Transient infrastructure failures (connection died mid-txn, the
        // backend is re-acquiring) stay THROWN — the transport maps them to
        // "retry later". Everything else is THIS mutation breaking the handler:
        // a terminal, typed verdict (see MutateResult).
        if (this.backend.isTransientError(error)) {
          throw error;
        }
        return fail(
          error instanceof SyncServerError ? error.code : 'handler_error',
          String((error as Error)?.message ?? error)
        );
      }
      // A domain rejection is a clean rollback + typed verdict, not an error.
      if (!result.ok) {
        return { ok: false as const, rejection: result.rejection };
      }
      const committedAt = timing ? monotonicNow() : 0;
      this.lastSeq = result.seq;
      const rerun = await this.rerunWatchers([...result.touched], result.images);
      if (timing) {
        const finishedAt = monotonicNow();
        // wheel-console: WHEEL_TIMING=1 diagnostics print to the server process stdout
        console.log(
          `[live-timing] mutateGroup [${request.calls.map((call) => call.name).join(', ')}] ` +
            `queueWait=${formatMs(startedAt - queuedAt)} ` +
            `txn=${formatMs(committedAt - startedAt)} ${formatRerun(rerun)} ` +
            `total=${formatMs(finishedAt - queuedAt)}`
        );
      }
      return { ok: true as const, seq: result.seq };
    });
  }

  /**
   * Ingest a write that happened OUTSIDE the engine — the legacy store during
   * the migration's coexistence window, a background job, or any same-database
   * script. Records one sync_log row (ordering + audit) naming the touched
   * tables, then re-runs watching subscriptions exactly like a committed
   * mutation. External writes carry no optimistic state; clients see them as
   * server-authored changes. The single-writer lock still holds: this runs on
   * the writer loop.
   */
  externalWrite(input: { tables: readonly string[]; source?: string; actor?: string }): Promise<number> {
    const tables = [...new Set(input.tables)];
    if (tables.length === 0) {
      return Promise.resolve(this.lastSeq);
    }
    return this.enqueue(() => this.ingestExternal({ tables, source: input.source, actor: input.actor }));
  }

  /** Shared ingestion body for externalWrite/onExternalChange — MUST run on the writer loop: one sync_log row naming the touched tables, then watcher re-runs. */
  private async ingestExternal(input: { tables: readonly string[]; source?: string; actor?: string }): Promise<number> {
    const timing = liveTimingEnabled();
    const startedAt = timing ? monotonicNow() : 0;
    const seq = await this.backend.recordExternalChange({
      mutationId: this.idGen.newId('m'),
      mutationName: input.source ?? 'external.write',
      actor: input.actor ?? 'system:external',
      clientId: 'server:external',
      committedMs: this.clock.now(),
      touched: input.tables
    });
    this.lastSeq = seq;
    const rerun = await this.rerunWatchers([...input.tables]);
    if (timing) {
      // wheel-console: WHEEL_TIMING=1 diagnostics print to the server process stdout
      console.log(
        `[live-timing] external ${input.source ?? 'external.write'} ${formatRerun(rerun)} total=${formatMs(monotonicNow() - startedAt)}`
      );
    }
    return seq;
  }

  /**
   * Re-run every subscription watching a touched table; emit whole-row diffs.
   * Runs inside the writer loop, AFTER the mutation committed. All distinct
   * queries go through the backend's batched read (runQueries) in one pass — so
   * the rerun costs ~one round trip of wall time no matter how many
   * subscriptions are watching; identical query+params pairs (two tabs on the
   * same list) execute once and share the result.
   */
  private async rerunWatchers(
    touched: string[],
    images?: readonly RowImage[] | 'overflow'
  ): Promise<RerunStats> {
    const stats: RerunStats = { ms: 0, queries: [] };
    if (touched.length === 0) {
      this.emitCheckpoint();
      return stats;
    }
    const touchedSet = new Set(touched);
    const targets: Array<{ connection: ConnectionImpl; subscription: Subscription }> = [];
    for (const connection of this.connections.values()) {
      for (const subscription of connection.subscriptions()) {
        const handler = subscription.binding.handler;
        const dependencies = subscription.binding.query.dependsOn;
        if (!dependencies.some((table) => touchedSet.has(table))) {
          continue;
        }
        // Tier-1 pruning: with row images available and a prune predicate on
        // the handler, skip the re-run unless some touched image passes.
        // Images absent or overflowed -> always re-run (correctness never
        // depends on pruning).
        if (handler.prune && Array.isArray(images)) {
          const relevant = images.some(
            (image) =>
              dependencies.includes(image.t) &&
              handler.prune!(image, subscription.params, subscription.principal)
          );
          if (!relevant) {
            continue;
          }
        }
        targets.push({ connection, subscription });
      }
    }
    if (targets.length === 0) {
      this.emitCheckpoint();
      return stats;
    }

    const startedAt = monotonicNow();
    // Partition: SQL-descriptor handlers batch through one read pass; generic
    // handlers run individually after.
    const sqlTargets = targets.filter(({ subscription }) => subscription.binding.handler.sql !== undefined);
    const genericTargets = targets.filter(({ subscription }) => subscription.binding.handler.sql === undefined);

    const groups = new Map<string, { subscriptions: Subscription[] }>();
    for (const { subscription } of sqlTargets) {
      const group = groups.get(subscription.canonicalKey);
      if (group) {
        group.subscriptions.push(subscription);
        continue;
      }
      groups.set(subscription.canonicalKey, { subscriptions: [subscription] });
    }
    const nextBySubscription = new Map<Subscription, Map<string, { row: DbRow; canonical: string }>>();
    const failures = new Map<Subscription, unknown>();
    const ordered: Array<{ source: SqlFragment; subscriptions: Subscription[] }> = [];
    for (const group of groups.values()) {
      const subscription = group.subscriptions[0]!;
      try {
        ordered.push({
          source: subscription.binding.handler.sql!(subscription.params, subscription.principal),
          subscriptions: group.subscriptions
        });
      } catch (error) {
        for (const member of group.subscriptions) failures.set(member, error);
      }
    }

    const acceptSqlResult = (
      group: { source: SqlFragment; subscriptions: Subscription[] },
      rows: readonly DbRow[]
    ): void => {
      try {
        const keyed = this.keyRows(group.subscriptions[0]!.binding, rows);
        stats.queries.push({
          query: group.subscriptions[0]!.binding.name,
          rows: keyed.size,
          subscribers: group.subscriptions.length
        });
        for (const subscription of group.subscriptions) nextBySubscription.set(subscription, keyed);
      } catch (error) {
        for (const subscription of group.subscriptions) failures.set(subscription, error);
      }
    };

    if (ordered.length > 0) {
      try {
        const resultSets = await this.readMany(ordered);
        ordered.forEach((group, index) => acceptSqlResult(group, resultSets[index] ?? []));
      } catch {
        for (const group of ordered) {
          try {
            const [rows = []] = await this.readMany([group]);
            acceptSqlResult(group, rows);
          } catch (error) {
            for (const subscription of group.subscriptions) failures.set(subscription, error);
          }
        }
      }
    }

    for (const { subscription } of genericTargets) {
      try {
        const keyed = await this.runQuery(subscription);
        stats.queries.push({ query: subscription.binding.name, rows: keyed.size, subscribers: 1 });
        nextBySubscription.set(subscription, keyed);
      } catch (error) {
        failures.set(subscription, error);
      }
    }
    const elapsedMs = monotonicNow() - startedAt;
    for (const { subscription } of sqlTargets) {
      subscription.runs += 1;
      subscription.lastRunMs = elapsedMs;
    }
    stats.ms = elapsedMs;

    // Diff + emit in the original connection/subscription order — delta
    // ordering on the wire is unchanged from the sequential implementation.
    for (const { connection, subscription } of targets) {
      if (failures.has(subscription)) {
        this.failQueryRerun(connection, subscription, failures.get(subscription));
        continue;
      }
      const nextRows = nextBySubscription.get(subscription);
      if (!nextRows) continue;
      this.diffAndEmit(connection, subscription, nextRows);
      this.recoverQuery(connection, subscription);
    }
    this.emitCheckpoint();
    return stats;
  }

  /** Batched reads through the backend's fast path, or a sequential fallback when it has none. */
  private async readMany(groups: ReadonlyArray<{ source: SqlFragment }>): Promise<DbRow[][]> {
    const queries = groups.map((group) => group.source);
    if (this.backend.runQueries) {
      return this.backend.runQueries(queries);
    }
    const results: DbRow[][] = [];
    for (const query of queries) {
      results.push((await this.backend.reader.query(query)) as DbRow[]);
    }
    return results;
  }

  /** Diff a subscription's fresh rows against its last result; emit a delta only if something changed. */
  private diffAndEmit(
    connection: ConnectionImpl,
    subscription: Subscription,
    nextRows: Map<string, { row: DbRow; canonical: string }>
  ): void {
    const puts: DbRow[] = [];
    const deletes: string[] = [];
    for (const [id, entry] of nextRows) {
      const previous = subscription.lastRows.get(id);
      if (!previous || previous.canonical !== entry.canonical) {
        puts.push(entry.row);
      }
    }
    for (const id of subscription.lastRows.keys()) {
      if (!nextRows.has(id)) {
        deletes.push(id);
      }
    }
    const orderChanged = !this.sameOrder(subscription.lastRows, nextRows);
    subscription.lastRows = nextRows;
    subscription.lastSeq = this.lastSeq;
    if (puts.length > 0 || deletes.length > 0 || orderChanged) {
      connection.emit({
        type: 'delta',
        delta: {
          subscriptionId: subscription.id,
          query: subscription.binding.name,
          seq: this.lastSeq,
          puts,
          deletes,
          order: [...nextRows.keys()]
        }
      });
    }
  }

  /** Every live subscription with params, dependencies, handler kind, and run stats. */
  debugSubscriptions(): SubscriptionDebugInfo[] {
    const infos: SubscriptionDebugInfo[] = [];
    for (const connection of this.connections.values()) {
      for (const subscription of connection.subscriptions()) {
        infos.push({
          id: subscription.id,
          clientId: subscription.clientId,
          query: subscription.binding.name,
          params: subscription.params,
          dependsOn: subscription.binding.query.dependsOn,
          handlerKind: subscription.binding.handler.kind,
          rows: subscription.lastRows.size,
          lastSeq: subscription.lastSeq,
          status: subscription.status,
          runs: subscription.runs,
          lastRunMs: subscription.lastRunMs
        });
      }
    }
    return infos;
  }

  /**
   * The exactly-once lookup: has this mutationId already committed? Delegates
   * to the backend; kept on the engine surface for callers that check
   * idempotency directly.
   */
  findCommitted(mutationId: string): Promise<{ seq: number } | null> {
    return this.backend.findCommitted(mutationId);
  }

  /**
   * Drain the loop and close every resource the server owns. Idempotent:
   * callers racing shutdown share one promise and the backend closes once.
   */
  close(): Promise<void> {
    this.closePromise ??= this.closeOwnedResources();
    return this.closePromise;
  }

  private async closeOwnedResources(): Promise<void> {
    this.closed = true;
    for (const connection of [...this.connections.values()]) {
      connection.close();
    }
    await this.queue.catch(() => {});
    const errors: unknown[] = [];

    const releaseExternal = this.releaseExternal;
    this.releaseExternal = null;
    try {
      releaseExternal?.();
    } catch (error) {
      errors.push(error);
    }

    const releaseWriterLease = this.releaseWriterLease;
    this.releaseWriterLease = null;
    try {
      await releaseWriterLease?.();
    } catch (error) {
      errors.push(error);
    }

    try {
      await this.backend.close();
    } catch (error) {
      errors.push(error);
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'SyncServer failed to close one or more owned resources.');
    }
  }
}

class ConnectionImpl implements SyncConnection {
  /** Current ephemeral presence (null = none); broadcast-managed by the server. */
  presence: PresenceState | null = null;
  private readonly subs = new Map<string, Subscription>();
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private closed = false;

  constructor(
    private readonly server: SyncServer,
    public readonly clientId: string,
    public readonly principal: AuthPrincipal
  ) {}

  subscriptions(): Iterable<Subscription> {
    return this.subs.values();
  }

  addSubscription(subscription: Subscription): void {
    this.subs.set(subscription.id, subscription);
  }

  subscribe(queryName: string, params: unknown): Promise<Snapshot> {
    if (this.closed) {
      return Promise.reject(new SyncServerError('connection_closed', `Connection "${this.clientId}" is closed.`));
    }
    return this.server.runSubscribe(this, queryName, params);
  }

  unsubscribe(subscriptionId: string): void {
    this.subs.get(subscriptionId)?.unsubscribeHandler?.();
    this.subs.delete(subscriptionId);
  }

  onEvent(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  state(): SyncConnectionState {
    return {
      clientId: this.clientId,
      principal: this.principal,
      presence: this.presence,
      subscriptions: [...this.subs.values()].map((subscription) => ({
        id: subscription.id,
        query: subscription.binding.name,
        params: subscription.params
      }))
    };
  }

  /** Restore presence without broadcasting; peer clients kept it while their sockets hibernated. */
  restorePresence(state: PresenceState | null): void {
    this.presence = state;
  }

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const subscription of this.subs.values()) {
      subscription.unsubscribeHandler?.();
    }
    this.subs.clear();
    this.listeners.clear();
    this.server.dropConnection(this.clientId);
  }
}

/** Boot the engine: registry cross-check, writer lease, backend install (sync log + tracking), external-change feed, then the writer loop. */
export async function createSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  return SyncServer.create(options);
}
