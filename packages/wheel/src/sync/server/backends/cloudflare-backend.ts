/**
 * Durable Object SQLite implementation of `SyncBackend`.
 *
 * Cloudflare rejects SQL transaction statements. This backend runs the whole
 * async mutation inside `storage.transaction()` and consumes each SQL cursor
 * before the handler can cross an `await` boundary.
 */
import { RejectionError } from '../../declarations';
import type { Clock } from '../../ids';
import { compileSql, sql as sqlTag, type SqlFragment } from '../../sql';
import type { DbRow } from '../../protocol';
import { SyncServerError } from '../errors';
import type { QueryReader } from '../query-handler';
import type { ServeMutationBinding, ServerMutationCtx, ServerTx } from '../serve';
import type {
  BackendMutateResult,
  ExternalChangeRecord,
  SyncBackend,
  SyncBackendInitOptions
} from '../sync-backend';
import {
  CREATE_PERSISTENT_TOUCHED_TABLE,
  CREATE_SYNC_LOG,
  READ_TOUCHED,
  RESET_TOUCHED,
  SYNC_LOG_INSERT,
  SYNC_LOG_TABLE,
  createPersistentTouchTriggers
} from './sqlite-bootstrap';
import { applyCoercion, buildCoercionMap, type CoercionMap } from './sqlite-coerce';

/** One row returned by Durable Object SQL. */
export type DurableObjectSqlRow = Record<string, unknown>;

/** Cursor subset used by the backend. Cloudflare cursors expose `toArray()`. */
export interface DurableObjectSqlCursor<Row extends DurableObjectSqlRow = DurableObjectSqlRow> {
  toArray(): Row[];
}

/** SQLite storage subset used by the backend. */
export interface DurableObjectSqlStorageLike {
  exec(query: string, ...bindings: unknown[]): DurableObjectSqlCursor;
}

/** Durable Object transaction subset used by the backend. */
export interface DurableObjectStorageLike {
  readonly sql: DurableObjectSqlStorageLike;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
}

/** Storage and clock dependencies for one Durable Object backend. */
export interface CloudflareSyncBackendOptions {
  readonly storage: DurableObjectStorageLike;
  readonly clock: Clock;
}

function coerceBindings(params: readonly unknown[] | undefined): unknown[] {
  if (!params) return [];
  return params.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value === undefined) return null;
    return value;
  });
}

/** Execute one Wheel/SQLite statement and consume its cursor before returning. */
export function runDurableObjectSql(
  sql: DurableObjectSqlStorageLike,
  text: string,
  params?: readonly unknown[]
): DurableObjectSqlRow[] {
  return sql.exec(text, ...coerceBindings(params)).toArray();
}

/** Durable Object backend for one object's private SQLite database. */
export class CloudflareSyncBackend implements SyncBackend {
  private coercion: CoercionMap = new Map();
  private closed = false;

  constructor(private readonly options: CloudflareSyncBackendOptions) {}

  private read(source: SqlFragment | string, params?: readonly unknown[]): DurableObjectSqlRow[] {
    if (this.closed) {
      throw new SyncServerError('server_closed', 'Cloudflare sync backend is closed.');
    }
    const compiled =
      typeof source === 'string'
        ? { text: source, params: params ?? [] }
        : compileSql(source);
    const rows = runDurableObjectSql(this.options.storage.sql, compiled.text, compiled.params);
    return applyCoercion(rows, this.coercion);
  }

  /** Read application rows through the backend's schema coercion map. */
  readonly reader: QueryReader = {
    query: (source: SqlFragment | string, params?: readonly unknown[]) =>
      Promise.resolve(this.read(source, params))
  };

  /** Return a no-op lease because one Durable Object owns one database. */
  async acquireWriterLease(): Promise<() => Promise<void>> {
    return async () => {};
  }

  /** Install sync metadata and write-tracking triggers. */
  async init(
    tables: readonly string[],
    options: SyncBackendInitOptions
  ): Promise<{ lastSeq: number }> {
    this.coercion = buildCoercionMap(options.tableSchemas);
    this.read(CREATE_SYNC_LOG);
    this.read(CREATE_PERSISTENT_TOUCHED_TABLE);
    for (const table of tables) this.read(createPersistentTouchTriggers(table));
    const [row] = this.read(`select coalesce(max(seq), 0) as seq from ${SYNC_LOG_TABLE}`);
    return { lastSeq: Number(row?.seq ?? 0) };
  }

  /** Commit one mutation and its sync log row in one storage transaction. */
  async runMutation(
    binding: ServeMutationBinding,
    args: Record<string, unknown>,
    ctx: ServerMutationCtx
  ): Promise<BackendMutateResult> {
    try {
      return await this.options.storage.transaction(async () => {
        this.read(RESET_TOUCHED);
        const serverTx: ServerTx = {
          sql: async (strings, ...values) => {
            return this.read(sqlTag(strings, ...values)) as never;
          },
          run: async (text, params) => this.read(text, params) as never
        };
        await binding.handler(serverTx, args, ctx);
        const touched = this.read(READ_TOUCHED).map((row) => String(row.name));
        const [logRow] = this.read(SYNC_LOG_INSERT, [
          ctx.mutationId,
          binding.name,
          ctx.actor,
          ctx.clientId,
          this.options.clock.now(),
          JSON.stringify(touched)
        ]);
        if (!logRow) {
          throw new SyncServerError(
            'sync_log_failed',
            `Mutation "${binding.name}" committed no sync_log row.`
          );
        }
        return { ok: true as const, seq: Number(logRow.seq), touched };
      });
    } catch (error) {
      if (error instanceof RejectionError) {
        return { ok: false, rejection: error.rejection };
      }
      throw error;
    }
  }

  /** Find the sequence for an already committed mutation. */
  async findCommitted(mutationId: string): Promise<{ seq: number } | null> {
    const [row] = this.read(`select seq from ${SYNC_LOG_TABLE} where mutation_id = ?`, [mutationId]);
    return row ? { seq: Number(row.seq) } : null;
  }

  /** Add one sync log record for a direct database write. */
  async recordExternalChange(input: ExternalChangeRecord): Promise<number> {
    const [row] = this.read(SYNC_LOG_INSERT, [
      input.mutationId,
      input.mutationName,
      input.actor,
      input.clientId,
      input.committedMs,
      JSON.stringify([...input.touched])
    ]);
    if (!row) throw new SyncServerError('sync_log_failed', 'External change committed no sync_log row.');
    return Number(row.seq);
  }

  /** Run a query batch after the current serialized write. */
  runQueries(queries: readonly SqlFragment[]): Promise<DbRow[][]> {
    return Promise.resolve(queries.map((query) => this.read(query) as DbRow[]));
  }

  /** Return a no-op feed because all writes enter through this object. */
  onExternalChange(_listener: (touched: readonly string[]) => void): () => void {
    return () => {};
  }

  /** Treat storage errors as final; the Durable Object runtime owns retries. */
  isTransientError(_error: unknown): boolean {
    return false;
  }

  /** Reject later reads after the owning server closes. */
  async close(): Promise<void> {
    this.closed = true;
  }
}

/** Create the Wheel backend owned by one Durable Object instance. */
export function createCloudflareSyncBackend(
  options: CloudflareSyncBackendOptions
): CloudflareSyncBackend {
  return new CloudflareSyncBackend(options);
}
