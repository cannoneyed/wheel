// @vitest-environment node
/**
 * The client's reconnect funnel, under chaos: overlapping rebootstraps
 * (reconnect storms), rebootstrap racing offline mutations (drop-during-
 * rebase), teardown mid-flight (abort), and the stale-flag lifecycle across
 * a rebootstrap. Every test drives a REAL client against a REAL World server
 * through a scriptable transport — the same seams production uses.
 */
import { describe, expect, test } from 'vitest';

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
 * A transport over the World's in-process server whose subscribe() calls can
 * be HELD (resolved on demand) and whose wire calls can be switched offline —
 * the knobs the reconnect-race tests need. connect() always succeeds, so
 * "offline" here means "the stream is up but requests fail", isolating the
 * subscribe/rebootstrap paths from connect-retry behavior.
 */
function scriptedTransport(world: World, options: { holdSubscribes?: boolean } = {}) {
  const conn = { current: null as ReturnType<World['server']['connect']> | null };
  const held: Array<() => void> = [];
  const state = {
    offline: false,
    holdSubscribes: options.holdSubscribes ?? false,
    subscribeCalls: 0,
    /** Resolve every held subscribe, in call order. */
    releaseHeld(): void {
      const pending = held.splice(0, held.length);
      for (const release of pending) release();
    }
  };
  const transport: SyncTransport = {
    async connect(id, onEvent, identity) {
      conn.current = world.server.connect(id, {
        actor: identity.actor,
        workspaceId: 'reconnect-test',
        sessionId: id
      });
      conn.current.onEvent(onEvent);
    },
    async subscribe(_id, queryName, params) {
      state.subscribeCalls += 1;
      if (state.offline) throw new TypeError('fetch failed');
      if (state.holdSubscribes) {
        await new Promise<void>((resolve) => held.push(resolve));
      }
      if (state.offline || !conn.current) throw new TypeError('fetch failed');
      return conn.current.subscribe(queryName, params);
    },
    async unsubscribe(_id, subscriptionId) {
      if (state.offline || !conn.current) throw new TypeError('fetch failed');
      conn.current.unsubscribe(subscriptionId);
    },
    async mutateGroup(request) {
      if (state.offline) throw new TypeError('fetch failed');
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

function makeClient(world: World, clientId: string, transport: SyncTransport, seed: number): SyncClient {
  return new SyncClient({
    transport,
    clientId,
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

describe('rebootstrap under a reconnect storm', () => {
  test('overlapping rebootstrap() calls coalesce instead of corrupting each other', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = scriptedTransport(world);
    const client = makeClient(world, 'web_storm', transport, 41);
    const handle = await client.subscribe(todosByList, { listId: 'l_1' });
    expect(handle.rows().length).toBe(1);

    // Hold every wire subscribe, then fire two rebootstraps back to back —
    // exactly what a flapping WebSocket produces (onReconnect per re-open).
    // Un-coalesced, the second run wipes the first's delta buffer and then
    // crashes iterating it (`null is not iterable`).
    state.holdSubscribes = true;
    const first = client.rebootstrap();
    const second = client.rebootstrap();
    await drain();
    state.releaseHeld();
    await drain();
    state.releaseHeld(); // the coalesced follow-up run's subscribes
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();

    // The client is fully live after the storm: rows intact, deltas apply.
    state.holdSubscribes = false;
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo']);
    const other = await world.client('web_other');
    await other.subscribe(todosByList, { listId: 'l_1' });
    other.mutate(addTodo, { listId: 'l_1', text: 'post-storm delta' });
    await world.settle();
    expect(handle.rows().map((r) => r.text)).toContain('post-storm delta');
    await world.close();
  });

  test('a storm of N rebootstraps runs at most two snapshot rounds (in-flight + one follow-up)', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = scriptedTransport(world);
    const client = makeClient(world, 'web_burst', transport, 43);
    await client.subscribe(todosByList, { listId: 'l_1' });

    const before = state.subscribeCalls;
    state.holdSubscribes = true;
    const storm = [
      client.rebootstrap(),
      client.rebootstrap(),
      client.rebootstrap(),
      client.rebootstrap(),
      client.rebootstrap()
    ];
    await drain();
    state.releaseHeld();
    await drain();
    state.releaseHeld();
    await Promise.all(storm);
    // 1 subscription × (the in-flight run + ONE coalesced follow-up) = 2.
    // Un-coalesced this is 5 — one full snapshot round per trigger.
    expect(state.subscribeCalls - before).toBe(2);
    await world.close();
  });
});

describe('stale flag across rebootstrap', () => {
  test('a hydrated (stale) subscription goes live when rebootstrap applies its wire snapshot', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });

    // Session 1 (online) persists the snapshot into the shared cache.
    const cache = new MemoryCache();
    const online = scriptedTransport(world);
    const seeder = new SyncClient({
      transport: online.transport,
      clientId: 'web_seed',
      actor: 'tester',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(51),
      syncModules: [syncModule],
      localCache: cache
    });
    await seeder.subscribe(todosByList, { listId: 'l_1' });
    await world.settle();
    await drain();
    expect((await cache.loadSubscriptions()).length).toBe(1);

    // Session 2 boots with the wire down: hydrated rows, marked stale.
    const { transport, state } = scriptedTransport(world);
    state.offline = true;
    const client = new SyncClient({
      transport,
      clientId: 'web_stale',
      actor: 'tester',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(52),
      syncModules: [syncModule],
      localCache: cache
    });
    const handle = await client.subscribe(todosByList, { listId: 'l_1' });
    expect(handle.stale()).toBe(true);

    // The stream lands and the transport's reconnect path fires rebootstrap
    // (NOT the status-change path — that is a separate trigger). The wire
    // snapshot it applies IS the upgrade: the subscription must come back
    // live, not stay marked stale forever.
    state.offline = false;
    await client.connect();
    await client.rebootstrap();
    expect(handle.stale()).toBe(false);
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo']);
    await world.close();
  });
});

describe('drop during rebase (offline queue vs rebootstrap)', () => {
  test('a queued offline mutation survives a rebootstrap and lands exactly once', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = scriptedTransport(world);
    const client = makeClient(world, 'web_drop', transport, 61);
    const handle = await client.subscribe(todosByList, { listId: 'l_1' });

    // Go offline mid-session; the mutation queues with optimistic state.
    state.offline = true;
    client.mutate(addTodo, { listId: 'l_1', text: 'written offline' });
    await drain();
    expect(client.queuedMutations()).toBe(1);
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo', 'written offline']);

    // The connection returns as a FULL reconnect: rebootstrap re-snapshots
    // (the snapshot predates the queued write), then the queue flushes. The
    // optimistic row must stay visible through the whole sequence and commit
    // exactly once.
    state.offline = false;
    await client.rebootstrap();
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo', 'written offline']);
    client.setConnectionStatus('connected');
    await drain();
    await world.settle();
    expect(client.queuedMutations()).toBe(0);
    expect(client.pendingMutations()).toBe(0);
    expect(handle.rows().map((r) => r.text)).toEqual(['seeded todo', 'written offline']);
    const [{ count }] = (await world.db.query(
      `select cast(count(*) as int) as count from todos where text = 'written offline'`
    )) as Array<{ count: number }>;
    expect(count).toBe(1);
    await world.close();
  });
});

describe('teardown mid-flight', () => {
  test('close() during a held rebootstrap: promises settle, nothing runs after teardown', async () => {
    const world = await World.create({ syncModules: [syncModule], servers: [servers], setup: seedTodos });
    const { transport, state } = scriptedTransport(world);
    const client = makeClient(world, 'web_close', transport, 71);
    const handle = await client.subscribe(todosByList, { listId: 'l_1' });
    const rowsBefore = handle.rows();

    state.holdSubscribes = true;
    const inflight = client.rebootstrap();
    await drain();
    client.close();
    state.releaseHeld();
    // The abandoned run must SETTLE (never hang) — outcome value is not the
    // contract, non-hanging is.
    await inflight.catch(() => {});
    await drain();
    // A closed client's state is left exactly as it was: the aborted
    // rebootstrap never swapped fresh truth in.
    expect(handle.rows()).toEqual(rowsBefore);
    await world.close();
  });
});
