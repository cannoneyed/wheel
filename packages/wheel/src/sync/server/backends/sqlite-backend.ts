/**
 * SqliteSyncBackend — the in-process `SqliteDriver`-backed `SyncBackend`, and
 * the default backend's implementation. The engine owns its SQLite database
 * in-process, so this backend is small. `acquireWriterLease` enforces one engine per database
 * identity inside the process (and on Durable Objects one object owns one database),
 * `isTransientError` is always false (no connection to die), and the whole
 * mutation path is one synchronous transaction on one connection.
 *
 * Dialect: app server bindings targeting this backend write SQLite SQL. A
 * sql`` fragment arrives UNCOMPILED, and this backend compiles it —
 * `compileSql(fragment)` writes positional `?`. Nothing rewrites
 * already-compiled SQL, so a placeholder is only ever written once, by the
 * backend that owns the database.
 *
 * Type parity across drivers is handled one layer down, in `SqliteDriver`
 * (`coerceRows`/`coerceParams`): both bun:sqlite and better-sqlite3 return
 * identical typed rows, which is what lets the better-sqlite3 conformance run
 * stand in for the bun:sqlite production run.
 *
 * NOT YET IMPLEMENTED — row images (Tier-1 pruning): capturing per-row
 * before/after images needs each table's COLUMN list (to codegen
 * `json_object(...)` in the triggers), which `init` does not receive (it gets
 * table NAMES only). The interface explicitly allows a backend to ignore
 * `rowImages` and never return images — the engine then always re-runs watchers
 * (correctness never depends on images). The column-aware touch/image codegen is
 * tracked as follow-up work; until then Tier-1 pruning is a no-op here.
 */
import { resolve } from 'node:path';

import { RejectionError } from '../../declarations';
import type { Clock } from '../../ids';
import { compileSql, sql as sqlTag, type SqlFragment } from '../../sql';
import type { DbRow } from '../../protocol';
import { SyncServerError } from '../errors';
import type { QueryReader } from '../query-handler';
import type { ServerTx } from '../serve';
import type { BackendMutateResult, BackendMutationCall, ExternalChangeRecord, SyncBackend, SyncBackendInitOptions } from '../sync-backend';
import {
  CREATE_SYNC_LOG,
  CREATE_TOUCHED_TABLE,
  READ_TOUCHED,
  RESET_TOUCHED,
  SYNC_LOG_INSERT,
  SYNC_LOG_TABLE,
  createTouchTriggers
} from './sqlite-bootstrap';
import { applyCoercion, buildCoercionMap, type CoercionMap } from './sqlite-coerce';
import { bunSqliteDriver, type SqliteDriver, type SqliteRow } from './sqlite-driver';

export { toSqlitePlaceholders } from './sqlite-placeholders';

/** What `SqliteSyncBackend` needs: a driver (default bun:sqlite) and the engine's injected clock (stamps `sync_log.committed_ms`). */
export interface SqliteSyncBackendOptions {
  /** The SQLite driver. Inject `betterSqlite3Driver` under Node/vitest; omitted → the default `bun:sqlite` driver (production / Durable Objects model). */
  driver?: SqliteDriver;
  /** Database file when no driver is injected (default `:memory:`). Cannot be combined with `driver`. */
  filename?: string;
  /**
   * Stable identity for the underlying database. Driver object identity is the
   * default for injected drivers; provide this when separate wrappers share a
   * database.
   */
  databaseId?: string;
  /** Injected wall clock (the engine's) — stamps `sync_log.committed_ms`. */
  clock: Clock;
}

type SqliteWriterKey = string | SqliteDriver | symbol;
const activeSqliteWriters = new Set<SqliteWriterKey>();

function writerKey(options: SqliteSyncBackendOptions): SqliteWriterKey {
  if (options.databaseId !== undefined) {
    const id = options.databaseId.trim();
    if (id === '') {
      throw new SyncServerError('invalid_backend_config', 'SQLite databaseId must not be empty.');
    }
    return `database:${id}`;
  }
  if (options.driver) {
    return options.driver;
  }
  const filename = options.filename ?? ':memory:';
  return filename === ':memory:' ? Symbol('sqlite-memory') : `file:${resolve(filename)}`;
}

