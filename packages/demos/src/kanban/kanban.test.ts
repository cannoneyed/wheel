// @vitest-environment node
/**
 * The kanban vertical against a real in-process engine: fractional-position
 * moves converging across clients, bulk delete, the contributed context-menu
 * model probed headlessly, and tag filtering through the service layer.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';
import { World } from 'wheel/testing';
import { BoardService } from './services/board-service';
import { SelectionService } from './services/selection-service';
import * as kanbanSync from './sync/kanban.sync';
import * as kanbanServer from './sync/kanban.server';
import { KANBAN_SCHEMA } from './sync/kanban.server';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [kanbanSync],
    servers: [kanbanServer],
    setup: async (db) => {
      for (const statement of [...KANBAN_SCHEMA.create, ...KANBAN_SCHEMA.seed]) {
        await db.query(statement);
      }
    }
  });
}

describe('kanban demo', () => {
  test('moves between columns converge across two clients with correct positions', async () => {
    const world = await makeWorld();
    const [a, b] = await world.twoClients('web_a', 'web_b');
    const serviceA = new ServiceContext({ client: a }).get(BoardService);
    const serviceB = new ServiceContext({ client: b }).get(BoardService);
    await a.subscribe(kanbanSync.cardList, {});
    await b.subscribe(kanbanSync.cardList, {});

    const moved = serviceA.cardsIn('todo')[0];
    serviceA.moveToEnd(moved.id, 'doing');
    // Optimistic: A sees the card at the tail of doing instantly; B doesn't yet.
    expect(serviceA.cardsIn('doing').at(-1)?.id).toBe(moved.id);
    expect(serviceA.cardsIn('todo').some((card) => card.id === moved.id)).toBe(false);
    expect(serviceB.cardsIn('doing').some((card) => card.id === moved.id)).toBe(false);

    await world.settle();
    // Converged: same order, same positions, on both clients. Seeded doing
    // tail was position 1, so the moved card landed at 2 (tail + 1).
    expect(serviceB.cardsIn('doing').at(-1)?.id).toBe(moved.id);
    expect(serviceB.cardsIn('doing').at(-1)?.position).toBe(2);
    expect(serviceB.cardsIn('doing').map((card) => [card.id, card.position])).toEqual(
      serviceA.cardsIn('doing').map((card) => [card.id, card.position])
    );
    await world.close();
  });

  test('move between two siblings lands at the fractional midpoint', async () => {
    const world = await makeWorld();
    const client = await world.client('web_c');
    const service = new ServiceContext({ client }).get(BoardService);
    await client.subscribe(kanbanSync.cardList, {});

    // Seeded todo positions are 0, 1, 2 — drop the last card between the
    // first two: positionBetween(0, 1) = 0.5.
    const [first, second, third] = service.cardsIn('todo');
    service.move(third.id, 'todo', first, second);
    expect(service.cardsIn('todo').map((card) => card.id)).toEqual([first.id, third.id, second.id]);
    await world.settle();
    expect(service.cardsIn('todo').map((card) => card.id)).toEqual([first.id, third.id, second.id]);
    expect(service.cardsIn('todo')[1].position).toBe(0.5);
    await world.close();
  });

  test('bulk delete removes every selected card through the service', async () => {
    const world = await makeWorld();
    const client = await world.client('web_d');
    const context = new ServiceContext({ client });
    const board = context.get(BoardService);
    const selection = context.get(SelectionService);
    await client.subscribe(kanbanSync.cardList, {});

    const total = board.list.rows.length;
    const [first, second] = board.list.rows;
    selection.toggle(first.id);
    selection.toggle(second.id);
    expect(selection.count()).toBe(2);

    board.removeMany(selection.ids());
    selection.clear();
    expect(selection.count()).toBe(0);
    // Optimistic: both rows gone instantly.
    expect(board.list.rows.some((card) => card.id === first.id || card.id === second.id)).toBe(false);
    await world.settle();
    expect(board.list.rows.length).toBe(total - 2);
    await world.close();
  });

  test('context-menu service: registration lifecycle and single-open, headlessly', async () => {
    const world = await makeWorld();
    const client = await world.client('web_e');
    const context = new ServiceContext({ client });
    const board = context.get(BoardService);
    const menu = context.get(ContextMenuService);
    await client.subscribe(kanbanSync.cardList, {});

    // The menu CONTENT is an ordinary component (CardContextMenu) tested at
    // the stub tiers; headless coverage here is the system's global
    // awareness: registration, single-open by construction, and the composed
    // actions the menu's connect shape uses.
    const el = {} as HTMLElement;
    const unregisterA = menu.register({ id: 'card:a', element: el, render: () => null, anchor: 'pointer', owner: null });
    menu.register({ id: 'card:b', element: el, render: () => null, anchor: 'pointer', owner: null });

    menu.open('card:a', { x: 1, y: 2 });
    expect(menu.openId()).toBe('card:a');
    menu.open('card:b', { x: 3, y: 4 });
    expect(menu.openId()).toBe('card:b'); // scalar atom: opening b IS closing a

    // Unregistering the open menu closes it (trigger unmounted).
    menu.open('card:a', { x: 1, y: 2 });
    unregisterA();
    expect(menu.openId()).toBeNull();

    // The action the menu composes behaves identically to the old model item.
    const card = board.cardsIn('todo')[0];
    void board.moveToEnd(card.id, 'done');
    expect(board.cardsIn('done').at(-1)?.id).toBe(card.id);
    await world.settle();
    expect(board.cardsIn('done').at(-1)?.id).toBe(card.id);
    await world.close();
  });

  test('tag filtering narrows cardsIn (the FilterService surface)', async () => {
    const world = await makeWorld();
    const client = await world.client('web_f');
    const board = new ServiceContext({ client }).get(BoardService);
    await client.subscribe(kanbanSync.cardList, {});

    // Exactly what FilterService cherry-picks: tags, active, apply, clear.
    expect(board.tags()).toEqual(['bug', 'design', 'infra']);
    expect(board.tagFilter.get()).toBe(null);

    board.setTag('infra');
    expect(board.tagFilter.get()).toBe('infra');
    const visible = board.columns().flatMap((column) => board.cardsIn(column.id));
    expect(visible.length).toBe(3);
    expect(visible.every((card) => card.tag === 'infra')).toBe(true);

    board.setTag(null);
    const all = board.columns().flatMap((column) => board.cardsIn(column.id));
    expect(all.length).toBe(6);
    await world.close();
  });
});
