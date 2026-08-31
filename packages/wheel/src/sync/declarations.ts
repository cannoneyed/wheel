/**
 * The sync-side vocabulary: table / query / mutation declarations.
 * Declarations are pure data + pure functions with zero dependencies beyond
 * Zod — safe in any bundle. Server implementations live in *.server.ts files
 * and are bound to these declarations by name (the split-file convention),
 * so client bundles never pull in server code.
 */
import type { Infer, RowSchema } from './schema';
import type { t } from './schema';
import { captureDeclSite } from '../core/decl-site';

export { captureDeclSite };

const TABLE_NAME = /^[a-z][a-z0-9_]*$/;
// Operation grammar: `<namespace>.<op>`. A query namespace must equal its
// target table name. Mutation namespaces are organizational: one mutation may
// touch several tables, so its name cannot prove a single target.
// The op segment stays camelCase for verb phrases (`byTeam`, `setRead`,
// `bulkUpdate`). Plurality itself isn't regex-checkable — the namespace tracks
// whatever the table is actually named (already plural/snake_case).
const OPERATION_NAME = /^[a-z][a-z0-9_]*\.[a-z][a-zA-Z0-9_]*$/;

/** Language-neutral description of how a table row becomes its wire/cache identity. */
export interface TableKeySpec {
  /** Top-level row fields read in order. One field is a simple key; several are joined. */
  readonly fields: readonly string[];
  /** Separator used only when `fields` contains more than one entry. */
  readonly separator: string;
}

/** A declared synced table: name, row schema, and key extractor - the unit the client cache pools rows by. */
export interface TableDecl<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'table';
  readonly name: string;
  readonly schema: RowSchema<Row>;
  readonly key: (row: Row) => string;
  /** Serializable equivalent of `key`, consumed by non-TypeScript sync engines. */
  readonly keySpec: TableKeySpec;
  /** True for derived tables: no physical table or touch trigger; queries into it re-run through declared dependencies. */
  readonly virtual: boolean;
  readonly declSite: string;
}

/** Run a table's key extractor and enforce the cache identity contract. */
export function validateTableKey<Row extends Record<string, unknown>>(
  table: TableDecl<Row>,
  row: Row,
  source: string
): string {
  let key: unknown;
  try {
    key = table.key(row);
  } catch (error) {
    throw new Error(
      `${source}: key extractor for table "${table.name}" threw: ${String((error as Error)?.message ?? error)}`
    );
  }
  if (typeof key !== 'string' || key.trim() === '') {
    throw new Error(
      `${source}: key extractor for table "${table.name}" must return a non-empty string; received ${JSON.stringify(key)}.`
    );
  }
  const keyParts = table.keySpec.fields.map((field) => row[field]);
  if (!keyParts.every((part) => typeof part === 'string')) {
    throw new Error(
      `${source}: key spec for table "${table.name}" requires string fields ` +
        `${table.keySpec.fields.map((field) => JSON.stringify(field)).join(', ')}.`
    );
  }
  const declaredKey = (keyParts as string[]).join(table.keySpec.separator);
  if (key !== declaredKey) {
    throw new Error(
      `${source}: key extractor for table "${table.name}" returned ${JSON.stringify(key)}, ` +
        `but its key spec produced ${JSON.stringify(declaredKey)}.`
    );
  }
  return key;
}

/** Declare a synced table of immutable rows (sync-side; single options object). */
export function table<Schema extends t.ZodType<Record<string, unknown>>>(options: {
  name: string;
  type: Schema;
  key: (row: Infer<Schema>) => string;
  /** Serializable row identity. Defaults to the top-level `id` field. */
  keySpec?: {
    fields: readonly string[];
    separator?: string;
  };
  /**
   * Derived table: the name maps to no physical table (a second row contract
   * over an existing one, or a join). The engine installs no touch trigger;
   * queries into it re-run through their declared physical dependencies.
   */
  virtual?: boolean;
}): TableDecl<Infer<Schema>> {
  if (!TABLE_NAME.test(options.name)) {
    throw new Error(`Invalid table name ${JSON.stringify(options.name)}: must match ${TABLE_NAME}.`);
  }
  const fields = options.keySpec?.fields ?? ['id'];
  if (
    fields.length === 0 ||
    fields.some((field) => typeof field !== 'string' || field.trim() === '' || field.includes('.'))
  ) {
    throw new Error(
      `Invalid key spec for table ${JSON.stringify(options.name)}: fields must be non-empty top-level property names.`
    );
  }
  const separator = options.keySpec?.separator ?? ':';
  if (typeof separator !== 'string' || (fields.length > 1 && separator === '')) {
    throw new Error(
      `Invalid key spec for table ${JSON.stringify(options.name)}: composite keys require a non-empty separator.`
    );
  }
  return {
    kind: 'table',
    name: options.name,
    schema: options.type as unknown as RowSchema<Infer<Schema>>,
    key: options.key,
    keySpec: Object.freeze({ fields: Object.freeze([...fields]), separator }),
    virtual: options.virtual ?? false,
    declSite: captureDeclSite()
  };
}

