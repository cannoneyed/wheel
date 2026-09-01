/**
 * The complete database seam used by the sync engine.
 *
 * Current implementations target in-process SQLite and Durable Object SQLite.
 * A backend must keep these guarantees:
 *
 * 1. Commit each mutation and its sync-log row in one transaction.
 * 2. Mint increasing sequence numbers.
 * 3. Enforce unique mutation ids for exactly-once outbox replay.
 * 4. Preserve the client-provided deterministic id stream.
 * 5. Report foreign writes through `onExternalChange`, if it supports them.
 * 6. Do not report its own writes as foreign writes.
 */
import type { MutationRejection } from '../declarations';
import type { RowSchema } from '../schema';
import type { DbRow } from '../protocol';
import type { SqlFragment } from '../sql';
import type { QueryReader, RowImage } from './query-handler';
import type { ServeMutationBinding, ServerMutationCtx } from './serve';

/**
 * Result of an atomic mutation application. `ok: true` carries the minted seq,
 * the tables the handler touched (drives watcher re-runs), and — when the
 * backend captures them (Tier-1 pruning) — the per-row before/after images or
 * the `'overflow'` sentinel. `ok: false` is a domain REJECTION the handler
 * raised (`rejection(...)`), rolled back cleanly — NOT an error. Every other
 * failure (duplicate mutationId, connection death, a handler exception, an
 * id-stream violation) is THROWN so the engine can classify it (exactly-once
 * vs transient vs terminal).
 */
export type BackendMutateResult =
  | {
      readonly ok: true;
      readonly seq: number;
      readonly touched: readonly string[];
      readonly images?: readonly RowImage[] | 'overflow';
    }
  | { readonly ok: false; readonly rejection: MutationRejection };

/** One validated member ready to run inside a backend-owned transaction. */
export interface BackendMutationCall {
  readonly binding: ServeMutationBinding;
  readonly args: Record<string, unknown>;
  readonly ctx: ServerMutationCtx;
  /** Fails inside the transaction when the handler consumed too few deterministic IDs. */
  readonly assertIdsConsumed: () => void;
}

/** Backend install options — mirrors the engine's DB-shaped `createSyncServer` options. */
export interface SyncBackendInitOptions {
  /**
   * Install row-image capture (per-row before/after images per write) so
   * handlers with a `prune` predicate can skip provably-irrelevant re-runs.
   * Off by default; adds per-row write cost. A backend that cannot capture
   * images ignores this and never returns `images` from `runMutation`
   * (correctness never depends on images — absent images always re-run).
   */
  readonly rowImages?: boolean;
  /**
   * The zod row schema for each physical table named by query dependencies.
   * A backend whose storage drifts from what the schemas validate uses these to
   * REPAIR rows at the read seam before they reach the engine's `validateRow`
   * gate — the SQLite backend turns its integer 0/1 back into real booleans this
   * way (SQLite has no boolean type). A backend whose driver already returns
   * schema-shaped values can ignore this. The engine populates it at boot from
   * the registry; a backend that never needs it
   * may be booted without it.
   */
  readonly tableSchemas?: ReadonlyMap<string, RowSchema>;
}

/**
 * One sync-log record for a change the engine DID NOT author — an external
 * write (legacy store / CLI / job) or a push-source invalidation minting
 * ordering only. The engine supplies the fields it owns (a fresh deterministic
 * mutationId, the wall clock, provenance strings); the backend appends the row
 * and returns its seq. `touched` may be empty (push sources mint a seq without
 * re-triggering watchers — the engine does its own diff).
 */
export interface ExternalChangeRecord {
  /** Fresh unique mutation id (engine's deterministic idGen) — the log's uniqueness key. */
  readonly mutationId: string;
  /** Provenance label stored as the log's mutation_name (e.g. `legacy:test`, `wal:commit`, `push:todos.byList`). */
  readonly mutationName: string;
  /** Who/what authored the change (e.g. `system:external`, `system:push`). */
  readonly actor: string;
  /** Synthetic client id for the log row (e.g. `server:external`, `server:push`). */
  readonly clientId: string;
  /** Commit wall-clock ms (engine's injected clock). */
  readonly committedMs: number;
  /** Tables the change touched — drives watcher re-runs. May be empty (push: ordering only). */
  readonly touched: readonly string[];
}

/**
 * The whole-database adapter the engine drives. All members run on (or are
 * awaited by) the engine's single writer loop unless noted; a backend never
 * needs its own concurrency control for correctness.
 */
