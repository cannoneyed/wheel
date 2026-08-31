/**
 * Row storage primitives used inside the Wheel materializer.
 * Rows are frozen plain objects; ALL writes go through the patch vocabulary
 * (put/update/delete), so the representation is swappable behind this file.
 */
import { validateTableKey, type OptimisticCache, type TableDecl } from '../declarations';

/** A plain JSON row object - always frozen, only ever created by the cache. */
export type Row = Record<string, unknown>;
/** The client-side row pool: table name -> id -> frozen row. */
export type Tables = Map<string, Map<string, Row>>;

/** Get (or lazily create) one table's row map inside a Tables pool. */
export function tableMap(tables: Tables, table: string): Map<string, Row> {
  let map = tables.get(table);
  if (!map) {
    map = new Map();
    tables.set(table, map);
  }
  return map;
}

/**
 * Shallow-clone the pool for optimistic rebase - maps are copied, row objects
 * shared. Sharing is safe ONLY because every write path replaces rows with
 * new frozen objects (OverlayCache.put/update, the client's applySnapshot/
 * applyDelta); a write path that mutated a row in place would corrupt base
 * through the shared reference. That freeze is UNCONDITIONAL - production
 * included - because freezing is cheap at wheel's row counts and the
 * alternative is silent corruption of server truth in exactly the builds
 * where nothing would catch it.
 */
export function cloneTables(tables: Tables): Tables {
  const clone: Tables = new Map();
  for (const [name, rows] of tables) {
    clone.set(name, new Map(rows));
  }
  return clone;
}

/**
 * Deep-freeze a row so in-place mutation throws (in strict mode) instead of
 * silently corrupting the base/effective shared rows. Unconditional - there is
 * no production bypass: cloneTables shares row objects between base and
 * effective state, so an unfrozen row mutated in place would corrupt the
 * client's copy of server truth with no error anywhere. Freezing is cheap at
 * wheel's row counts; that risk is not.
 */
export function freezeRow(row: Row): Row {
  if (Object.isFrozen(row)) {
    return row;
  }
  for (const value of Object.values(row)) {
    if (typeof value === 'object' && value !== null) {
      freezeDeep(value);
    }
  }
  return Object.freeze(row);
}

function freezeDeep(value: object): void {
  if (Object.isFrozen(value)) {
    return;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (typeof nested === 'object' && nested !== null) {
      freezeDeep(nested);
    }
  }
}

/** One write an optimistic handler performed - recorded for provenance and rollback bookkeeping. */
export interface RecordedWrite {
  readonly table: string;
  readonly rowId: string;
  /** undefined = delete */
  readonly value: Row | undefined;
}

/**
 * The OptimisticCache handed to optimistic handlers: a working view over a
 * set of tables, recording every write (for provenance and rebase).
 */
export class OverlayCache implements OptimisticCache {
  /** Every write this overlay performed, in order - provenance and rebase bookkeeping. */
  readonly writes: RecordedWrite[] = [];

  constructor(private readonly tables: Tables) {}

  /** One row by id, or undefined. */
  get<R extends Row>(table: TableDecl<R>, id: string): R | undefined {
    return tableMap(this.tables, table.name).get(id) as R | undefined;
  }

  /** All rows of a table in the working view. */
  list<R extends Row>(table: TableDecl<R>): readonly R[] {
    return [...tableMap(this.tables, table.name).values()] as R[];
  }

  /** Create or replace a row (frozen on entry). */
  put<R extends Row>(table: TableDecl<R>, row: R): void {
    const frozen = freezeRow({ ...row }) as R;
    const id = validateTableKey(table, frozen, 'optimistic cache put');
    tableMap(this.tables, table.name).set(id, frozen);
    this.writes.push({ table: table.name, rowId: id, value: frozen });
  }

  /** Patch an existing row; throws if it does not exist (use put to create). */
  update<R extends Row>(table: TableDecl<R>, id: string, patch: Partial<R>): void {
    const existing = tableMap(this.tables, table.name).get(id);
    if (!existing) {
      throw new Error(`cache.update(${table.name}, ${id}): row does not exist. Use put() to create rows.`);
    }
    const next = freezeRow({ ...existing, ...patch });
    tableMap(this.tables, table.name).set(id, next);
    this.writes.push({ table: table.name, rowId: id, value: next });
  }

  /** Remove a row from the working view. */
  delete<R extends Row>(table: TableDecl<R>, id: string): void {
    tableMap(this.tables, table.name).delete(id);
    this.writes.push({ table: table.name, rowId: id, value: undefined });
  }
}
