/**
 * Server-side bindings for sync module declarations (*.server.ts vocabulary).
 * These are still pure declarations — the engine executes them. Handlers
 * receive a transaction whose `sql` tag runs inside the mutation's txn; query
 * sources are raw sql`` fragments (the compiled { text, params } payload).
 */
import type { MutationCtx, MutationDecl, QueryDecl } from '../declarations';
import type { AuthPrincipal } from '../../auth/index';
import { captureDeclSite } from '../declarations';
import type { SqlFragment } from '../sql';
import { SqlQueryHandler, type QueryHandler } from './query-handler';

/** A transaction handle inside a mutation: execute SQL, all-or-nothing with the sync log. */
export interface ServerTx {
  sql<Row extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<Row[]>;
  /** Raw text + positional params on the same transaction — for handlers sharing SQL with non-template callers. */
  run<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, params: readonly unknown[]): Promise<Row[]>;
}

/** Context a server mutation handler sees; ids/time replay the client's deterministic stream. */
export interface ServerMutationCtx extends MutationCtx {
  /** The mutation instance id (for provenance and logs). */
  mutationId: string;
  /** The originating client's wire id (stored on the sync-log row for provenance). */
  clientId: string;
  /** Workspace authenticated at the HTTP boundary. */
  workspaceId: string;
  /** Authentication session that owns the connection. */
  sessionId: string;
}

/** A query source: a raw sql`` fragment (the compiled { text, params } payload). */
export type QuerySource = SqlFragment;

/** A query declaration bound to its backend handler - the server half of the split-file contract. */
export interface ServeQueryBinding<
  Params extends Record<string, unknown> = Record<string, unknown>,
  Row extends Record<string, unknown> = Record<string, unknown>
> {
  readonly kind: 'serve-query';
  readonly name: string;
  readonly query: QueryDecl<Params, Row>;
  readonly handler: QueryHandler<Params, Row>;
  readonly declSite: string;
}

/**
 * Bind a query declaration to its backend (*.server.ts side). Two forms:
 *
 *   // Sugar — the standard SQLite case:
 *   serveQuery({ query, sql: (p) => sql`...`, rerunOn: ['cards'] })
 *
 *   // Explicit — any QueryHandler (the backend escape hatch):
 *   serveQuery({ query, handler: SqlQueryHandler({ sql, rerunOn }) })
 *
 * A handler must offer at least one invalidation channel: `rerunOn` table
 * hints (re-run + diff when a table is touched) and/or push-based
 * `subscribe` (backends with native reactivity).
 */
export function serveQuery<Params extends Record<string, unknown>, Row extends Record<string, unknown>>(
  options:
    | {
        query: QueryDecl<Params, Row>;
        handler: QueryHandler<Params, Row>;
      }
    | {
        query: QueryDecl<Params, Row>;
        sql: (params: Params, principal: AuthPrincipal) => QuerySource;
        /** Table names whose committed writes re-run + diff this query. Coarse on purpose: table-level hints are cheap to declare and the engine's diff suppresses no-op deltas. */
        rerunOn: readonly string[];
      }
): ServeQueryBinding<Params, Row> {
  const handler =
    'handler' in options
      ? options.handler
      : SqlQueryHandler<Params, Row>({ sql: options.sql, rerunOn: options.rerunOn });
  if ((handler.rerunOn === undefined || handler.rerunOn.length === 0) && handler.subscribe === undefined) {
    throw new Error(
      `serveQuery(${options.query.name}): the handler must provide rerunOn table hints and/or a subscribe channel.`
    );
  }
  return {
    kind: 'serve-query',
    name: options.query.name,
    query: options.query,
    handler,
    declSite: captureDeclSite()
  };
}

/** The authoritative write: runs inside the mutation transaction with the deterministic ctx. */
export type MutationHandler<Args extends Record<string, unknown>> = (
  tx: ServerTx,
  args: Args,
  ctx: ServerMutationCtx
) => Promise<void>;

/** A mutation declaration bound to its authoritative handler. */
export interface ServeMutationBinding<Args extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'serve-mutation';
  readonly name: string;
  readonly mutation: MutationDecl<Args>;
  readonly handler: MutationHandler<Args>;
  readonly declSite: string;
}

/** Bind the server handler to a sync module mutation declaration (*.server.ts side). */
export function serveMutation<Args extends Record<string, unknown>>(options: {
  mutation: MutationDecl<Args>;
  handler: MutationHandler<Args>;
}): ServeMutationBinding<Args> {
  return {
    kind: 'serve-mutation',
    name: options.mutation.name,
    mutation: options.mutation,
    handler: options.handler,
    declSite: captureDeclSite()
  };
}
