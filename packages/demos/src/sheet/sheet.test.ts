// @vitest-environment node
/**
 * The sheet vertical against a real in-process engine: upsert convergence,
 * the id-stream alignment discipline (update must not duplicate), clearing,
 * and the computed-with-args service layer (cellAt / columnSum).
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { World } from 'wheel/testing';
import { SheetService } from './services/sheet-service';
import * as sheetSync from './sync/sheet.sync';
import * as sheetServer from './sync/sheet.server';
import { SHEET_SCHEMA } from './sync/sheet.server';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [sheetSync],
    servers: [sheetServer],
    setup: async (db) => {
      for (const statement of [...SHEET_SCHEMA.create, ...SHEET_SCHEMA.seed]) {
        await db.query(statement);
      }
    }
  });
}

describe('sheet demo', () => {
  test('setting a new cell converges across two clients', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');

    const serviceA = new ServiceContext({ client: a }).get(SheetService);
    const serviceB = new ServiceContext({ client: b }).get(SheetService);
    await a.subscribe(sheetSync.cellList, {});
    await b.subscribe(sheetSync.cellList, {});

    serviceA.set(5, 4, 'hello');
    // Optimistic: A sees it instantly; B doesn't yet.
    expect(serviceA.cellAt(5, 4)).toBe('hello');
    expect(serviceB.cellAt(5, 4)).toBe('');

    await world.settle();
    expect(serviceB.cellAt(5, 4)).toBe('hello');
    await world.close();
  });

  test('updating an existing cell converges without duplicating (id-stream alignment)', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');

    const serviceA = new ServiceContext({ client: a }).get(SheetService);
    const serviceB = new ServiceContext({ client: b }).get(SheetService);
    const handleA = await a.subscribe(sheetSync.cellList, {});
    const handleB = await b.subscribe(sheetSync.cellList, {});
    const before = handleA.rows().length;
    expect(serviceA.cellAt(1, 1)).toBe('Item'); // seeded

    // Both handlers mint one 'cell' id but only USE it on insert; if the
    // server took the insert path here it would either duplicate the cell or
    // blow up on the unique index — either way the assertions below catch it.
    serviceA.set(1, 1, 'Product');
    expect(serviceA.cellAt(1, 1)).toBe('Product'); // optimistic

    await world.settle();
    expect(serviceA.cellAt(1, 1)).toBe('Product'); // confirmed, not rolled back
    expect(serviceB.cellAt(1, 1)).toBe('Product');
    expect(handleA.rows().length).toBe(before); // updated in place, no duplicate
    expect(handleB.rows().length).toBe(before);
    await world.close();
  });

  test('clearing a cell (empty value) removes it', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');

    const serviceA = new ServiceContext({ client: a }).get(SheetService);
    const serviceB = new ServiceContext({ client: b }).get(SheetService);
    const handleA = await a.subscribe(sheetSync.cellList, {});
    await b.subscribe(sheetSync.cellList, {});
    const before = handleA.rows().length;
    expect(serviceA.cellAt(2, 2)).toBe('4'); // seeded

    serviceA.set(2, 2, '');
    expect(serviceA.cellAt(2, 2)).toBe(''); // optimistic delete

    await world.settle();
    expect(serviceA.cellAt(2, 2)).toBe('');
    expect(serviceB.cellAt(2, 2)).toBe('');
    expect(handleA.rows().length).toBe(before - 1);
    await world.close();
  });

  test('columnSum recomputes after sets and skips non-numeric cells', async () => {
    const world = await makeWorld();
    const client = await world.client('web_c');
    const service = new ServiceContext({ client }).get(SheetService);
    await client.subscribe(sheetSync.cellList, {});
    await world.settle();

    // Seeded col 2: 'Qty' (ignored) + 4 + 2; seeded col 3: 'Price' + 2.50 + 7.25.
    expect(service.columnSum(2)).toBe(6);
    expect(service.columnSum(3)).toBe(9.75);

    service.set(4, 2, '10');
    expect(service.columnSum(2)).toBe(16); // optimistic, instantly
    await world.settle();
    expect(service.columnSum(2)).toBe(16); // confirmed, still true

    service.set(2, 2, ''); // clear the seeded 4
    await world.settle();
    expect(service.columnSum(2)).toBe(12);
    await world.close();
  });

  test('cellAt returns the empty string for empty cells', async () => {
    const world = await makeWorld();
    const client = await world.client('web_d');
    const service = new ServiceContext({ client }).get(SheetService);
    await client.subscribe(sheetSync.cellList, {});
    await world.settle();

    expect(service.cellAt(12, 8)).toBe('');
    expect(service.cellAt(1, 1)).toBe('Item');
    // Clearing an already-empty cell is a no-op on both sides — and still
    // consumes exactly one minted id on each, keeping the stream aligned.
    service.set(12, 8, '');
    await world.settle();
    expect(service.cellAt(12, 8)).toBe('');
    await world.close();
  });

  test('clear column is one mutation and one undo/redo step', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_clear_a', 'web_clear_b');
    const serviceA = new ServiceContext({ client: a }).get(SheetService);
    const serviceB = new ServiceContext({ client: b }).get(SheetService);
    await a.subscribe(sheetSync.cellList, {});
    await b.subscribe(sheetSync.cellList, {});

    const original = serviceA.list.rows
      .filter((cell) => cell.col === 2)
      .map((cell) => ({ id: cell.id, row: cell.row, value: cell.value }));
    serviceA.clearColumn(2);
    expect(serviceA.columnCellCount(2)).toBe(0);
    expect(a.mutationState(sheetSync.clearColumn).all).toHaveLength(1);
    await world.settle();
    expect(serviceB.columnCellCount(2)).toBe(0);

    a.undo();
    await world.settle();
    expect(
      original.every(
        (cell) =>
          serviceA.cellAt(cell.row, 2) === cell.value &&
          serviceB.cellAt(cell.row, 2) === cell.value
      )
    ).toBe(true);

    a.redo();
    await world.settle();
    expect(serviceA.columnCellCount(2)).toBe(0);
    expect(serviceB.columnCellCount(2)).toBe(0);
    await world.close();
  });
});
