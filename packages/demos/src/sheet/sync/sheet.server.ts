/**
 * Sheet server bindings: SQL for the query, the authoritative upsert-or-clear
 * handler for the mutation. Must mirror the optimistic handler in
 * sheet.sync.ts — same branches, same id order. (`row` is quoted throughout
 * for defensiveness; the upsert's `on conflict ("row", col)` is SQLite-native.)
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';
import {
  cellList,
  clearColumn,
  deleteCells,
  restoreCells,
  setCell
} from './sheet.sync';

/** Schema + seed rows for the demo server's fresh SQLite database (the default backend). */
export const SHEET_SCHEMA = {
  create: [
    `create table cells (
       id text primary key,
       "row" integer not null,
       col integer not null,
       value text not null,
       unique ("row", col))`
  ],
  seed: [
    `insert into cells (id, "row", col, value) values
       ('cell_0190b62e-0000-7000-8000-000000000001', 1, 1, 'Item'),
       ('cell_0190b62e-0000-7000-8000-000000000002', 1, 2, 'Qty'),
       ('cell_0190b62e-0000-7000-8000-000000000003', 1, 3, 'Price'),
       ('cell_0190b62e-0000-7000-8000-000000000004', 2, 1, 'Widget'),
       ('cell_0190b62e-0000-7000-8000-000000000005', 2, 2, '4'),
       ('cell_0190b62e-0000-7000-8000-000000000006', 2, 3, '2.50'),
       ('cell_0190b62e-0000-7000-8000-000000000007', 3, 1, 'Gadget'),
       ('cell_0190b62e-0000-7000-8000-000000000008', 3, 2, '2'),
       ('cell_0190b62e-0000-7000-8000-000000000009', 3, 3, '7.25')`
  ]
};

export const cellListServer = serveQuery({
  query: cellList,
  sql: () => sql`select id, "row", col, value from cells order by "row", col`,
  rerunOn: ['cells']
});

export const setCellServer = serveMutation({
  mutation: setCell,
  handler: async (tx, args, ctx) => {
    // Always mint first — mirrors sheet.sync.ts's optimistic handler, so the
    // pre-generated id stream aligns on every branch. Used only on insert.
    const id = ctx.newId('cell');
    if (args.value === '') {
      await tx.sql`delete from cells where "row" = ${args.row} and col = ${args.col}`;
      return;
    }
    await tx.sql`insert into cells (id, "row", col, value)
                 values (${id}, ${args.row}, ${args.col}, ${args.value})
                 on conflict ("row", col) do update set value = excluded.value`;
  }
});

export const clearColumnServer = serveMutation({
  mutation: clearColumn,
  handler: async (tx, args) => {
    await tx.sql`delete from cells where col = ${args.col}`;
  }
});

export const deleteCellsServer = serveMutation({
  mutation: deleteCells,
  handler: async (tx, args) => {
    for (const cellId of args.cellIds) {
      await tx.sql`delete from cells where id = ${cellId}`;
    }
  }
});

export const restoreCellsServer = serveMutation({
  mutation: restoreCells,
  handler: async (tx, args) => {
    for (const row of args.rows) {
      await tx.sql`
        insert or replace into cells (id, "row", col, value)
        values (${row.id}, ${row.row}, ${row.col}, ${row.value})
      `;
    }
  }
});
