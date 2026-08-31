// @vitest-environment node
/**
 * A COLD subscribe that fails transiently must not die for the life of the
 * client (2026-08-10: a subscribe racing a hub restart got a 409, the
 * service layer's error is sticky, and the empty-forever view armed the
 * mark-read storm). The contract:
 *  - a TransientSyncError parks the subscribe; the caller's promise stays
 *    pending and the view stays honestly 'loading';
 *  - the park retries on the next healthy-wire signal and then serves rows;
 *  - a server VERDICT (plain Error) still rejects — sticky is correct there.
 */
import { describe, expect, test } from 'vitest';

import { mutation, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveQuery, serveMutation } from '../server/serve';
import { fixedClock, seededRandomBytes } from '../ids';
import { World } from '../../testing/world';
import { SyncClient } from './client';
import { MemoryCache } from './local-cache';
import { TransientSyncError } from './transport';
import type { SyncTransport } from './transport';

const TodoRow = t.object({
  id: t.string(),
  listId: t.string(),
  text: t.string(),
  done: t.boolean(),
  position: t.number()
});
const todos = table({ name: 'todos', type: TodoRow, key: (row) => row.id });
const todosByList = query({
  name: 'todos.byList',
  params: t.object({ listId: t.string() }),
  into: todos,
  projection: {
    filter: (row, params) => row.listId === params.listId,
    sort: (a, b) => a.position - b.position
  }
});
const addTodo = mutation({
  name: 'todos.add',
  args: t.object({ listId: t.string(), text: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.put(todos, {
      id: ctx.newId('todo'),
      listId: args.listId,
      text: args.text,
      done: false,
      position: cache.list(todos).length
    });
  }
});
const syncModule = { todos, todosByList, addTodo };

const servers = {
  todosByListServer: serveQuery({
    query: todosByList,
    sql: (params) => sql`
      select id, list_id as "listId", text, done, position
      from todos where list_id = ${params.listId}
      order by position`,
    rerunOn: ['todos']
  }),
  addTodoServer: serveMutation({
    mutation: addTodo,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into todos (id, list_id, text, done, position)
                   values (${ctx.newId('todo')}, ${args.listId}, ${args.text}, false, 0)`;
    }
  })
};

const seedTodos = async (db: { query(text: string, params?: readonly unknown[]): Promise<unknown[]> }) => {
  await db.query(`create table todos (
    id text primary key, list_id text not null, text text not null,
    done boolean not null, position double precision not null)`);
  await db.query(`insert into todos values
    ('todo_0190b62e-0000-7000-8000-000000000001', 'l_1', 'seeded todo', false, 0)`);
};

/** A World transport whose next N subscribes fail with the given error. */
function failingTransport(world: World, failures: { count: number; error: () => Error }) {
  const conn = { current: null as ReturnType<World['server']['connect']> | null };
  const state = { subscribeCalls: 0 };
  const transport: SyncTransport = {
    async connect(id, onEvent, identity) {
      conn.current = world.server.connect(id, {
        actor: identity.actor,
        workspaceId: 'cold-retry-test',
        sessionId: id
      });
      conn.current.onEvent(onEvent);
    },
    async subscribe(_id, queryName, params) {
      state.subscribeCalls += 1;
      if (failures.count > 0) {
        failures.count -= 1;
        throw failures.error();
      }
      if (!conn.current) throw new TypeError('fetch failed');
      return conn.current.subscribe(queryName, params);
    },
    async unsubscribe(_id, subscriptionId) {
      conn.current?.unsubscribe(subscriptionId);
    },
    async mutateGroup(request) {
      if (!conn.current) throw new TypeError('fetch failed');
      return world.server.mutateGroup(request, conn.current.principal);
    },
    async setPresence(): Promise<void> {},
    close(): void {
      conn.current?.close();
    }
  };
  return { transport, state };
}

function makeClient(transport: SyncTransport, seed: number): SyncClient {
  return new SyncClient({
    transport,
    clientId: `web_cold_${seed}`,
    actor: 'tester',
    clock: fixedClock(1_700_000_000_000, 1),
    randomBytes: seededRandomBytes(seed),
    syncModules: [syncModule],
    localCache: new MemoryCache()
  });
}

async function drain(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('cold subscribe retry', () => {
  test('a transient failure parks the subscribe; the connection returning revives it', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = failingTransport(world, {
      count: 1,
      error: () => new TransientSyncError('sync connection is not open')
    });
    const client = makeClient(transport, 7);

    let settled = false;
    const handlePromise = client.subscribe(todosByList, { listId: 'l_1' }).finally(() => {
      settled = true;
    });
    await drain();
    // Parked, not rejected: the cold caller keeps waiting, no crash-loop.
    expect(settled).toBe(false);
    expect(state.subscribeCalls).toBe(1);

    // The wire comes back: the park retries once and goes live.
    client.setConnectionStatus('connected');
    const handle = await handlePromise;
    expect(state.subscribeCalls).toBe(2);
    expect(handle.rows().map((row) => row.text)).toEqual(['seeded todo']);
    client.close();
    await world.close();
  });

  test('a server verdict still rejects the cold caller', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = failingTransport(world, {
      count: 1,
      error: () => new Error('unknown_query: "todos.byList" is not registered')
    });
    const client = makeClient(transport, 11);

    await expect(client.subscribe(todosByList, { listId: 'l_1' })).rejects.toThrow('unknown_query');
    expect(state.subscribeCalls).toBe(1);
    client.close();
    await world.close();
  });

  test('close() releases a parked subscribe instead of leaving it waiting forever', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport } = failingTransport(world, {
      count: 1,
      error: () => new TransientSyncError('sync connection is not open')
    });
    const client = makeClient(transport, 13);

    let settled = false;
    void client.subscribe(todosByList, { listId: 'l_1' }).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await drain();
    client.close();
    await drain();
    // The parked loop observed the abort and rejected the cold caller —
    // nothing waits on a wire that will never return.
    expect(settled).toBe(true);
    await world.close();
  });
});