/**
 * The SQLite `SyncBackend`. Construct with `createSqliteSyncBackend`. All
 * members run on (or are awaited by) the engine's single writer loop, so this
 * backend keeps no concurrency control of its own.
 */
export class SqliteSyncBackend implements SyncBackend {
  private readonly driver: SqliteDriver;
  private readonly clock: Clock;
  private readonly writerKey: SqliteWriterKey;
  private writerLeaseHeld = false;
  private closed = false;
  /**
   * Schema-driven read-side type repair (column name → coercer), built at `init`
   * from the declared table schemas. Turns SQLite's integer 0/1 back into real
   * booleans (and driver-narrowed numbers back into bigints) so rows pass the
   * engine's `validateRow` gate. Empty until `init`; empty forever when the
   * backend is booted without schemas (raw SQLite types flow through unchanged).
   */
  private coercion: CoercionMap = new Map();

  constructor(options: SqliteSyncBackendOptions) {
    if (options.driver && options.filename !== undefined) {
      throw new SyncServerError(
        'invalid_backend_config',
        'SQLite `driver` and `filename` cannot be combined. The injected driver already selects its database.'
      );
    }
    this.driver = options.driver ?? bunSqliteDriver(options.filename);
    this.clock = options.clock;
    this.writerKey = writerKey(options);
  }

  /**
   * Run one statement and repair schema-driven type drift (0/1 → booleans).
   * A sql`` fragment is compiled HERE, in this backend's dialect; raw text is
   * already SQLite and goes to the driver verbatim.
   */
  private read(source: SqlFragment | string, params?: readonly unknown[]): SqliteRow[] {
    const compiled = typeof source === 'string' ? { text: source, params: params ?? [] } : compileSql(source);
    return applyCoercion(this.driver.all(compiled.text, compiled.params), this.coercion);
  }

  /** Read session for query re-runs: read-only, committed-state `query`. */
  readonly reader: QueryReader = {
    query: (source: SqlFragment | string, params?: readonly unknown[]) =>
      Promise.resolve(this.read(source, params) as Record<string, unknown>[])
  };

  /**
   * Install the sync log, the touch scratch table, and per-table touch
   * triggers; return the current max seq. `options.rowImages` is intentionally
   * ignored (see the module doc — row-image capture is not yet implemented and
   * the engine falls back to always re-running).
   */
  async init(tables: readonly string[], options: SyncBackendInitOptions): Promise<{ lastSeq: number }> {
    void options.rowImages;
    // Read-side type repair: SQLite has no boolean (stores 0/1) and the driver
    // narrows bigints to number, so a row would fail the engine's validateRow
    // gate. Build the column repair map from the declared schemas so booleans
    // come back as true/false AT THIS SEAM — the app never sees the 0/1.
    this.coercion = buildCoercionMap(options.tableSchemas);
    this.driver.exec(CREATE_SYNC_LOG);
    this.driver.exec(CREATE_TOUCHED_TABLE);
    for (const table of tables) {
      this.driver.exec(createTouchTriggers(table));
    }
    const [row] = this.driver.all(`select coalesce(max(seq), 0) as seq from ${SYNC_LOG_TABLE}`);
    return { lastSeq: Number(row?.seq ?? 0) };
  }

  /** Reject a second in-process engine for the same canonical database identity. */
  acquireWriterLease(): Promise<() => Promise<void>> {
    if (this.closed) {
      return Promise.reject(new SyncServerError('backend_closed', 'The SQLite backend is closed.'));
    }
    if (this.writerLeaseHeld || activeSqliteWriters.has(this.writerKey)) {
      return Promise.reject(
        new SyncServerError(
          'single_writer_violation',
          'A SyncServer already owns this SQLite database. One database may have only one live writer engine.'
        )
      );
    }
    activeSqliteWriters.add(this.writerKey);
    this.writerLeaseHeld = true;
    let released = false;
    return Promise.resolve(async () => {
      if (released) return;
      released = true;
      this.writerLeaseHeld = false;
      activeSqliteWriters.delete(this.writerKey);
    });
  }

