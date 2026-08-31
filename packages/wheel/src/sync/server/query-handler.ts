/**
 * QueryHandler — the per-query backend adapter: the escape hatch for
 * queries whose truth lives outside plain engine-batched SQL.
 *
 * The engine stays the authority on everything that makes wheel wheel: it
 * diffs every result, mints seq, emits idempotent whole-row deltas, and
 * validates rows against the query's schema. A handler answers only two
 * questions: "what are this query's rows right now?" and "when might that
 * answer have changed?" — the second via declaration dependencies, a push
 * callback (`subscribe`), or both.
 */
import type { SqlFragment } from '../sql';
import type { AuthPrincipal } from '../../auth/index';

/**
 * Read-only database access supplied by every SyncBackend.
 *
 * Two input shapes, because there are genuinely two kinds of SQL here:
 *
 * 1. A sql`` FRAGMENT — dialect-free. The backend compiles it for its own
 *    SQLite database.
 *    This is what query handlers and mutation handlers produce.
 * 2. RAW text (+ positional params) — dialect-SPECIFIC, written by hand and
 *    passed to the driver verbatim. Migrations, DDL, seeds and tests live
 *    here. Nothing rewrites it, so its placeholders must already match the
 *    database it runs on (`?` for SQLite).
 */
export interface QueryReader {
  /** Read-only query access to the engine's database. */
  query(source: SqlFragment, params?: undefined): Promise<Record<string, unknown>[]>;
  query(text: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]>;
}

/** What a handler's one-off `run` may use, including trusted request identity. */
export interface QueryHandlerCtx extends QueryReader {
  /** Principal authenticated when this subscription's WebSocket opened. */
  readonly principal: AuthPrincipal;
}

/**
 * One touched row's before/after images (raw TABLE shape — snake_case
 * columns, NOT the query's projected row). Available to `prune` when the
 * engine runs with `rowImages: true`.
 */
export interface RowImage {
  /** Table name. */
  readonly t: string;
  readonly op: 'insert' | 'update' | 'delete';
  /** Row before the write (null for inserts). */
  readonly o: Record<string, unknown> | null;
  /** Row after the write (null for deletes). */
  readonly n: Record<string, unknown> | null;
}

/**
 * A query backend. `SqlQueryHandler` supplies SQLite SQL.
 * Custom handlers can bridge another live source through `subscribe`.
 */
export interface QueryHandler<
  Params extends Record<string, unknown> = Record<string, unknown>,
  Row extends Record<string, unknown> = Record<string, unknown>
> {
  /** Debug label shown in subscription diagnostics. */
  readonly kind: string;
  /**
   * Produce the query's current, ordered rows. Must be side-effect-free;
   * every row is validated against the query's schema by the engine.
   */
  run(params: Params, ctx: QueryHandlerCtx): Promise<readonly Row[]>;
  /**
   * Push-based invalidation: call `invalidate()` whenever the result MAY have
   * changed. Cheap and coalescing — the engine enqueues one re-run+diff on
   * its writer loop; a no-op change emits nothing. Return the unsubscribe;
   * the engine calls it when the subscription closes.
   */
  subscribe?(params: Params, invalidate: () => void, principal: AuthPrincipal): () => void;
  /**
   * SQL descriptor, present on SQL-speaking handlers. When set, the engine
   * batches this query with all other invalidated SQL queries into one
   * queryMany round trip instead of calling `run` — the hot path.
   */
  readonly sql?: (params: Params, principal: AuthPrincipal) => SqlFragment;
  /**
   * Tier-1 pruning (opt-in, requires `createSyncServer({ rowImages: true })`):
   * when a declared dependency matches, the re-run is SKIPPED unless some touched
   * row image passes this predicate. Images are raw table-shaped (old AND
   * new checked by the caller passing each image once) — never the projected
   * client row. Purely an optimization: absent images (external writes, WAL,
   * overflow) always fall back to re-running.
   */
  readonly prune?: (image: RowImage, params: Params, principal: AuthPrincipal) => boolean;
}

/**
 * The standard SQLite handler: a sql`` fragment.
 *
 *   serveQuery({ query: cardList, handler: SqlQueryHandler({
 *     sql: () => sql`select ... from cards order by position`
 *   })})
 *
 * The `serveQuery({ query, sql })` sugar desugars to exactly this.
 */
export function SqlQueryHandler<
  Params extends Record<string, unknown>,
  Row extends Record<string, unknown>
>(options: {
  sql: (params: Params, principal: AuthPrincipal) => SqlFragment;
  /** Optional Tier-1 pruning predicate over raw row images (see QueryHandler.prune). */
  prune?: (image: RowImage, params: Params, principal: AuthPrincipal) => boolean;
}): QueryHandler<Params, Row> {
  return {
    kind: 'sqlite',
    sql: options.sql,
    prune: options.prune,
    async run(params, ctx) {
      return (await ctx.query(options.sql(params, ctx.principal))) as Row[];
    }
  };
}
