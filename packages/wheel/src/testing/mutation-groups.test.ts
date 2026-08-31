// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { mutation, orphan, query, rejection, table, type InverseSpec } from '../sync/declarations';
import { t } from '../sync/schema';
import { sql } from '../sync/sql';
import { serveMutation, serveQuery } from '../sync/server/serve';
import { fixedClock, seededRandomBytes } from '../sync/ids';
import { SyncClient } from '../sync/client/client';
import { MemoryCache } from '../sync/client/local-cache';
import { TransientSyncError, type SyncTransport } from '../sync/client/transport';
import type { MutateGroupRequest } from '../sync/protocol';
import { World } from './world';

const ItemRow = t.object({ id: t.string(), label: t.string() });
const items = table({ name: 'items', type: ItemRow, key: (row) => row.id });
const itemList = query({
  name: 'items.list',
  params: t.object({}),
  into: items,
  projection: { filter: () => true, sort: (left, right) => left.id.localeCompare(right.id) }
});

const setLabel = mutation({
  name: 'items.setLabel',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: args.label });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(items, args.itemId);
    return row ? { mutation: setLabel, args: { itemId: args.itemId, label: row.label } } : null;
  }
});

const rejectLabel = mutation({
  name: 'items.rejectLabel',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: args.label });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(items, args.itemId);
    return row ? { mutation: setLabel, args: { itemId: args.itemId, label: row.label } } : null;
  }
});

const failLabel = mutation({
  name: 'items.failLabel',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: args.label });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(items, args.itemId);
    return row ? { mutation: setLabel, args: { itemId: args.itemId, label: row.label } } : null;
  }
});

const permanentLabel = mutation({
  name: 'items.permanentLabel',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => cache.update(items, args.itemId, { label: args.label })
});

const syncModule = { items, itemList, setLabel, rejectLabel, failLabel, permanentLabel };
const servers = {
  itemListServer: serveQuery({
    query: itemList,
    sql: () => sql`select id, label from items order by id`,
    rerunOn: ['items']
  }),
  setLabelServer: serveMutation({
    mutation: setLabel,
    handler: async (tx, args) => {
      await tx.sql`update items set label = ${args.label} where id = ${args.itemId}`;
    }
  }),
  rejectLabelServer: serveMutation({
    mutation: rejectLabel,
    handler: async (tx, args) => {
      await tx.sql`update items set label = ${args.label} where id = ${args.itemId}`;
      throw rejection('blocked_label', 'this label is blocked');
    }
  }),
  failLabelServer: serveMutation({
    mutation: failLabel,
    handler: async (tx, args) => {
      await tx.sql`update items set label = ${args.label} where id = ${args.itemId}`;
      throw new Error('grouped handler failed');
    }
  }),
  permanentLabelServer: serveMutation({
    mutation: permanentLabel,
    handler: async (tx, args) => {
      await tx.sql`update items set label = ${args.label} where id = ${args.itemId}`;
    }
  })
};

let world: World;

beforeEach(async () => {
  world = await World.create({
    syncModules: [syncModule],
    servers: [servers],
    setup: async (db) => {
      await db.query('create table items (id text primary key, label text not null)');
      await db.query("insert into items values ('a', 'A'), ('b', 'B'), ('c', 'C')");
    }
  });
});

afterEach(async () => {
  await world.close();
});

