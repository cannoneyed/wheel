// @vitest-environment node
/**
 * The doctrine tests: real server + real clients, in-process,
 * deterministic. These are the tests the todo demo app's suite builds on.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mutation, orphan, presence, query, collection } from '../sync/declarations';
import { ServiceContext } from '../core/services';
import { SyncService } from '../sync/sync-service';
import { t } from '../sync/schema';
import { sql } from '../sync/sql';
import { serveMutation, serveQuery } from '../sync/server/serve';
import { World } from './world';
import { expectMutationParity, expectQueryInvalidation } from './parity';

const TodoRow = t.object({
  id: t.string(),
  listId: t.string(),
  text: t.string(),
  done: t.boolean(),
  position: t.number()
});

const todos = collection({ name: 'todos', type: TodoRow, key: (row) => row.id });

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

const toggleTodo = mutation({
  name: 'todos.toggle',
  args: t.object({ todoId: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(todos, args.todoId);
    if (!row) {
      throw orphan(`todo ${args.todoId} is gone`);
    }
    cache.update(todos, args.todoId, { done: !row.done });
  }
});

const deleteTodo = mutation({
  name: 'todos.delete',
  args: t.object({ todoId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(todos, args.todoId);
  }
});

const syncModule = { todos, todosByList, addTodo, toggleTodo, deleteTodo };

const servers = {
  todosByListServer: serveQuery({
  query: todosByList,
    sql: (params) => sql`
      select id, list_id as "listId", text, done, position
      from todos where list_id = ${params.listId}
      order by position`
  }),
  addTodoServer: serveMutation({
  mutation: addTodo,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into todos (id, list_id, text, done, position)
                 values (${ctx.newId('todo')}, ${args.listId}, ${args.text}, false,
                         (select coalesce(max(position), -1) + 1 from todos where list_id = ${args.listId}))`;
  }
}),
  toggleTodoServer: serveMutation({
  mutation: toggleTodo,
  handler: async (tx, args) => {
    await tx.sql`update todos set done = not done where id = ${args.todoId}`;
  }
}),
  deleteTodoServer: serveMutation({
  mutation: deleteTodo,
  handler: async (tx, args) => {
    await tx.sql`delete from todos where id = ${args.todoId}`;
  }
})
};

const seedTodos = async (db: { query(text: string, params?: readonly unknown[]): Promise<unknown[]> }) => {
  await db.query(`create table todos (
    id text primary key, list_id text not null, text text not null,
    done boolean not null, position double precision not null)`);
  await db.query(`insert into todos values
    ('todo_0190b62e-0000-7000-8000-000000000007', 'l_1', 'seeded todo', false, 0)`);
};
const SEEDED = 'todo_0190b62e-0000-7000-8000-000000000007';

class TodoFamilyService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'TodoFamilyService';

  readonly byList = this.liveQueryFor(todosByList, (listId: string) => ({ listId }));
}

let world: World;

beforeEach(async () => {
  world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
});

afterEach(async () => {
  await world.close();
});

describe('the todo vertical', () => {
  test('generic parity helpers verify optimistic order and SQL invalidation tables', async () => {
    const client = await world.client('web_parity');
    const handle = await client.subscribe(todosByList, { listId: 'l_1' });

    const parity = await expectMutationParity({
      world,
      label: 'todos.add',
      mutate: () => {
        client.mutate(addTodo, { listId: 'l_1', text: 'parity row' });
      },
      read: () => handle.rows().map((row) => row.text)
    });
    expect(parity.confirmed).toEqual(parity.optimistic);

    await expect(
      expectQueryInvalidation({
        world,
        binding: servers.todosByListServer,
        params: { listId: 'l_1' }
      })
    ).resolves.toEqual({ reads: ['todos'], dependsOn: ['todos'] });

    const wrongBinding = {
      ...servers.todosByListServer,
      query: { ...todosByList, dependsOn: ['notes'] }
    };
    await expect(
      expectQueryInvalidation({
        world,
        binding: wrongBinding,
        params: { listId: 'l_1' }
      })
    ).rejects.toThrow(/SQLite reads \[todos\], but dependsOn is \[notes\]/);
  });

  test('toggle is optimistic, then confirmed by the server', async () => {
    const client = await world.client('web_1');
    await client.subscribe(todosByList, { listId: 'l_1' });

    client.mutate(toggleTodo, { todoId: SEEDED });

    expect(client.get(todos, SEEDED)?.done).toBe(true); // instantly
    expect(client.explain(todos, SEEDED).cause?.kind).toBe('optimistic'); // and it says why

    await world.settle();

    expect(client.get(todos, SEEDED)?.done).toBe(true);
    expect(client.explain(todos, SEEDED).cause?.kind).toBe('sync-apply');
    expect(world.server.seq()).toBe(client.seq()); // fully converged
  });

  test('two clients converge; a mutation from one reaches the other instantly', async () => {
    const [a, b] = await world.twoClients('web_a', 'web_b');
    await a.subscribe(todosByList, { listId: 'l_1' });
    await b.subscribe(todosByList, { listId: 'l_1' });

    a.mutate(addTodo, { listId: 'l_1', text: 'from a' });
    await world.settle();

    expect(a.rows(todos)).toEqual(b.rows(todos));
    expect(b.rows(todos).some((row) => row.text === 'from a')).toBe(true);
    expect(a.seq()).toBe(world.server.seq());
    expect(b.seq()).toBe(world.server.seq());
  });

  test('rejection rolls back and both clients stay identical', async () => {
    const [a, b] = await world.twoClients('web_a', 'web_b');
    await a.subscribe(todosByList, { listId: 'l_1' });
    await b.subscribe(todosByList, { listId: 'l_1' });

    world.rejectNext('todos.toggle', 'forbidden');
    const handle = a.mutate(toggleTodo, { todoId: SEEDED });
    expect(a.get(todos, SEEDED)?.done).toBe(true); // optimistic

    const info = await handle.settled;
    await world.settle();

    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('forbidden');
    expect(a.get(todos, SEEDED)?.done).toBe(false); // rolled back
    expect(a.rows(todos)).toEqual(b.rows(todos)); // still identical
    expect(a.mutationState(toggleTodo).last?.state).toBe('rejected');
  });

  test('optimistic rows appear in the right query result via the client projection', async () => {
    const client = await world.client('web_1');
    const listOne = await client.subscribe(todosByList, { listId: 'l_1' });
    const listTwo = await client.subscribe(todosByList, { listId: 'l_2' });

    client.mutate(addTodo, { listId: 'l_2', text: 'goes to list two' });

    expect(listTwo.rows().map((row) => row.text)).toEqual(['goes to list two']);
    expect(listOne.rows().map((row) => row.text)).toEqual(['seeded todo']);

    await world.settle();
    expect(listTwo.rows().map((row) => row.text)).toEqual(['goes to list two']);
  });

  test('same (query, params) shares one subscription; different params get their own', async () => {
    const client = await world.client('web_1');
    const first = await client.subscribe(todosByList, { listId: 'l_1' });
    const again = await client.subscribe(todosByList, { listId: 'l_1' });
    const other = await client.subscribe(todosByList, { listId: 'l_9' });

    expect(again.subscriptionId).toBe(first.subscriptionId);
    expect(other.subscriptionId).not.toBe(first.subscriptionId);
    expect(client.subscriptionsDebug()).toHaveLength(2);
    expect(client.subscriptionsDebug().find((sub) => sub.subscriptionId === first.subscriptionId)?.refs).toBe(2);

    first.release();
    first.release(); // handles are idempotent
    expect(client.subscriptionsDebug().find((sub) => sub.subscriptionId === again.subscriptionId)?.refs).toBe(1);

    again.release();
    await world.settle();
    expect(client.subscriptionsDebug()).toHaveLength(1);
    expect(world.server.debugSubscriptions()).toHaveLength(1);

    other.release();
    await world.settle();
    expect(client.subscriptionsDebug()).toHaveLength(0);
    expect(world.server.debugSubscriptions()).toHaveLength(0);
    expect(client.rows(todos)).toEqual([]);
  });

  test('liveQueryFor releases one key and recreates it only when read again', async () => {
    const client = await world.client('web_1');
    const context = new ServiceContext({ client });
    const service = context.get(TodoFamilyService);
    const first = service.byList('l_1');
    await world.settle();
    expect(first.rows).toHaveLength(1);
    expect(service.byList.size()).toBe(1);
    expect(world.server.debugSubscriptions()).toHaveLength(1);

    expect(service.byList.release('l_1')).toBe(true);
    await world.settle();
    expect(service.byList.size()).toBe(0);
    expect(first.rows).toEqual([]);
    expect(world.server.debugSubscriptions()).toHaveLength(0);

    const second = service.byList('l_1');
    expect(second).not.toBe(first);
    await world.settle();
    expect(second.rows).toHaveLength(1);
    expect(world.server.debugSubscriptions()).toHaveLength(1);

    context.dispose();
    await world.settle();
    expect(world.server.debugSubscriptions()).toHaveLength(0);
  });
});

describe('F8: orphaned mutations — terminal, never limbo', () => {
  test('optimistic edit on a row another client deleted → orphaned', async () => {
    const [a, b] = await world.twoClients('web_a', 'web_b');
    await a.subscribe(todosByList, { listId: 'l_1' });
    await b.subscribe(todosByList, { listId: 'l_1' });

    world.network.pause('web_a'); // a's traffic held; optimistic overlay stays
    a.mutate(toggleTodo, { todoId: SEEDED });
    expect(a.get(todos, SEEDED)?.done).toBe(true);

    b.mutate(deleteTodo, { todoId: SEEDED }); // b really deletes it
    await world.settle();
    expect(b.get(todos, SEEDED)).toBeUndefined();

    await world.network.resume('web_a');
    await world.settle();

    // The delete's delta reached a; its toggle handler threw orphan() during
    // rebase — the row-is-gone sentinel, so it settles orphaned (a plain throw
    // would now be `failed`; only orphan() takes this path).
    expect(a.get(todos, SEEDED)).toBeUndefined(); // no ghost row
    const state = a.mutationState(toggleTodo).last;
    expect(['orphaned', 'rejected']).toContain(state?.state); // terminal, not limbo
    expect(a.pendingMutations()).toBe(0);
    const history = a.explain(todos, SEEDED).history;
    expect(history.some((entry) => entry.cause.kind === 'orphaned' || entry.cause.kind === 'rollback')).toBe(true);
  });
});

describe('provenance (the KEY IDEA)', () => {
  test('explain answers where any row came from, with the full chain', async () => {
    const client = await world.client('web_1');
    await client.subscribe(todosByList, { listId: 'l_1' });

    client.mutate(toggleTodo, { todoId: SEEDED });
    await world.settle();

    const explained = client.explain(todos, SEEDED);
    expect(explained.value?.done).toBe(true);
    const kinds = explained.history.map((entry) => entry.cause.kind);
    expect(kinds[0]).toBe('bootstrap'); // arrived with the snapshot
    expect(kinds).toContain('optimistic'); // the click
    expect(kinds[kinds.length - 1]).toBe('sync-apply'); // the server's confirmation
  });

  test('a paused client keeps working optimistically and converges on resume', async () => {
    const client = await world.client('web_1');
    const list = await client.subscribe(todosByList, { listId: 'l_1' });

    world.network.pause('web_1');
    client.mutate(addTodo, { listId: 'l_1', text: 'offline-ish' });
    expect(list.rows().map((row) => row.text)).toEqual(['seeded todo', 'offline-ish']);
    expect(client.pendingMutations()).toBe(1);

    await world.network.resume('web_1');
    await world.settle();

    expect(client.pendingMutations()).toBe(0);
    expect(client.mutationState(addTodo).last?.state).toBe('confirmed');
    expect(list.rows().map((row) => row.text)).toEqual(['seeded todo', 'offline-ish']);
    expect(client.seq()).toBe(world.server.seq());
  });
});

// Two schema versions of ONE presence channel: a peer publishes a shape valid
// under its (older, looser) decl; a reader on a newer, stricter decl must SEE
// that peer as a failure — not an empty peer list (4.4).
const looseCursor = presence({ name: 'cursor', state: t.object({ blockId: t.string() }) });
const strictCursor = presence({
  name: 'cursor',
  state: t.object({ blockId: t.string(), caretOffset: t.number() })
});

describe('peers() surfaces validation failures (4.4)', () => {
  test('a peer on an older schema shows up in failures, not as a silent absence', async () => {
    const [sender, reader] = await world.twoClients('web_send', 'web_read');

    // The sender validates against ITS decl (which lacks caretOffset) and
    // publishes — the send succeeds because it is valid for the sender.
    sender.setPresence(looseCursor, { blockId: 'b1' });
    await world.settle();

    // The reader validates each peer against ITS stricter decl.
    const peers = reader.peers(strictCursor);

    // NOT dropped: the mismatched peer is a thing the reader can see.
    expect([...peers.valid.keys()]).toEqual([]);
    expect([...peers.failures.keys()]).toEqual(['web_send']);
    const failure = peers.failures.get('web_send')!;
    expect(failure.state).toEqual({ blockId: 'b1' });
    expect(failure.issues.some((issue) => issue.path === 'caretOffset')).toBe(true);
  });
});
