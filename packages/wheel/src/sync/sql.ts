/**
 * `sql` is a pure descriptor builder: the tagged template
 * produces an UNCOMPILED part list and never touches a driver. Only src/server
 * owns execution and compiles the fragment for SQLite.
 *
 * Fragments compose by splicing part lists, so a value is a value and text is
 * text at every level — there is no renumbering step to get wrong, and no regex
 * that could corrupt a literal `$1` inside a SQL string.
 *
 * A fragment carries no placeholder syntax. `compileSql(fragment)` writes
 * SQLite `?` placeholders. Nothing rewrites compiled SQL after that step.
 */

const SQL_FRAGMENT = Symbol.for('wheel.sql-fragment');
const SQL_RAW = Symbol.for('wheel.sql-raw');

type Part = { kind: 'text'; text: string } | { kind: 'param'; value: unknown };

/**
 * The compiled form of a sql`` template: driver-ready text plus positional
 * params. Produced only by `compileSql`, only inside a backend.
 */
export interface CompiledSql {
  /** Statement text with SQLite positional placeholders. */
  readonly text: string;
  /** Parameter values, positionally matching the placeholders. */
  readonly params: readonly unknown[];
}

/**
 * A sql`` template: pure, uncompiled data. Opaque on purpose.
 */
export interface SqlFragment {
  readonly [SQL_FRAGMENT]: true;
  /** @internal The spliced part list. Read it through `compileSql`, never directly. */
  readonly parts: readonly Part[];
}

interface RawSql {
  readonly [SQL_RAW]: true;
  readonly text: string;
}

/** Brand check distinguishing real sql`` fragments from hand-built objects. */
export function isSqlFragment(value: unknown): value is SqlFragment {
  return typeof value === 'object' && value !== null && SQL_FRAGMENT in value;
}

function isRawSql(value: unknown): value is RawSql {
  return typeof value === 'object' && value !== null && SQL_RAW in value;
}

/**
 * Compile a fragment for SQLite. This is the only writer of placeholder
 * syntax in the framework.
 */
export function compileSql(fragment: SqlFragment): CompiledSql {
  let text = '';
  const params: unknown[] = [];
  for (const part of fragment.parts) {
    if (part.kind === 'text') {
      text += part.text;
      continue;
    }
    params.push(part.value);
    text += '?';
  }
  return { text, params };
}

function makeFragment(parts: Part[]): SqlFragment {
  return { [SQL_FRAGMENT]: true as const, parts };
}

function sqlTag(strings: TemplateStringsArray, ...values: unknown[]): SqlFragment {
  const parts: Part[] = [];
  for (let index = 0; index < strings.length; index += 1) {
    parts.push({ kind: 'text', text: strings[index] });
    if (index < values.length) {
      const value = values[index];
      if (isSqlFragment(value)) {
        parts.push(...value.parts);
      } else if (isRawSql(value)) {
        parts.push({ kind: 'text', text: value.text });
      } else {
        parts.push({ kind: 'param', value });
      }
    }
  }
  return makeFragment(parts);
}

/**
 * Escape hatch for interpolating raw SQL text (e.g. a column name that must
 * vary). Deliberately loud and greppable; banned in demo apps by the
 * constraints suite. Anything user-influenced must never pass through here.
 */
function dangerous(text: string): RawSql {
  if (typeof text !== 'string') {
    throw new TypeError('sql.dangerous() takes a string.');
  }
  return { [SQL_RAW]: true as const, text };
}

/** The tagged template building parameterized SQL descriptors - injection-safe by construction; sql.dangerous() is the only (greppable) raw-text escape. */
export const sql: ((strings: TemplateStringsArray, ...values: unknown[]) => SqlFragment) & {
  dangerous: typeof dangerous;
} = Object.assign(sqlTag, { dangerous });
