// @vitest-environment node
/**
 * The server-restart scenario (found live: a demo server restart left tabs
 * receiving no deltas). A fresh server epoch resets seq to 1; after
 * rebootstrap the client must accept the new epoch's deltas instead of
 * refusing them as stale.
 */
import { describe, expect, test } from 'vitest';

import { MemoryCache, SyncClient, type SyncTransport, fixedClock, seededRandomBytes } from 'wheel/sync';
import { World } from 'wheel/testing';
import * as todosSync from './sync/todos.sync';
import * as todosServer from './sync/todos.server';
import { TODOS_SCHEMA } from './sync/todos.server';

async function makeWorld(): Promise<World> {
  return World.create({
    syncModules: [todosSync],
    servers: [todosServer],
    setup: async (db) => {
      for (const statement of [...TODOS_SCHEMA.create, ...TODOS_SCHEMA.seed]) {
        await db.query(statement);
      }
    }
  });
}

/** A transport whose backing world can be swapped — a "server restart". */
function switchableTransport(ref: { world: World }, clientId: string): SyncTransport {
  let listener: Parameters<SyncTransport['connect']>[1] | null = null;
  let conn: ReturnType<World['server']['connect']> | null = null;
  let actor = 'tester';
  const attach = () => {
    conn = ref.world.server.connect(clientId, {
      actor,
      workspaceId: 'restart-test',
      sessionId: clientId
    });
    conn.onEvent((event) => listener?.(event));
  };
  return {
    async connect(_id, onEvent, identity) {
      listener = onEvent;
      actor = identity.actor;
      attach();
    },
    async subscribe(_id, queryName, params) {
      return conn!.subscribe(queryName, params);
    },
    async unsubscribe(_id, subscriptionId) {
      conn?.unsubscribe(subscriptionId);
    },
    async mutate(request) {
      return ref.world.server.mutate(request, conn!.principal);
    },
    async setPresence() {},
    close() {
      conn?.close();
    },
    /** Test hook: reattach to the new world, like a WebSocket reconnect. */
    reattach: attach
  } as SyncTransport & { reattach: () => void };
}

describe('server restart (fresh epoch)', () => {
  // Two full SQLite Worlds — the suite's heaviest test; needs
  // headroom when the whole suite runs in parallel.
  test('after rebootstrap onto a fresh server, new-epoch deltas still apply', { timeout: 20_000 }, async () => {
    const first = await makeWorld();
    const ref = { world: first };
    const transport = switchableTransport(ref, 'web_epoch');
    const client = new SyncClient({
      transport,
      clientId: 'web_epoch',
      actor: 'tester',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(31),
      localCache: new MemoryCache()
    });
    const handle = await client.subscribe(todosSync.todoList, {});

    // Drive the old epoch's seq up so it EXCEEDS anything the new epoch will
    // produce soon after boot.
    for (let i = 0; i < 5; i += 1) {
      client.mutate(todosSync.addTodo, { text: `old-epoch ${i}` });
      await first.settle();
    }
    expect(client.seq()).toBeGreaterThanOrEqual(5);

    // "Server restart": a brand-new world (fresh SQLite, seq starts over).
    const second = await makeWorld();
    ref.world = second;
    (transport as unknown as { reattach: () => void }).reattach();
    await client.rebootstrap();

    // The snapshot is the new epoch's seeded truth.
    expect(handle.rows().length).toBe(3);

    // The regression: a delta from the new epoch (low seq) must APPLY, not be
    // refused as stale against the old epoch's high seq.
    const other = await second.client('web_other');
    await other.subscribe(todosSync.todoList, {});
    other.mutate(todosSync.addTodo, { text: 'new-epoch delta' });
    await second.settle();

    expect(handle.rows().map((r) => r.text)).toContain('new-epoch delta');
    await first.close();
    await second.close();
  });
});
