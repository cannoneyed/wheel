// @vitest-environment node
/**
 * The local-first guarantees, tested end to end:
 *  - mutations while offline QUEUE (optimistic state stays), then flush on
 *    reconnect in order;
 *  - the outbox survives "reloads" (a new client on the same store replays);
 *  - replay is exactly-once (server dedupes by mutationId via the sync_log
 *    unique constraint);
 *  - subscriptions hydrate instantly from the persisted cache (marked stale)
 *    and refresh when the wire lands.
 */
import { describe, expect, test, vi } from 'vitest';

import { mutation, query, table } from '../declarations';
import { t } from '../schema';
import { sql } from '../sql';
import { serveMutation, serveQuery } from '../server/serve';
import { fixedClock, seededRandomBytes } from '../ids';
import { World } from '../../testing/world';
import { SyncClient } from './client';
import { MemoryCache } from './local-cache';
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
                   values (${ctx.newId('todo')}, ${args.listId}, ${args.text}, false,
                           (select coalesce(max(position), -1) + 1 from todos where list_id = ${args.listId}))`;
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

/**
 * A transport wrapping the World's in-process server, with a switchable
 * "offline" mode: while offline every wire call rejects (the fetch-failed
 * shape), which is exactly what the queue/hydrate paths must absorb.
 */
function flakyTransport(world: World, clientId: string): SyncTransport & { offline: boolean } {
  const conn = { current: null as ReturnType<World['server']['connect']> | null };
  const transport = {
    offline: false,
    async connect(
      id: string,
      onEvent: Parameters<SyncTransport['connect']>[1],
      identity: Parameters<SyncTransport['connect']>[2]
    ): Promise<void> {
      if (transport.offline) throw new TypeError('fetch failed');
      conn.current = world.server.connect(id, {
        actor: identity.actor,
        workspaceId: 'outbox-test',
        sessionId: id
      });
      conn.current.onEvent(onEvent);
    },
    async subscribe(_id: string, queryName: string, params: unknown) {
      if (transport.offline || !conn.current) throw new TypeError('fetch failed');
      return conn.current.subscribe(queryName, params);
    },
    async unsubscribe(_id: string, subscriptionId: string) {
      if (transport.offline || !conn.current) throw new TypeError('fetch failed');
      conn.current.unsubscribe(subscriptionId);
    },
    async mutateGroup(request: Parameters<SyncTransport['mutateGroup']>[0]) {
      if (transport.offline) throw new TypeError('fetch failed');
      if (!conn.current) throw new TypeError('fetch failed');
      return world.server.mutateGroup(request, conn.current.principal);
    },
    async setPresence(): Promise<void> {},
    close(): void {
      conn.current?.close();
    }
  };
  return transport as SyncTransport & { offline: boolean };
}

function makeClient(world: World, clientId: string, store: MemoryCache, seed: number) {
  const transport = flakyTransport(world, clientId);
  const client = new SyncClient({
    transport,
    clientId,
    actor: 'tester',
    clock: fixedClock(1_700_000_000_000, 1),
    randomBytes: seededRandomBytes(seed),
    localCache: store
  });
  return { client, transport };
}

async function drain(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

describe('offline queue', () => {
  test('outbox failure rolls back the instant preview and never sends it', async () => {
    class RejectingCache extends MemoryCache {
      override async appendOutbox(): Promise<void> {
        throw new Error('IndexedDB quota exceeded');
      }
    }
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { client, transport } = makeClient(world, 'web_storage_fail', new RejectingCache(), 5);
    await client.subscribe(todosByList, { listId: 'l_1' });
    const send = vi.spyOn(transport, 'mutateGroup');

    const handle = client.mutate(addTodo, { listId: 'l_1', text: 'must be durable' });
    expect(client.rows(todos).map((row) => row.text)).toContain('must be durable');

    const settled = await handle.settled;
    expect(settled).toMatchObject({
      state: 'failed',
      error: { code: 'local_persistence_failed' }
    });
    expect(client.rows(todos).map((row) => row.text)).toEqual(['seeded todo']);
    expect(send).not.toHaveBeenCalled();

    client.close();
    await world.close();
  });

  test('a mutation while offline queues (optimistic stays), flushes on reconnect', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const store = new MemoryCache();
    const { client, transport } = makeClient(world, 'web_off', store, 7);

    const handle = await client.subscribe(todosByList, { listId: 'l_1' });
    expect(handle.rows().length).toBe(1);

    transport.offline = true;
    client.mutate(addTodo, { listId: 'l_1', text: 'written offline' });
    await drain();

    // Optimistic state VISIBLE and the entry queued — never rolled back.
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo', 'written offline']);
    expect(client.queuedMutations()).toBe(1);
    // Durably in the outbox before any wire attempt.
    expect((await store.loadOutbox()).map((entry) => entry.calls.map((call) => call.mutation))).toEqual([
      ['todos.add']
    ]);

    transport.offline = false;
    client.setConnectionStatus('connected'); // what the transport reports on stream return
    await drain();
    await world.settle();

    expect(client.queuedMutations()).toBe(0);
    expect(client.pendingMutations()).toBe(0);
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo', 'written offline']);
    expect((await store.loadOutbox()).length).toBe(0); // confirmed → cleared
    await world.close();
  });
});

describe('outbox replay across reloads', () => {
  test('a new client on the same store replays surviving entries, exactly once', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const store = new MemoryCache();

    // Session 1: mutate while offline, then "crash" (client discarded).
    const first = makeClient(world, 'web_r1', store, 11);
    const h1 = await first.client.subscribe(todosByList, { listId: 'l_1' });
    expect(h1.rows().length).toBe(1);
    first.transport.offline = true;
    first.client.mutate(addTodo, { listId: 'l_1', text: 'pre-crash' });
    await drain();
    expect((await store.loadOutbox()).length).toBe(1);

    // Session 2: same store, fresh client. connect() replays the outbox.
    const second = makeClient(world, 'web_r2', store, 12);
    const h2 = await second.client.subscribe(todosByList, { listId: 'l_1' });
    // The wire refresh + outbox replay run in the background (settle only
    // tracks server-side work) — wait for the replayed row to land.
    await vi.waitFor(async () => {
      await world.settle();
      expect(h2.rows().map((r) => r.text)).toEqual(['seeded todo', 'pre-crash']);
    });
    expect((await store.loadOutbox()).length).toBe(0);
    // (Exactly-once semantics of a duplicate replay are covered directly below.)
    await world.close();
  });

  test('server dedupes a duplicate mutationId: ok with the original seq', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const request = {
      clientId: 'web_dup',
      mutationId: 'm_0190b62e-0000-7000-8000-00000000d0d0',
      calls: [{
        name: 'todos.add',
        args: { listId: 'l_1', text: 'once only' },
        ids: ['todo_0190b62e-0000-7000-8000-00000000d0d1']
      }]
    };
    const principal = {
      actor: 'tester',
      workspaceId: 'outbox-test',
      sessionId: 'session:test'
    };
    const firstResult = await world.server.mutateGroup(request, principal);
    const secondResult = await world.server.mutateGroup(request, principal);
    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (firstResult.ok && secondResult.ok) {
      expect(secondResult.seq).toBe(firstResult.seq);
    }
    const [{ count }] = (await world.db.query(
      `select cast(count(*) as int) as count from todos where text = 'once only'`
    )) as Array<{ count: number }>;
    expect(count).toBe(1);
    await world.close();
  });
});

describe('hydrate-from-cache boot', () => {
  test('offline boot serves persisted rows instantly (stale), wire refresh clears stale', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const store = new MemoryCache();

    // Session 1 (online): subscribe → snapshot persists to the store.
    const first = makeClient(world, 'web_h1', store, 21);
    await first.client.subscribe(todosByList, { listId: 'l_1' });
    await world.settle();
    await drain();
    expect((await store.loadSubscriptions()).length).toBe(1);

    // Session 2 boots OFFLINE: rows serve from cache instantly, marked stale.
    const second = makeClient(world, 'web_h2', store, 22);
    second.transport.offline = true;
    const handle = await second.client.subscribe(todosByList, { listId: 'l_1' });
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo']);
    expect(handle.stale()).toBe(true);
    expect(second.client.explain(todos, 'todo_0190b62e-0000-7000-8000-000000000007').cause?.kind).toBe('hydrate');

    // The wire comes back (the transport reports 'connected'): stale
    // subscriptions re-open automatically and the snapshot replaces hydrated
    // truth; stale clears with no action from the UI.
    second.transport.offline = false;
    second.client.setConnectionStatus('connected');
    await vi.waitFor(async () => {
      await world.settle();
      expect(handle.stale()).toBe(false);
    });
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo']);
    await world.close();
  });
});
