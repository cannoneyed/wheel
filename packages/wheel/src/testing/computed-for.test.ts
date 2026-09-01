// @vitest-environment node
/**
 * e2e reproduction of the parameterized-computed eviction bug (011 Part 3.2),
 * fixed structurally by the computed/computedFor split (Part 4.1).
 *
 * The old parameterized `computed` hid a 256-entry LRU. Reading the 257th
 * distinct key silently DISPOSED the least-recently-used key's memo — but a
 * component (here: a Solid effect) still watching that key stayed wired to
 * the disposed memo and never re-ran. Symptom: a row's UI freezes forever
 * once a long list scrolls past 256 rows; the next imperative read returns
 * fresh data, so the bug hides from everything except a live subscriber.
 *
 * `computedFor` has NO eviction — one memo per key, alive until the service
 * disposes — so every one of the 300 keys here stays live. Real server, real
 * client, real SyncService, through the World harness.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createEffect, createRoot } from 'solid-js';

import { ServiceContext } from '../core/services';
import { mutation, query, collection } from '../sync/declarations';
import { t } from '../sync/schema';
import { sql } from '../sync/sql';
import { serveMutation, serveQuery } from '../sync/server/serve';
import { SyncService } from '../sync/sync-service';
import { World } from './world';

const KEY_COUNT = 300; // 44 past the old LRU limit of 256

const ItemRow = t.object({ id: t.string(), label: t.string() });
const items = collection({ name: 'items', type: ItemRow, key: (row) => row.id });
const itemList = query({
  name: 'items.list',
  params: t.object({}),
  into: items,
  projection: { filter: () => true, sort: (a, b) => (a.id < b.id ? -1 : 1) }
});

const renameItem = mutation({
  name: 'items.rename',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    cache.update(items, args.itemId, { label: args.label });
  }
});

const syncModule = { items, itemList, renameItem };
const serverModule = {
  itemListServer: serveQuery({
    query: itemList,
    sql: () => sql`select id, label from items order by id`
  }),
  renameItemServer: serveMutation({
    mutation: renameItem,
    handler: async (tx, args) => {
      await tx.sql`update items set label = ${args.label} where id = ${args.itemId}`;
    }
  })
};

const itemId = (n: number): string => `item-${String(n).padStart(3, '0')}`;
const ids = Array.from({ length: KEY_COUNT }, (_, n) => itemId(n));

/** Per-item vm derivation — the shape every row component connects through. */
class ItemService extends SyncService {
  readonly items = this.liveQuery(itemList, {});
  readonly labelFor = this.computedFor((id: string) => {
    return this.items.rows.find((row) => row.id === id)?.label ?? '(missing)';
  }, 'labelFor');
}

let world: World;
beforeAll(async () => {
  world = await World.create({
    syncModules: [syncModule],
    servers: [serverModule],
    setup: async (db) => {
      await db.query(`create table items (id text primary key, label text not null)`);
      const values = ids.map((id, n) => `('${id}', 'label-${n}')`).join(', ');
      await db.query(`insert into items values ${values}`);
    }
  });
});
afterAll(async () => {
  await world.close();
});

describe('computedFor per-key lifetime (e2e)', () => {
  test('a live subscriber to key 1 of 300 still updates after every key is read', async () => {
    const client = await world.client('web_a');
    const context = new ServiceContext({ client });
    const service = context.get(ItemService);
    await world.settle();
    expect(service.items.rows.length).toBe(KEY_COUNT);

    // A component watching item-000 — the row that scrolled off-screen first.
    const watched = itemId(0);
    const seen: string[] = [];
    const dispose = createRoot((d) => {
      // effect: the live subscriber whose silent death WAS the eviction bug
      createEffect(() => {
        seen.push(service.labelFor(watched));
      });
      return d;
    });
    expect(seen).toEqual(['label-0']);

    // Read EVERY key — a long list rendering all its rows. Under the old
    // LRU this disposed item-000's memo at the 257th distinct key.
    for (const id of ids) service.labelFor(id);

    // Another client renames the watched row; convergence must reach the
    // effect, not just the caches.
    const other = await world.client('web_b');
    await other.subscribe(itemList, {});
    await world.settle();
    await other.mutate(renameItem, { itemId: watched, label: 'renamed' }).settled;
    await world.settle();

    // Imperative reads were ALWAYS fresh (a disposed entry was silently
    // recreated on the next call) — that is what made the bug invisible.
    expect(service.labelFor(watched)).toBe('renamed');

    // The pinned regression: the live subscriber saw the change. With the
    // old LRU, `seen` stayed ['label-0'] forever — the frozen-row bug.
    expect(seen).toEqual(['label-0', 'renamed']);

    // And the far end of the keyspace is live too, not just the watched key.
    expect(service.labelFor(itemId(KEY_COUNT - 1))).toBe(`label-${KEY_COUNT - 1}`);

    dispose();
    context.dispose();
  });
});