/**
 * A typed contract for the presence channel — ephemeral state (cursor,
 * focus, live-typing preview) relayed client → server → peers with no
 * database, no history, no undo. The declaration is TYPING ONLY: the wire
 * and the server relay stay untyped and unchanged; validation happens at
 * the client's edges. A client has ONE presence state — the decl names and
 * shapes it, it does not add channels.
 */
export interface PresenceDecl<State extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'presence';
  readonly name: string;
  readonly state: RowSchema<State>;
  readonly declSite: string;
}

/** Declare the app's presence-state shape (sync-side; single options object). */
export function presence<Schema extends t.ZodType<Record<string, unknown>>>(options: {
  name: string;
  state: Schema;
}): PresenceDecl<Infer<Schema>> {
  if (!TABLE_NAME.test(options.name)) {
    throw new Error(`Invalid presence name ${JSON.stringify(options.name)}: must match ${TABLE_NAME}.`);
  }
  return {
    kind: 'presence',
    name: options.name,
    state: options.state as unknown as RowSchema<Infer<Schema>>,
    declSite: captureDeclSite()
  };
}

/**
 * The optimistic handlers' entire write vocabulary:
 * rows are frozen values; `update` takes a patch and the cache owns the copy,
 * which is the exit path to persistent structures if benchmarks ever demand it.
 *
 * Produce new rows, never mutate: rows returned by `get`/`list` are frozen
 * (in production too). To change a row, pass a fresh object to `put` or a
 * patch to `update` — writing to a returned row in place throws in strict
 * mode and would otherwise silently corrupt the shared base state.
 */
export interface OptimisticCache {
  get<Row extends Record<string, unknown>>(table: TableDecl<Row>, id: string): Row | undefined;
  list<Row extends Record<string, unknown>>(table: TableDecl<Row>): readonly Row[];
  put<Row extends Record<string, unknown>>(table: TableDecl<Row>, row: Row): void;
  update<Row extends Record<string, unknown>>(table: TableDecl<Row>, id: string, patch: Partial<Row>): void;
  delete<Row extends Record<string, unknown>>(table: TableDecl<Row>, id: string): void;
}

/** Read-only view of the effective client state — what invert() captures old values from. */
export interface CacheReader {
  get<Row extends Record<string, unknown>>(table: TableDecl<Row>, id: string): Row | undefined;
  list<Row extends Record<string, unknown>>(table: TableDecl<Row>): readonly Row[];
}

/**
 * The inverse of a mutation, captured at record time: applying it as a NEW
 * mutation restores the prior state. Undo/redo is built from these — the
 * engine never learns undo exists (it's just another mutation).
 */
export interface InverseSpec {
  // Type-erased on purpose: an inverse may reference any mutation, and
  // MutationDecl's handler params are contravariant.
  readonly mutation: MutationDecl<any>;  
  readonly args: Record<string, unknown>;
  /** Human-readable label for undo UI ("edit block", "delete issue"). */
  readonly description?: string;
}

/** Deterministic context available to optimistic handlers (and replayed on the server). */
export interface MutationCtx {
  /** New prefixed UUIDv7. The server replays the same ids for the same mutation. */
  newId(prefix: string): string;
  /** Injected clock, epoch ms. */
  now(): number;
  /** Who is mutating, e.g. `user:andy` or `agent:indexer`. */
  actor: string;
}

/**
 * The client-side approximation of a query's SQL, declared next to it in the
 * sync-module side: which rows belong to this query's result (`filter`, mirroring the
 * where clause) and how they order (`sort`, mirroring order by). The server
 * SQL is always the truth — this only decides where *optimistic* rows show
 * up before the server confirms. Optional: a query without it shows
 * optimistic rows only after server confirmation.
 */
export interface QueryProjection<Params extends Record<string, unknown>, Row extends Record<string, unknown>> {
  readonly filter: (row: Row, params: Params) => boolean;
  readonly sort?: (a: Row, b: Row) => number;
}

/** A declared live query: named + typed params, target table, dependencies, and optional client projection. SQL lives in the *.server.ts binding. */
export interface QueryDecl<
  Params extends Record<string, unknown> = Record<string, unknown>,
  Row extends Record<string, unknown> = Record<string, unknown>
> {
  readonly kind: 'query';
  readonly name: string;
  readonly params: t.ZodType<Params>;
  readonly into: TableDecl<Row>;
  /** Physical tables whose committed writes may change this query's answer. */
  readonly dependsOn: readonly string[];
  readonly projection?: QueryProjection<Params, Row>;
  readonly declSite: string;
}

