/**
 * Sheet sync module: the shared client/server contract. Both sides compile
 * against these declarations; the optimistic handler here must mirror the
 * server handler in sheet.server.ts (same writes, same id order).
 */
import {
  mutation,
  query,
  t,
  collection,
  type Infer,
  type InverseSpec,
  type MutationDecl
} from 'wheel/sync';

/** One cell as it lives in SQLite and every client cache. Empty cells have no row. */
export const CellRow = t.object({
  id: t.string(),
  row: t.number(),
  col: t.number(),
  value: t.string()
});

export const cells = collection({ name: 'cells', type: CellRow, key: (row) => row.id });

/** Every populated cell of the sheet, server-ordered by (row, col). */
export const cellList = query({
  name: 'cells.all',
  params: t.object({}),
  into: cells,
  projection: {
    filter: () => true,
    sort: (a, b) => a.row - b.row || a.col - b.col
  }
});

/**
 * Upsert-or-clear one cell. Empty value deletes; otherwise update the
 * existing cell at (row, col) or insert a new one.
 *
 * Id discipline: BOTH handlers mint exactly one 'cell' id up front, even on
 * the update/delete paths, so the deterministic id stream stays aligned no
 * matter which branch each side takes. The id is only USED when inserting.
 */
export const setCell = mutation({
  name: 'cells.set',
  args: t.object({ row: t.number(), col: t.number(), value: t.string() }),
  optimistic: (cache, args, ctx) => {
    // Always mint first — mirrors sheet.server.ts exactly (see doc above).
    const id = ctx.newId('cell');
    const existing = cache
      .list(cells)
      .find((cell) => cell.row === args.row && cell.col === args.col);
    if (args.value === '') {
      if (existing) {
        cache.delete(cells, existing.id);
      }
      return;
    }
    if (existing) {
      cache.update(cells, existing.id, { value: args.value });
    } else {
      cache.put(cells, { id, row: args.row, col: args.col, value: args.value });
    }
  }
});

const RestoreCellsArgs = t.object({ rows: t.array(CellRow) });
type RestoreCellsArgs = Infer<typeof RestoreCellsArgs>;
const DeleteCellsArgs = t.object({ cellIds: t.array(t.string()) });
type DeleteCellsArgs = Infer<typeof DeleteCellsArgs>;
const ClearColumnArgs = t.object({ col: t.number() });
type ClearColumnArgs = Infer<typeof ClearColumnArgs>;

/** Restore exact cell rows; used as the inverse of atomic bulk deletes. */
export const restoreCells: MutationDecl<RestoreCellsArgs> = mutation({
  name: 'cells.restoreMany',
  args: RestoreCellsArgs,
  optimistic: (cache, args) => {
    for (const row of args.rows) {
      cache.put(cells, row);
    }
  },
  invert: (_reader, args): InverseSpec | null =>
    args.rows.length === 0
      ? null
      : {
          mutation: deleteCells,
          args: { cellIds: args.rows.map((row) => row.id) },
          description: 'clear column'
        }
});

/** Delete exact cell ids; this makes redo precise after a column clear. */
export const deleteCells: MutationDecl<DeleteCellsArgs> = mutation({
  name: 'cells.deleteMany',
  args: DeleteCellsArgs,
  optimistic: (cache, args) => {
    for (const cellId of args.cellIds) {
      cache.delete(cells, cellId);
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const rows = args.cellIds.flatMap((cellId) => {
      const row = reader.get(cells, cellId);
      return row ? [row] : [];
    });
    return rows.length === 0
      ? null
      : {
          mutation: restoreCells,
          args: { rows },
          description: 'clear column'
        };
  }
});

/** Clear one column in one mutation, one server transaction, and one undo step. */
export const clearColumn: MutationDecl<ClearColumnArgs> = mutation({
  name: 'cells.clearColumn',
  args: ClearColumnArgs,
  optimistic: (cache, args) => {
    for (const cell of cache.list(cells)) {
      if (cell.col === args.col) {
        cache.delete(cells, cell.id);
      }
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const rows = reader.list(cells).filter((cell) => cell.col === args.col);
    return rows.length === 0
      ? null
      : {
          mutation: restoreCells,
          args: { rows },
          description: 'clear column'
        };
  }
});