describe('atomic mutation groups', () => {
  test('publishes three optimistic members once and counts one pending command', async () => {
    const client = await world.client('group_publish');
    await client.subscribe(itemList, {});
    await world.settle();
    const publications: string[][] = [];
    client.onChange(() => publications.push(client.rows(items).map((row) => row.label)));

    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: setLabel, args: { itemId: 'b', label: 'B1' } },
      { mutation: setLabel, args: { itemId: 'c', label: 'C1' } }
    ]);

    expect(publications).toEqual([['A1', 'B1', 'C1']]);
    expect(client.pendingMutations()).toBe(1);
    expect((await handle.settled).state).toBe('confirmed');
    await world.settle();
    expect(client.rows(items).map((row) => row.label)).toEqual(['A1', 'B1', 'C1']);
  });

  test('validates every member before applying any member', async () => {
    const client = await world.client('group_invalid');
    await client.subscribe(itemList, {});
    await world.settle();
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'changed' } },
      { mutation: setLabel, args: { itemId: 'b', label: 42 } as never },
      { mutation: setLabel, args: { itemId: 'c', label: 'changed' } }
    ]);

    expect(await handle.settled).toMatchObject({ state: 'failed', error: { code: 'invalid_args' } });
    expect(client.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(client.pendingMutations()).toBe(0);
  });

  test('requires every grouped member to be invertible before applying', async () => {
    const client = await world.client('group_permanent');
    await client.subscribe(itemList, {});
    await world.settle();
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: permanentLabel, args: { itemId: 'b', label: 'B1' } }
    ]);

    expect(await handle.settled).toMatchObject({
      state: 'failed',
      error: { code: 'non_invertible_group' }
    });
    expect(client.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(client.canUndo()).toBe(false);
  });

  test('captures inverses in member order and undoes them in reverse as one command', async () => {
    const client = await world.client('group_undo');
    await client.subscribe(itemList, {});
    await world.settle();
    await client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'middle' } },
      { mutation: setLabel, args: { itemId: 'a', label: 'final' } }
    ]).settled;
    await world.settle();
    expect(client.get(items, 'a')?.label).toBe('final');

    const undo = client.undo();
    expect(undo).not.toBeNull();
    expect(client.pendingMutations()).toBe(1);
    expect(client.get(items, 'a')?.label).toBe('A');
    expect((await undo!.settled).state).toBe('confirmed');
    await world.settle();
    expect(client.get(items, 'a')?.label).toBe('A');
    expect(client.canRedo()).toBe(true);
  });

  test('rolls every optimistic and server write back when one member rejects', async () => {
    const [client, peer] = await world.twoClients('group_reject', 'group_reject_peer');
    await client.subscribe(itemList, {});
    await peer.subscribe(itemList, {});
    await world.settle();
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: rejectLabel, args: { itemId: 'b', label: 'B1' } },
      { mutation: setLabel, args: { itemId: 'c', label: 'C1' } }
    ]);
    expect(client.rows(items).map((row) => row.label)).toEqual(['A1', 'B1', 'C1']);

    expect(await handle.settled).toMatchObject({ state: 'rejected', rejection: { code: 'blocked_label' } });
    await world.settle();
    expect(client.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(peer.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(client.canUndo()).toBe(false);
  });

  test('rolls every optimistic and server write back when one member fails', async () => {
    const [client, peer] = await world.twoClients('group_fail', 'group_fail_peer');
    await client.subscribe(itemList, {});
    await peer.subscribe(itemList, {});
    await world.settle();
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: failLabel, args: { itemId: 'b', label: 'B1' } },
      { mutation: setLabel, args: { itemId: 'c', label: 'C1' } }
    ]);
    expect(client.rows(items).map((row) => row.label)).toEqual(['A1', 'B1', 'C1']);

    expect(await handle.settled).toMatchObject({ state: 'failed', error: { code: 'handler_error' } });
    await world.settle();
    expect(client.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(peer.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(client.canUndo()).toBe(false);
  });

  test('drops a whole group when a peer delta orphans one member', async () => {
    let onEvent: Parameters<SyncTransport['connect']>[1] | undefined;
    let finishSend: ((result: { ok: true; seq: number }) => void) | undefined;
    const transport: SyncTransport = {
      async connect(_clientId, listener) {
        onEvent = listener;
      },
      async subscribe() {
        return {
          subscriptionId: 'sub_orphan',
          query: itemList.name,
          seq: 1,
          rows: [{ id: 'b', label: 'B' }],
          status: { kind: 'live' }
        };
      },
      async unsubscribe() {},
      mutateGroup() {
        return new Promise((resolve) => {
          finishSend = resolve;
        });
      },
      async setPresence() {},
      close() {}
    };
    const client = new SyncClient({
      transport,
      clientId: 'group_orphan',
      actor: 'user:test',
      clock: fixedClock(1_700_000_003_000, 1),
      randomBytes: seededRandomBytes(4),
      syncModules: [syncModule],
      localCache: new MemoryCache()
    });
    await client.subscribe(itemList, {});
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'b', label: 'B1' } },
      { mutation: setLabel, args: { itemId: 'b', label: 'B2' } }
    ]);
    expect(client.get(items, 'b')?.label).toBe('B2');
    await expect.poll(() => finishSend).toBeTypeOf('function');

    onEvent?.({
      type: 'delta',
      delta: {
        subscriptionId: 'sub_orphan',
        query: itemList.name,
        seq: 2,
        puts: [],
        deletes: ['b'],
        order: []
      }
    });
    finishSend?.({ ok: true, seq: 3 });

    expect(await handle.settled).toMatchObject({ state: 'orphaned', mutations: [setLabel.name, setLabel.name] });
    expect(client.get(items, 'b')).toBeUndefined();
    expect(client.pendingMutations()).toBe(0);
    expect(client.canUndo()).toBe(false);
    client.close();
  });

  test('plain mutate and a one-member group use the same command outcome', async () => {
    const client = await world.client('group_single');
    await client.subscribe(itemList, {});
    await world.settle();

    const plain = await client.mutate(setLabel, { itemId: 'a', label: 'A1' }).settled;
    const grouped = await client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'b', label: 'B1' } }
    ]).settled;
    await world.settle();

    expect(plain).toMatchObject({ state: 'confirmed', mutations: [setLabel.name] });
    expect(grouped).toMatchObject({ state: 'confirmed', mutations: [setLabel.name] });
    expect(client.rows(items).map((row) => row.label)).toEqual(['A1', 'B1', 'C']);
  });

  test('handles empty and oversized groups without outbox or pending state', async () => {
    const client = await world.client('group_limits');
    const empty = client.mutateGroup([]);
    expect(await empty.settled).toMatchObject({ state: 'confirmed', mutations: [] });
    expect(client.pendingMutations()).toBe(0);

    const call = { mutation: setLabel, args: { itemId: 'a', label: 'x' } };
    const oversized = client.mutateGroup(Array.from({ length: 129 }, () => call));
    expect(await oversized.settled).toMatchObject({ state: 'failed', error: { code: 'group_too_large' } });
    expect(client.pendingMutations()).toBe(0);
  });

  test('persists and reloads every member as one outbox command', async () => {
    const store = new MemoryCache();
    const makeTransport = (offline: boolean) => {
      const sent: MutateGroupRequest[] = [];
      let push: Parameters<SyncTransport['connect']>[1] = () => {};
      let finish = () => {};
      const transport: SyncTransport = {
        async connect(_clientId, onEvent) {
          push = onEvent;
          push({ type: 'hello', clientId: 'outbox_group' });
        },
        async subscribe() {
          return {
            subscriptionId: 'sub_items',
            query: itemList.name,
            seq: 1,
            rows: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
              { id: 'c', label: 'C' }
            ],
            status: { kind: 'live' }
          };
        },
        async unsubscribe() {},
        async mutateGroup(request) {
          sent.push(request);
          if (offline) throw new TransientSyncError('offline');
          return new Promise<{ ok: true; seq: number }>((resolve) => {
            finish = () => {
              push({ type: 'checkpoint', seq: 2 });
              resolve({ ok: true, seq: 2 });
            };
          });
        },
        async setPresence() {},
        close() {}
      };
      return { transport, sent, finish: () => finish() };
    };

    const firstWire = makeTransport(true);
    const first = new SyncClient({
      transport: firstWire.transport,
      clientId: 'outbox_group',
      actor: 'user:test',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(1),
      syncModules: [syncModule],
      localCache: store
    });
    await first.subscribe(itemList, {});
    first.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: setLabel, args: { itemId: 'b', label: 'B1' } },
      { mutation: setLabel, args: { itemId: 'c', label: 'C1' } }
    ]);
    await expect.poll(() => first.queuedMutations()).toBe(1);
    const [persisted] = await store.loadOutbox();
    expect(persisted?.calls.map((call) => call.mutation)).toEqual([
      'items.setLabel',
      'items.setLabel',
      'items.setLabel'
    ]);
    first.close();

    const secondWire = makeTransport(false);
    const second = new SyncClient({
      transport: secondWire.transport,
      clientId: 'outbox_group',
      actor: 'user:test',
      clock: fixedClock(1_700_000_001_000, 1),
      randomBytes: seededRandomBytes(2),
      syncModules: [syncModule],
      localCache: store
    });
    await second.connect();
    expect(secondWire.sent).toHaveLength(1);
    expect(secondWire.sent[0]?.calls).toHaveLength(3);
    expect(secondWire.sent[0]?.mutationId).toBe(persisted?.mutationId);
    expect(second.rows(items).map((item) => item.label)).toEqual(['A1', 'B1', 'C1']);
    secondWire.finish();
    await expect.poll(async () => (await store.loadOutbox()).length).toBe(0);
    second.close();
  });

  test('settles the whole command failed when the server protocol is too old', async () => {
    const listeners = new Set<(message: string) => void>();
    const sent: MutateGroupRequest[] = [];
    const transport: SyncTransport = {
      async connect() {},
      async subscribe() {
        return {
          subscriptionId: 'sub_old_server',
          query: itemList.name,
          seq: 1,
          rows: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' }
          ],
          status: { kind: 'live' }
        };
      },
      async unsubscribe() {},
      mutateGroup(request) {
        sent.push(request);
        return new Promise(() => {});
      },
      onIncompatibleServer(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async setPresence() {},
      close() {}
    };
    const client = new SyncClient({
      transport,
      clientId: 'old_server',
      actor: 'user:test',
      clock: fixedClock(1_700_000_002_000, 1),
      randomBytes: seededRandomBytes(3),
      syncModules: [syncModule],
      localCache: new MemoryCache()
    });
    await client.subscribe(itemList, {});
    const handle = client.mutateGroup([
      { mutation: setLabel, args: { itemId: 'a', label: 'A1' } },
      { mutation: setLabel, args: { itemId: 'b', label: 'B1' } }
    ]);
    await expect.poll(() => sent.length).toBe(1);
    for (const listener of listeners) listener('The sync server is too old for mutation groups.');

    expect(await handle.settled).toMatchObject({
      state: 'failed',
      error: { code: 'server_too_old' }
    });
    expect(client.rows(items).map((row) => row.label)).toEqual(['A', 'B', 'C']);
    expect(client.pendingMutations()).toBe(0);
    expect(sent[0]?.calls).toHaveLength(2);
    client.close();
  });
});