/** Declare a live query (sync-side). The optional projection decides where optimistic rows appear before the server confirms. */
export function query<ParamsSchema extends t.ZodType<Record<string, unknown>>, Row extends Record<string, unknown>>(options: {
  name: string;
  params: ParamsSchema;
  into: TableDecl<Row>;
  /** Defaults to `into` for physical tables. Virtual tables must declare their physical dependencies, or `[]` for a push-only source. */
  dependsOn?: readonly string[];
  projection?: QueryProjection<Infer<ParamsSchema>, Row>;
}): QueryDecl<Infer<ParamsSchema>, Row> {
  if (!OPERATION_NAME.test(options.name)) {
    throw new Error(`Invalid query name ${JSON.stringify(options.name)}: must look like "todos.byList".`);
  }
  const namespace = options.name.slice(0, options.name.indexOf('.'));
  if (namespace !== options.into.name) {
    throw new Error(
      `Invalid query name ${JSON.stringify(options.name)}: namespace "${namespace}" must equal target table "${options.into.name}".`
    );
  }
  if (options.into.virtual && options.dependsOn === undefined) {
    throw new Error(
      `Query ${JSON.stringify(options.name)} targets virtual table ${JSON.stringify(options.into.name)} and must declare dependsOn (use [] for a push-only source).`
    );
  }
  const dependsOn = [...(options.dependsOn ?? [options.into.name])];
  if (dependsOn.some((table) => !TABLE_NAME.test(table))) {
    throw new Error(`Query ${JSON.stringify(options.name)} declares an invalid dependsOn table name.`);
  }
  if (new Set(dependsOn).size !== dependsOn.length) {
    throw new Error(`Query ${JSON.stringify(options.name)} declares a duplicate dependsOn table.`);
  }
  return {
    kind: 'query',
    name: options.name,
    params: options.params as unknown as t.ZodType<Infer<ParamsSchema>>,
    into: options.into,
    dependsOn: Object.freeze(dependsOn),
    projection: options.projection as unknown as QueryProjection<Infer<ParamsSchema>, Row> | undefined,
    declSite: captureDeclSite()
  };
}

/** A declared write: named + typed args and the optimistic handler that previews it client-side. */
export interface MutationDecl<Args extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: 'mutation';
  readonly name: string;
  readonly args: t.ZodType<Args>;
  readonly optimistic?: (cache: OptimisticCache, args: Args, ctx: MutationCtx) => void;
  /** Declares this mutation undoable: capture the inverse BEFORE the optimistic apply (null = not invertible right now). */
  readonly invert?: (reader: CacheReader, args: Args) => InverseSpec | null;
  readonly declSite: string;
}

/** One existing mutation declaration and its arguments inside an atomic command. */
export interface MutationCall<Args extends Record<string, unknown> = Record<string, unknown>> {
  readonly mutation: MutationDecl<Args>;
  readonly args: Args;
}

/** Declare a mutation (sync-side). The server handler binds to it by name in *.server.ts. */
export function mutation<ArgsSchema extends t.ZodType<Record<string, unknown>>>(options: {
  name: string;
  args: ArgsSchema;
  optimistic?: (cache: OptimisticCache, args: Infer<ArgsSchema>, ctx: MutationCtx) => void;
  invert?: (reader: CacheReader, args: Infer<ArgsSchema>) => InverseSpec | null;
}): MutationDecl<Infer<ArgsSchema>> {
  if (!OPERATION_NAME.test(options.name)) {
    throw new Error(`Invalid mutation name ${JSON.stringify(options.name)}: must look like "todos.add".`);
  }
  return {
    kind: 'mutation',
    name: options.name,
    args: options.args as unknown as t.ZodType<Infer<ArgsSchema>>,
    optimistic: options.optimistic,
    invert: options.invert as unknown as MutationDecl<Infer<ArgsSchema>>['invert'],
    declSite: captureDeclSite()
  };
}

/**
 * The guard → patch → capture-prior → self-inverse skeleton that patch-by-id
 * mutations copy verbatim. It read-guards the row (orphans if a peer deleted it
 * first), applies the caller's partial patch, and makes the mutation ITS OWN
 * inverse by replaying the prior values of exactly the fields the patch touched:
 *
 *   export const projectUpdate = patchMutation({
 *     name: 'projects.update',
 *     args: t.object({ projectId: t.string(), patch: ProjectPatch }),
 *     table: projects,
 *     id: (args) => args.projectId,
 *     description: 'edit project'
 *   });
 *
 * `stamp` contributes server-mirroring fields the patch does not carry and the
 * inverse must NOT restore — they are re-derived on every apply (undo included):
 *
 *   stamp: (ctx) => ({ updatedAt: ctx.now() })              // issues.update
 *   stamp: (_ctx, _args, row) => ({ version: row.version + 1 })
 *
 * Reserved for the `{ id, patch }` shape only. The odd cases — flat args
 * (`{ commentId, body }`), multi-row writes, creates/deletes, mutations that
 * skip rather than orphan on a missing row — stay hand-written.
 */
