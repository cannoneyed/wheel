import { canonicalParams } from '../core/params';
import { compileSql } from '../sync/sql';
import type { ServeQueryBinding } from '../sync/server/serve';
import type { World } from './world';

interface TestPrincipal {
  readonly actor: string;
  readonly workspaceId: string;
  readonly sessionId: string;
}

/** Inputs for one optimistic → authoritative parity assertion. */
export interface MutationParityOptions<Value> {
  readonly world: World;
  /** Fire exactly one mutation. */
  readonly mutate: () => void;
  /** Read the user-visible JSON value/order being compared. */
  readonly read: () => Value;
  readonly label?: string;
}

/**
 * Capture the optimistic result immediately, settle the real engine, and fail
 * if authoritative truth changes that value or order.
 */
export async function expectMutationParity<Value>(
  options: MutationParityOptions<Value>
): Promise<{ optimistic: Value; confirmed: Value }> {
  options.mutate();
  const optimistic = options.read();
  const optimisticCanonical = canonicalParams(optimistic);
  await options.world.settle();
  const confirmed = options.read();
  const confirmedCanonical = canonicalParams(confirmed);
  if (confirmedCanonical !== optimisticCanonical) {
    throw new Error(
      `Mutation parity failed${options.label ? ` for ${options.label}` : ''}.\n` +
        `Optimistic: ${optimisticCanonical}\nConfirmed: ${confirmedCanonical}`
    );
  }
  return { optimistic, confirmed };
}

const SQL_KEYWORDS = new Set([
  'cross',
  'full',
  'group',
  'inner',
  'join',
  'left',
  'limit',
  'offset',
  'on',
  'order',
  'right',
  'union',
  'where'
]);

function unquote(identifier: string): string {
  return identifier.replace(/^["`\[]/, '').replace(/["`\]]$/, '');
}

/** Map SQLite query-plan aliases back to physical table names named in SQL. */
function sqlAliases(text: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const pattern = /\b(?:from|join)\s+(["`\[]?[a-zA-Z_][a-zA-Z0-9_]*["`\]]?)(?:\s+(?:as\s+)?(["`\[]?[a-zA-Z_][a-zA-Z0-9_]*["`\]]?))?/gi;
  for (const match of text.matchAll(pattern)) {
    const table = unquote(match[1]!);
    const candidate = match[2] ? unquote(match[2]) : null;
    aliases.set(table, table);
    if (candidate && !SQL_KEYWORDS.has(candidate.toLowerCase())) {
      aliases.set(candidate, table);
    }
  }
  return aliases;
}

/** Inputs for a SQLite World query-read vs `rerunOn` assertion. */
export interface QueryInvalidationOptions<
  Params extends Record<string, unknown>,
  Row extends Record<string, unknown>
> {
  readonly world: World;
  readonly binding: ServeQueryBinding<Params, Row>;
  readonly params: Params;
  readonly principal?: TestPrincipal;
}

/**
 * Ask SQLite which tables a query plan reads, then compare that set with the
 * handler's invalidation hints. This catches a query that reads a table but
 * can never be re-run when that table changes.
 */
export async function expectQueryInvalidation<
  Params extends Record<string, unknown>,
  Row extends Record<string, unknown>
>(
  options: QueryInvalidationOptions<Params, Row>
): Promise<{ reads: readonly string[]; rerunOn: readonly string[] }> {
  const sql = options.binding.handler.sql;
  if (!sql) {
    throw new Error(
      `Query invalidation check needs an SQL-backed handler; "${options.binding.name}" uses ${options.binding.handler.kind}.`
    );
  }
  const principal =
    options.principal ??
    ({ actor: 'user:parity', workspaceId: 'world', sessionId: 'parity' } satisfies TestPrincipal);
  // `explain query plan` is SQLite's own syntax, so this check compiles the
  // fragment for SQLite explicitly — it only ever runs on World's SQLite backend.
  const source = compileSql(sql(options.params, principal));
  let plan: Record<string, unknown>[];
  try {
    plan = await options.world.db.query(`explain query plan ${source.text}`, source.params);
  } catch (error) {
    throw new Error(
      `Query invalidation check for "${options.binding.name}" requires World’s SQLite backend: ${String(
        (error as Error)?.message ?? error
      )}`
    );
  }
  const aliases = sqlAliases(source.text);
  const reads = new Set<string>();
  for (const row of plan) {
    const detail = String(row.detail ?? '');
    const match = detail.match(/\b(?:SCAN|SEARCH)\s+(?:TABLE\s+)?(["`\[]?[a-zA-Z_][a-zA-Z0-9_]*["`\]]?)/i);
    if (!match) continue;
    const planned = unquote(match[1]!);
    const table = aliases.get(planned);
    if (table) reads.add(table);
  }
  const observed = [...reads].sort();
  const rerunOn = [...new Set(options.binding.handler.rerunOn ?? [])].sort();
  if (canonicalParams(observed) !== canonicalParams(rerunOn)) {
    throw new Error(
      `Query invalidation mismatch for "${options.binding.name}". ` +
        `SQLite reads [${observed.join(', ')}], but rerunOn is [${rerunOn.join(', ')}].`
    );
  }
  return { reads: observed, rerunOn };
}