  /**
   * Run the handler + append the sync-log record in ONE explicit transaction
   * (BEGIN/COMMIT via the driver — the drivers' own `transaction()` helper
   * forbids the `await` an async handler needs). Reset the touch scratch table,
   * run the handler, read the touched tables back, and insert the log row; a
   * duplicate `mutation_id` fails the unique constraint and is thrown for the
   * engine's exactly-once path. A handler `rejection(...)` is a clean rollback +
   * typed verdict.
   */
  async runMutation(calls: readonly BackendMutationCall[]): Promise<BackendMutateResult> {
    const first = calls[0]!;
    const mutationNames = calls.map((call) => call.binding.name);
    let seq = 0;
    let touched: readonly string[] = [];
    this.driver.exec('BEGIN');
    try {
      this.driver.exec(RESET_TOUCHED);
      const serverTx: ServerTx = {
        sql: async (strings, ...values) => this.read(sqlTag(strings, ...values)) as never,
        run: async (text, params) => this.read(text, params) as never
      };
      for (const call of calls) {
        await call.binding.handler(serverTx, call.args, call.ctx);
        call.assertIdsConsumed();
      }
      touched = this.driver.all(READ_TOUCHED).map((row) => String(row.name));
      const [logRow] = this.driver.all(SYNC_LOG_INSERT, [
        first.ctx.mutationId,
        mutationNames.join(','),
        first.ctx.actor,
        first.ctx.clientId,
        this.clock.now(),
        JSON.stringify(touched)
      ]);
      if (!logRow) {
        throw new SyncServerError('sync_log_failed', `Mutation group [${mutationNames.join(', ')}] committed no sync_log row.`);
      }
      seq = Number(logRow.seq);
      this.driver.exec('COMMIT');
    } catch (error) {
      this.driver.exec('ROLLBACK');
      // A domain rejection is a clean rollback + a typed verdict, not an error.
      if (error instanceof RejectionError) {
        return { ok: false as const, rejection: error.rejection };
      }
      // Everything else (duplicate mutationId, handler exception, id-stream
      // violation) is thrown for the engine to classify.
      throw error;
    }
    return { ok: true as const, seq, touched };
  }

  /** The exactly-once lookup: the seq this mutationId committed at, or null. */
  async findCommitted(mutationId: string): Promise<{ seq: number } | null> {
    const [existing] = this.driver.all(`select seq from ${SYNC_LOG_TABLE} where mutation_id = ?`, [mutationId]);
    return existing ? { seq: Number(existing.seq) } : null;
  }

  /** Append one sync-log row for an engine-external or push change (a single autocommitted INSERT) and return its seq. */
  async recordExternalChange(input: ExternalChangeRecord): Promise<number> {
    const [logRow] = this.driver.all(SYNC_LOG_INSERT, [
      input.mutationId,
      input.mutationName,
      input.actor,
      input.clientId,
      input.committedMs,
      JSON.stringify([...input.touched])
    ]);
    return Number(logRow.seq);
  }

  /** Sequential in-process reads; results in input order. */
  runQueries(queries: readonly SqlFragment[]): Promise<DbRow[][]> {
    return Promise.resolve(queries.map((query) => this.read(query) as DbRow[]));
  }

  /**
   * The honest future door (SyncBackend rule 6): a no-op here. An in-process
   * SQLite database has no logical replication and observes no foreign writes,
   * so this feed never fires — external writes come through
   * `SyncServer.externalWrite`. Returns an empty unsubscribe so the engine's
   * boot/close wiring is uniform.
   */
  onExternalChange(_listener: (touched: readonly string[]) => void): () => void {
    return () => {};
  }

  /** In-process SQLite has no connection to die and no mid-recovery state, so no failure is transient — every error is terminal and typed. */
  isTransientError(_error: unknown): boolean {
    return false;
  }

  /** Close the database connection. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.writerLeaseHeld) {
      this.writerLeaseHeld = false;
      activeSqliteWriters.delete(this.writerKey);
    }
    this.driver.close();
  }
}

/** Build a `SqliteSyncBackend` — the default `SyncBackend`, over a `SqliteDriver` (bun:sqlite by default; better-sqlite3 injected under Node). */
export function createSqliteSyncBackend(options: SqliteSyncBackendOptions): SqliteSyncBackend {
  return new SqliteSyncBackend(options);
}