export function patchMutation<
  Row extends Record<string, unknown>,
  Args extends { patch: Partial<Row> } & Record<string, unknown>
>(options: {
  name: string;
  args: t.ZodType<Args>;
  table: TableDecl<Row>;
  /** Which row this mutation patches, from its args. */
  id: (args: Args) => string;
  /** Extra fields merged into every apply (never restored by the inverse). */
  stamp?: (ctx: MutationCtx, args: Args, row: Row) => Partial<Row>;
  /** Undo-UI label carried on the inverse. */
  description?: string;
  /** Message for the orphan thrown when the row is already gone. */
  orphanMessage?: (id: string) => string;
}): MutationDecl<Args> {
  const { table, id } = options;
  // Self-reference: `invert` runs long after this const initializes, so naming
  // `decl` inside it is safe (the same pattern hand-written inverses used).
  const decl = mutation({
    name: options.name,
    args: options.args,
    optimistic: (cache, args, ctx) => {
      const rowId = id(args);
      const row = cache.get(table, rowId);
      if (!row) throw orphan(options.orphanMessage?.(rowId) ?? `${table.name} ${rowId} is gone`);
      const stamped = options.stamp ? options.stamp(ctx, args, row) : undefined;
      cache.update(table, rowId, { ...(args.patch as Partial<Row>), ...stamped });
    },
    invert: (reader, args): InverseSpec | null => {
      const row = reader.get(table, id(args));
      if (!row) return null;
      const prior: Record<string, unknown> = {};
      for (const field of Object.keys(args.patch)) prior[field] = row[field];
      return { mutation: decl, args: { ...args, patch: prior }, description: options.description };
    }
  });
  return decl;
}

/** Typed rejection — a value that crosses the wire, not an exception class. */
export interface MutationRejection {
  readonly kind: 'rejection';
  readonly code: string;
  readonly message: string;
}

/** The throwable carrier for a typed MutationRejection - thrown server-side by rejection(), never crosses the wire as an exception. */
export class RejectionError extends Error {
  constructor(public readonly rejection: MutationRejection) {
    super(`Mutation rejected [${rejection.code}]: ${rejection.message}`);
  }
}

/**
 * `throw rejection('forbidden', ...)` in a server handler → typed rejection to
 * the client. A NOUN on purpose: it BUILDS a value, it does not act. Written
 * without `throw` — `rejection('forbidden', 'no')` on its own line — it reads
 * as plainly inert, which is exactly the mistake the old verb form `reject(...)`
 * hid ("reject" looks like it did something; forgetting `throw` guarded nothing).
 */
export function rejection(code: string, message: string): RejectionError {
  return new RejectionError({ kind: 'rejection', code, message });
}

/**
 * The typed signal an optimistic handler throws when the row it depends on is
 * gone — deleted by a peer's confirmed delta before this pending mutation
 * replayed. It means "there is nothing left for me to edit," NOT "I have a
 * bug." The client treats it as the ONE legitimate reason to abandon a
 * replaying optimistic mutation: the entry settles `orphaned` (terminal,
 * cleanly rolled back), never `failed`.
 *
 * Why a dedicated class instead of a bare `Error`: rebase() must tell "the row
 * vanished" apart from "the handler crashed (typo, null deref)". A bare throw
 * used to be swallowed as `orphaned`, so a real bug silently rolled the
 * mutation back with no error to paste. Now only an `OrphanedError` takes the
 * orphaned path; every other throw settles the mutation `failed` and logs.
 */
export class OrphanedError extends Error {
  /** Discriminant so `error.kind === 'orphaned'` works without `instanceof` (survives structured cloning / bundle boundaries). */
  readonly kind = 'orphaned' as const;
  constructor(message = 'the row this mutation depends on is gone') {
    super(message);
    this.name = 'OrphanedError';
  }
}

/**
 * Throw this from an optimistic handler when a row it reads is missing on
 * replay — `if (!cache.get(issues, id)) throw orphan('issue ' + id + ' is gone')`.
 * Signals a legitimate row-is-gone, not a bug: the client settles the mutation
 * `orphaned` and rolls it back cleanly, instead of `failed`. Reserve it for
 * genuine row-gone guards; let real invariant violations throw normally so
 * they surface as `failed` with the original error.
 */
export function orphan(message?: string): OrphanedError {
  return new OrphanedError(message);
}
