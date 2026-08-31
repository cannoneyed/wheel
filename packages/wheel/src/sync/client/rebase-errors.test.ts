// @vitest-environment node
/**
 * Fix 3.1: rebase() must tell two throws apart.
 *
 *  - A BUG in an optimistic handler (typo, null deref — here a TypeError) used
 *    to be swallowed as `orphaned`: the mutation silently rolled back with no
 *    error to paste. It must now settle terminal `failed`, keep the OTHER
 *    pending mutations applying, and console.error the mutation + cause.
 *  - The one legitimate throw — "the row I edit is gone" — is signalled with
 *    `orphan()` and still takes the `orphaned` path: terminal, cleanly rolled
 *    back.
 *
 * Both are driven e2e through the World harness. The determinism trick: pause
 * B, let the triggering delta (marker / delete) land in B's FIFO pipe BEFORE
 * B's own mutation send, so on resume the delta rebases while B's mutation is
 * still PENDING (unconfirmed) — the only state in which rebase's verdict, not
 * the server's, settles the handle.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mutation, orphan, query, sql, t, collection } from '../index';
import { serveMutation, serveQuery } from '../server/index';
import { World } from '../../testing/world';

const ProbeRow = t.object({ id: t.string(), label: t.string() });
const probes = collection({ name: 'probes', type: ProbeRow, key: (row) => row.id });
const probeList = query({
  name: 'probes.list',
  params: t.object({}),
  into: probes,
  projection: { filter: () => true, sort: (a, b) => (a.id < b.id ? -1 : 1) }
});

/** The healthy control mutation — a plain insert that must keep flowing. */
const probeAdd = mutation({
  name: 'probes.add',
  args: t.object({ probeId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    cache.put(probes, { id: args.probeId, label: args.label });
  }
});

/** Marks the watched row — the confirmed delta that flips the poison handler. */
const probeMark = mutation({
  name: 'probes.mark',
  args: t.object({ probeId: t.string() }),
  optimistic: (cache, args) => {
    cache.update(probes, args.probeId, { label: 'MARKED' });
  }
});

/**
 * The BUG: clean on first apply (watched row is unmarked), but a plain
 * TypeError on replay once the watched row carries the marker. This is the
 * throw that must land `failed`, not `orphaned`.
 */
const probePoison = mutation({
  name: 'probes.poison',
  args: t.object({ probeId: t.string(), watchId: t.string() }),
  optimistic: (cache, args) => {
    const watched = cache.get(probes, args.watchId);
    if (watched?.label === 'MARKED') {
      // Stand-in for a real handler bug (null deref / typo). Deterministic.
      throw new TypeError('poison handler read a field on the wrong shape');
    }
    cache.put(probes, { id: args.probeId, label: 'poison' });
  }
});

/**
 * The LEGITIMATE row-gone case: guards with orphan() when the row it edits is
 * missing. Must land `orphaned` with a clean rollback.
 */
const probeEdit = mutation({
  name: 'probes.edit',
  args: t.object({ probeId: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(probes, args.probeId)) throw orphan(`probe ${args.probeId} is gone`);
    cache.update(probes, args.probeId, { label: 'edited' });
  }
});

/** Peer-side hard delete — makes probeEdit's row genuinely vanish. */
const probeDelete = mutation({
  name: 'probes.delete',
  args: t.object({ probeId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(probes, args.probeId);
  }
});

const syncModule = { probes, probeList, probeAdd, probeMark, probePoison, probeEdit, probeDelete };
const serverModule = {
  probeListServer: serveQuery({
    query: probeList,
    sql: () => sql`select id, label from probes order by id`
  }),
  probeAddServer: serveMutation({
    mutation: probeAdd,
    handler: async (tx, args) => {
      await tx.sql`insert into probes (id, label) values (${args.probeId}, ${args.label})
                   on conflict (id) do nothing`;
    }
  }),
  probeMarkServer: serveMutation({
    mutation: probeMark,
    handler: async (tx, args) => {
      await tx.sql`update probes set label = 'MARKED' where id = ${args.probeId}`;
    }
  }),
  probePoisonServer: serveMutation({
    mutation: probePoison,
    handler: async (tx, args) => {
      await tx.sql`insert into probes (id, label) values (${args.probeId}, 'poison')
                   on conflict (id) do nothing`;
    }
  }),
  probeEditServer: serveMutation({
    mutation: probeEdit,
    handler: async (tx, args) => {
      await tx.sql`update probes set label = 'edited' where id = ${args.probeId}`;
    }
  }),
  probeDeleteServer: serveMutation({
    mutation: probeDelete,
    handler: async (tx, args) => {
      await tx.sql`delete from probes where id = ${args.probeId}`;
    }
  })
};

let world: World;
beforeAll(async () => {
  world = await World.create({
    syncModules: [syncModule],
    servers: [serverModule],
    setup: async (db) => {
      await db.query(`create table probes (id text primary key, label text not null)`);
      await db.query(`insert into probes (id, label) values ('r1', 'plain')`);
    }
  });
});
afterAll(async () => {
  await world.close();
});

describe('rebase error classification (fix 3.1)', () => {
  test('a handler that throws a TypeError on replay settles failed, not orphaned; siblings survive', async () => {
    const [a, b] = await world.twoClients('web_a', 'web_b');
    await a.subscribe(probeList, {});
    await b.subscribe(probeList, {});
    await world.settle();

    // A marks r1; its confirmed delta is parked in B's paused pipe FIRST.
    world.network.pause('web_b');
    a.mutate(probeMark, { probeId: 'r1' });
    await world.settle();

    // B queues two pending mutations while r1 still reads 'plain' locally:
    // the poison edit (clean on first apply) and a healthy sibling insert.
    const poisonId = b.newId('probe');
    const healthyId = b.newId('probe');
    const poison = b.mutate(probePoison, { probeId: poisonId, watchId: 'r1' });
    const healthy = b.mutate(probeAdd, { probeId: healthyId, label: 'sibling' });
    expect(b.get(probes, poisonId)?.label).toBe('poison'); // optimistic, pre-marker
    await world.settle(); // park both sends behind the marker delta in B's pipe

    // Resume: the marker delta rebases while poison is still PENDING → its
    // handler now throws the TypeError → failed. The healthy sibling replays fine.
    await world.network.resume('web_b');

    const poisonInfo = await poison.settled;
    expect(poisonInfo.state).toBe('failed');
    expect(poisonInfo.error?.kind).toBe('error');
    expect(poisonInfo.error?.code).toBe('optimistic_handler_error');
    expect(poisonInfo.error?.message).toContain('poison handler');

    const healthyInfo = await healthy.settled;
    expect(healthyInfo.state).toBe('confirmed');

    await world.settle();
    // Base converges; the healthy sibling and the marker both landed.
    expect(a.rows(probes)).toEqual(b.rows(probes));
    expect(b.get(probes, 'r1')?.label).toBe('MARKED');
    expect(b.get(probes, healthyId)?.label).toBe('sibling');
    expect(b.pendingMutations()).toBe(0);
  });

  test('a handler guarding a genuinely deleted row with orphan() settles orphaned and rolls back cleanly', async () => {
    const [a, b] = await world.twoClients('web_c', 'web_d');
    await a.subscribe(probeList, {});
    await b.subscribe(probeList, {});
    await world.settle();
    // Give both an editable row that A will delete out from under B.
    await a.mutate(probeAdd, { probeId: 'shared_row', label: 'plain' }).settled;
    await world.settle();
    expect(b.get(probes, 'shared_row')?.label).toBe('plain');

    // A deletes shared_row; the delete delta parks in B's paused pipe FIRST.
    world.network.pause('web_d');
    a.mutate(probeDelete, { probeId: 'shared_row' });
    await world.settle();

    // B edits the row while it still reads locally (clean first apply).
    const edit = b.mutate(probeEdit, { probeId: 'shared_row' });
    expect(b.get(probes, 'shared_row')?.label).toBe('edited'); // optimistic
    await world.settle();

    await world.network.resume('web_d');
    const info = await edit.settled;
    expect(info.state).toBe('orphaned');
    expect(info.error).toBeUndefined();

    await world.settle();
    // Clean rollback: no ghost row, converged with A, nothing left pending.
    expect(b.get(probes, 'shared_row')).toBeUndefined();
    expect(a.rows(probes)).toEqual(b.rows(probes));
    expect(b.pendingMutations()).toBe(0);
    const history = b.explain(probes, 'shared_row').history;
    expect(history.some((entry) => entry.cause.kind === 'orphaned')).toBe(true);
  });
});
