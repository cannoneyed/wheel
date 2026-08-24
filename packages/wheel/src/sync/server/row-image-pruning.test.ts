// @vitest-environment node
/**
 * SQLite does not capture row images. A prune predicate therefore falls back
 * to safe query re-runs. The diff still emits only changed query results.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { mutation, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveMutation, serveQuery } from './serve';
import { SqlQueryHandler } from './query-handler';
import type { SyncServer } from './engine';
import { createSyncServer } from './node-engine';
import { betterSqlite3Driver, type SqliteDriver } from './backends/sqlite-driver';

const TodoRow = t.object({ id: t.string(), listId: t.string(), text: t.string() });
const todos = table({ name: 'todos', type: TodoRow, key: (row) => row.id });
const todosByList = query({
  name: 'todos.byList',
  params: t.object({ listId: t.string() }),
  into: todos,
  projection: { filter: (row, params) => row.listId === params.listId }
});
const addTodo = mutation({ name: 'todos.add', args: t.object({ listId: t.string(), text: t.string() }) });

const syncModule = { todos, todosByList, addTodo };
const servers = {
  todosByListServer: serveQuery({
    query: todosByList,
    handler: SqlQueryHandler({
      sql: (params) => sql`select id, list_id as "listId", text from todos where list_id = ${params.listId} order by id`,
      rerunOn: ['todos'],
      // Raw table shape (snake_case) — deliberately not the projected row.
      prune: (image, params) =>
        image.o?.list_id === params.listId || image.n?.list_id === params.listId
    })
  }),
  addTodoServer: serveMutation({
    mutation: addTodo,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into todos (id, list_id, text) values (${ctx.newId('todo')}, ${args.listId}, ${args.text})`;
    }
  })
};

let driver: SqliteDriver;
let db: { query(text: string, params?: readonly unknown[]): Promise<Record<string, unknown>[]> };
let server: SyncServer;
const principal = {
  actor: 'tester',
  workspaceId: 'workspace:test',
  sessionId: 'session:test'
};

beforeEach(async () => {
  driver = betterSqlite3Driver(':memory:');
  db = { query: (text, params) => Promise.resolve(driver.all(text, params)) };
  await db.query(`create table todos (id text primary key, list_id text not null, text text not null)`);
  server = await createSyncServer({
    sqlite: { driver },
    syncModules: [syncModule],
    servers: [servers],
    rowImages: true
  });
});

afterEach(async () => {
  await server.close();
});

function runsOf(listId: string): number {
  const info = server
    .debugSubscriptions()
    .find((sub) => (sub.params as { listId: string }).listId === listId);
  return info?.runs ?? -1;
}

describe('row-image pruning fallback', () => {
  test('SQLite re-runs every matching query but emits only changed deltas', async () => {
    const connection = server.connect('web_prune', principal);
    const deltas: string[] = [];
    connection.onEvent((event) => {
      if (event.type === 'delta') deltas.push(event.delta.subscriptionId);
    });
    const subA = await connection.subscribe('todos.byList', { listId: 'list_a' });
    const subB = await connection.subscribe('todos.byList', { listId: 'list_b' });
    const runsA = runsOf('list_a');
    const runsB = runsOf('list_b');

    // SQLite has no images, so both subscriptions re-run.
    await server.mutate(
      {
        clientId: 'web_prune',
        mutationId: 'm_0190b62e-0000-7000-8000-0000000000b1',
        name: 'todos.add',
        args: { listId: 'list_b', text: 'for b' },
        ids: ['todo_0190b62e-0000-7000-8000-0000000000b2']
      },
      principal
    );
    await server.idle();
    expect(runsOf('list_a')).toBe(runsA + 1);
    expect(runsOf('list_b')).toBe(runsB + 1);
    expect(deltas).toEqual([subB.subscriptionId]);

    // The second write again re-runs both subscriptions.
    await server.mutate(
      {
        clientId: 'web_prune',
        mutationId: 'm_0190b62e-0000-7000-8000-0000000000a1',
        name: 'todos.add',
        args: { listId: 'list_a', text: 'for a' },
        ids: ['todo_0190b62e-0000-7000-8000-0000000000a2']
      },
      principal
    );
    await server.idle();
    expect(runsOf('list_a')).toBe(runsA + 2);
    expect(runsOf('list_b')).toBe(runsB + 2);
    expect(deltas).toEqual([subB.subscriptionId, subA.subscriptionId]);
  });

  test('external writes carry no images — pruned queries still re-run (fallback to Tier-0)', async () => {
    const connection = server.connect('web_fallback', principal);
    await connection.subscribe('todos.byList', { listId: 'list_a' });
    const runsA = runsOf('list_a');
    // The write happens outside the engine. externalWrite reports tables only.
    await db.query(
      `insert into todos (id, list_id, text) values ('todo_0190b62e-0000-7000-8000-0000000000e1', 'list_b', 'external b')`
    );
    await server.externalWrite({ tables: ['todos'], source: 'test' });
    await server.idle();
    // No images → prune cannot prove irrelevance → re-run happened (and
    // correctly emitted nothing).
    expect(runsOf('list_a')).toBe(runsA + 1);
  });
});