export interface SyncBackend {
  /**
   * Install change-tracking (the sync log + per-table write-tracking triggers,
   * plus row-image triggers when `options.rowImages`) for exactly `tables`
   * (the physical names derived from query dependencies), idempotently, and return the current
   * max committed seq so the engine resumes numbering. Called once at boot,
   * AFTER `acquireWriterLease` (install must not race a second writer).
   */
  init(tables: readonly string[], options: SyncBackendInitOptions): Promise<{ lastSeq: number }>;

  /**
   * Acquire the exclusive-writer lease — "one workspace, one writer" — and
   * resolve with its release function. Must REJECT (or throw) if another live
   * server already holds it (the engine turns that into a
   * `single_writer_violation`). A backend where single-writer is a platform
   * fact, such as a Durable Object, returns a
   * no-op release. Called once at boot, BEFORE `init`; the release is invoked
   * exactly once on `close`.
   */
  acquireWriterLease(): Promise<() => Promise<void>>;

  /**
   * Atomically, as ONE transaction: run the mutation handler (against a
   * transaction-scoped SQL session the backend provides), append the sync-log
   * record reading the touched-tables the handler's writes accumulated, and
   * return `{ ok, seq, touched, images }`. Conformance rules 1–5 all land here:
   * atomic commit, monotonic seq, mutationId-unique (throw on duplicate so the
   * engine can consult `findCommitted`), `ctx.newId` consumed in handler order,
   * and — for echo-capable backends — the self-echo marker recorded BEFORE this
   * resolves (rule 5). A handler `rejection(...)` is caught and returned as
   * `{ ok: false, rejection }` (clean rollback, a domain verdict); EVERY other
   * failure is thrown.
   */
  runMutation(calls: readonly BackendMutationCall[]): Promise<BackendMutateResult>;

  /**
   * Has this mutationId already committed? Returns its ORIGINAL seq or null.
   * The engine calls this after `runMutation` throws to make outbox replay
   * idempotent (rule 3): a mutation whose commit landed but whose ack was lost
   * re-sends, hits the uniqueness constraint, and this reports the first commit
   * as success instead of an error.
   */
  findCommitted(mutationId: string): Promise<{ seq: number } | null>;

  /**
   * Append ONE sync-log record for a change the engine did not author (external
   * write or push-source seq mint) and return its minted seq. Always inserts —
   * even with empty `touched` (push sources mint ordering only). Monotonic-seq
   * (rule 2) applies exactly as for mutations.
   */
  recordExternalChange(input: ExternalChangeRecord): Promise<number>;

  /**
   * Read session for query re-runs: a `QueryHandlerCtx` whose `query` returns
   * committed rows. Used for generic query handlers and as the single-query
   * fallback when `runQueries` is absent. Reads must see only committed state
   * (never an open transaction's uncommitted window).
   *
   * DIALECT (every backend's job): a sql`` fragment arrives UNCOMPILED, and
   * the backend compiles it with `compileSql(fragment)`. Raw text is already
   * written for SQLite and goes to the driver
   * verbatim. A backend never rewrites SQL it did not compile.
   */
  readonly reader: QueryReader;

  /**
   * Optional batched-read fast path: run independent READ queries with ~one
   * round trip of total latency (concurrent pooled reads on a wire driver;
   * sequential in-process), results in input order. The engine's watcher-rerun
   * pass uses it to collapse many subscriptions into one round trip; a backend
   * that omits it falls back to `reader.query` per query (correct, just serial).
   * Queries arrive as uncompiled fragments — the backend compiles them.
   */
  runQueries?(queries: readonly SqlFragment[]): Promise<DbRow[][]>;

  /**
   * Register a listener for writes the engine did not author. The
   * backend calls `listener(touched)` once per observed foreign commit, naming
   * the tables it touched; the engine mints a seq (`recordExternalChange`) and
   * re-runs watchers on its writer loop. Returns an unsubscribe. Current
   * SQLite backends never fire it. A future change-feed backend filters its
   * own writes before it calls the listener.
   */
  onExternalChange(listener: (touched: readonly string[]) => void): () => void;

  /**
   * Is this failure TRANSIENT infrastructure (connection death, the backend
   * mid-recovery) rather than a terminal logic error? Transient failures stay
   * THROWN so the transport retries them as "offline"; everything else becomes
   * a typed, terminal `MutateResult` error. Never conflate a dead connection
   * with a broken handler — the former retries forever, the latter must fail
   * loudly and stay failed.
   */
  isTransientError(error: unknown): boolean;

  /** Close the backend's resources (connections/pool). The writer lease is released separately via the function `acquireWriterLease` returned. */
  close(): Promise<void>;
}
