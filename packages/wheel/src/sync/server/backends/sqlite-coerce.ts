/**
 * Schema-aware read-side type repair for the SQLite backend — the seam that
 * makes an app never see the test-vs-prod database difference.
 *
 * THE PROBLEM in one example: a column declared `t.boolean()` is written as JS
 * `true`, which the driver stores as the integer 1 (SQLite has no boolean type).
 * Read back, it comes out as the number 1 — and the engine validates every row
 * through zod (`validateRow`), where `t.boolean()` rejects `1`. So the row that
 * round-tripped through SQLite fails validation even though nothing is wrong
 * with it. This module repairs the value before schema validation.
 *
 * HOW: at `init` the backend hands us each declared table's zod row schema. We
 * introspect the schemas, find every column whose declared type is one SQLite
 * cannot store natively (boolean → stored as 0/1; bigint → handed back as a JS
 * number by the driver), and build a map of column-name → repair function. The
 * backend applies that map to every result row BEFORE the rows reach the engine,
 * turning 0/1 back into false/true (and number back into bigint).
 *
 * WHY KEYED BY COLUMN NAME, not by table: the backend's reader runs arbitrary
 * app SQL (`select id, done from tasks`) and sees the result COLUMN NAMES, but
 * not which table they came from — nobody parses the SQL. So the repair is keyed
 * by column name across the union of all declared tables. If the same name is
 * declared with CONFLICTING types in two tables (boolean in one, number in
 * another), it is dropped from the map rather than mis-repaired — validation
 * still guards it, and the real app schemas have no such conflict. This is a
 * safety net, not an expected case.
 */
import type { RowSchema } from '../../schema';
import type { SqliteRow } from './sqlite-driver';

/** One column's repair: raw SQLite value in, the JS value the zod schema expects out. Returns the value unchanged when nothing needs fixing (e.g. a null in a nullable column). */
export type ColumnCoercer = (value: unknown) => unknown;

/** Column name → repair function, for exactly the declared columns whose SQLite storage drifts from what zod validates. Empty when no declared column needs repair. */
export type CoercionMap = ReadonlyMap<string, ColumnCoercer>;

/** zod v4 wrapper types that hold an `innerType`; peel these to reach the underlying base type / object. */
const WRAPPER_TYPES = new Set(['optional', 'nullable', 'default', 'prefault', 'catch', 'readonly', 'nonoptional']);

/** Read a zod v4 schema's internal def ({ type, innerType, shape }) without a hard dependency on zod's private types. */
function zodDef(schema: unknown): { type?: string; innerType?: unknown; shape?: Record<string, unknown> } | undefined {
  return (schema as { _zod?: { def?: { type?: string; innerType?: unknown; shape?: Record<string, unknown> } } })?._zod?.def;
}

/** Peel optional/nullable/default/… wrappers off a column schema to its underlying zod type string (`'boolean'`, `'string'`, `'bigint'`, `'enum'`, …). */
function baseType(schema: unknown): string | undefined {
  let current = schema;
  for (let depth = 0; depth < 20; depth += 1) {
    const def = zodDef(current);
    if (!def?.type) {
      return undefined;
    }
    if (WRAPPER_TYPES.has(def.type)) {
      current = def.innerType;
      continue;
    }
    return def.type;
  }
  return undefined;
}

/** Peel wrappers off a row schema to reach the underlying object's `shape` (column-name → column schema), or undefined if it is not an object at the base. */
function objectShape(schema: RowSchema): Record<string, unknown> | undefined {
  let current: unknown = schema;
  for (let depth = 0; depth < 20; depth += 1) {
    const def = zodDef(current);
    if (!def?.type) {
      return undefined;
    }
    if (def.type === 'object') {
      return def.shape;
    }
    if (WRAPPER_TYPES.has(def.type)) {
      current = def.innerType;
      continue;
    }
    return undefined;
  }
  return undefined;
}

/** SQLite stores booleans as the integers 0/1; turn them into real false/true. Leaves null (nullable column) and already-boolean values untouched. */
const coerceBoolean: ColumnCoercer = (value) => (typeof value === 'number' ? value !== 0 : value);

/** A `t.bigint()` column: the driver narrows integers to JS `number` (see SqliteDriver.coerceValue), but zod wants a bigint — widen number → bigint. Leaves null/bigint untouched. */
const coerceBigint: ColumnCoercer = (value) => (typeof value === 'number' ? BigInt(value) : value);

/** The repair for a given base type, or undefined when SQLite represents that type natively (string, number, real, enum, null — no repair needed). */
function coercerFor(type: string | undefined): ColumnCoercer | undefined {
  if (type === 'boolean') {
    return coerceBoolean;
  }
  if (type === 'bigint') {
    return coerceBigint;
  }
  return undefined;
}

/**
 * Build the read-side coercion map from the declared table schemas. Collects, per
 * column name, the set of base types it is declared as across every table; a name
 * with exactly ONE base type that needs repair (boolean, bigint) gets a coercer,
 * a name declared with conflicting types is skipped (order-independent — see the
 * module doc). Absent/empty schemas produce an empty map (the conformance runs
 * that boot without schemas keep their raw SQLite types, unchanged).
 */
export function buildCoercionMap(tableSchemas: ReadonlyMap<string, RowSchema> | undefined): CoercionMap {
  if (!tableSchemas || tableSchemas.size === 0) {
    return new Map();
  }
  const typesByColumn = new Map<string, Set<string | undefined>>();
  for (const schema of tableSchemas.values()) {
    const shape = objectShape(schema);
    if (!shape) {
      continue;
    }
    for (const [column, columnSchema] of Object.entries(shape)) {
      let seen = typesByColumn.get(column);
      if (!seen) {
        seen = new Set();
        typesByColumn.set(column, seen);
      }
      seen.add(baseType(columnSchema));
    }
  }
  const map = new Map<string, ColumnCoercer>();
  for (const [column, seen] of typesByColumn) {
    if (seen.size !== 1) {
      continue; // conflicting declarations for this name across tables — don't guess
    }
    const coercer = coercerFor([...seen][0]);
    if (coercer) {
      map.set(column, coercer);
    }
  }
  return map;
}

/**
 * Apply the coercion map across every result row, repairing only the mapped
 * columns. Rows without any mapped column (or an empty map) pass through with no
 * copy; a row that needs a repair is shallow-copied so callers' inputs are never
 * mutated.
 */
export function applyCoercion(rows: SqliteRow[], map: CoercionMap): SqliteRow[] {
  if (map.size === 0) {
    return rows;
  }
  return rows.map((row) => {
    let copy: SqliteRow | undefined;
    for (const [column, coercer] of map) {
      if (!(column in row)) {
        continue;
      }
      const next = coercer(row[column]);
      if (next === row[column]) {
        continue;
      }
      copy ??= { ...row };
      copy[column] = next;
    }
    return copy ?? row;
  });
}
