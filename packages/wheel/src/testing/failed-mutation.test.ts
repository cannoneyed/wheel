// @vitest-environment node
/**
 * Regression: the transient/terminal split. A server handler that CRASHES
 * (throws a non-rejection error) must settle the mutation as `failed` — a
 * typed, terminal, rolled-back verdict — and must NOT poison the queue for
 * mutations behind it. Only failure-to-communicate may park a mutation as
 * `queued`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { mutation, query, sql, t, table } from '../sync/index';
import { serveMutation, serveQuery } from '../sync/server/index';
import { World } from './world';

const ProbeRow = t.object({ id: t.string(), label: t.string() });
const probes = table({ name: 'probes', type: ProbeRow, key: (row) => row.id });
const probeList = query({
  name: 'probes.list',
  params: t.object({}),
  into: probes,
  projection: { filter: () => true, sort: (a, b) => (a.id < b.id ? -1 : 1) }
});

/** Inserts a row — the healthy control mutation. */
const probeAdd = mutation({
  name: 'probes.add',
  args: t.object({ probeId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    cache.put(probes, { id: args.probeId, label: args.label });
  }
});

/** Optimistically inserts a row, then the SERVER handler crashes. */
const probeBoom = mutation({
  name: 'probes.boom',
  args: t.object({ probeId: t.string() }),
  optimistic: (cache, args) => {
    cache.put(probes, { id: args.probeId, label: 'doomed' });
  }
});

const probeJson = mutation({
  name: 'probes.json',
  args: t.object({ value: t.unknown() })
});

const syncModule = { probes, probeList, probeAdd, probeBoom, probeJson };
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
  probeBoomServer: serveMutation({
    mutation: probeBoom,
    handler: async () => {
      throw new Error('handler exploded on purpose');
    }
  }),
  probeJsonServer: serveMutation({
    mutation: probeJson,
    handler: async () => {}
  })
};

// One shared World for the whole file — each test uses its own client, and a
// A full SQLite World boot per test is the expensive part.
let world: World;
beforeAll(async () => {
  world = await World.create({
    syncModules: [syncModule],
    servers: [serverModule],
    setup: async (db) => {
      await db.query(`create table probes (id text primary key, label text not null)`);
    }
  });
});
afterAll(async () => {
  await world.close();
});

describe('failed mutations', () => {
  test('a crashing handler settles as failed with a typed error and rolls back', async () => {
    const client = await world.client('web_a');
    await client.subscribe(probeList, {});
    await world.settle();

    const doomedId = client.newId('probe');
    const handle = client.mutate(probeBoom, { probeId: doomedId });
    // Optimistic row is visible…
    expect(client.get(probes, doomedId)).toBeDefined();

    const info = await handle.settled; // ← regression probe: this used to hang forever
    await world.settle();
    expect(info.state).toBe('failed');
    expect(info.error?.kind).toBe('error');
    expect(info.error?.code).toBe('handler_error');
    expect(info.error?.message).toContain('exploded');
    // …and rolled back after the verdict.
    expect(client.get(probes, doomedId)).toBeUndefined();
    expect(client.pendingMutations()).toBe(0);
  });

  test('a poison mutation does not block mutations behind it', async () => {
    const [a, b] = await world.twoClients('web_b', 'web_c');
    await a.subscribe(probeList, {});
    await b.subscribe(probeList, {});
    await world.settle();

    // Queue poison + healthy back-to-back before anything settles.
    const poison = a.mutate(probeBoom, { probeId: a.newId('probe') });
    const healthyId = a.newId('probe');
    const healthy = a.mutate(probeAdd, { probeId: healthyId, label: 'still flows' });

    expect((await poison.settled).state).toBe('failed');
    expect((await healthy.settled).state).toBe('confirmed');
    await world.settle();
    // The healthy write converged to the OTHER client; the poison row exists nowhere.
    expect(b.get(probes, healthyId)?.label).toBe('still flows');
    expect(b.rows(probes).some((row) => row.label === 'doomed')).toBe(false);
  });

  test('engine pre-validation refusals are typed error verdicts, not throws', async () => {
    const client = await world.client('web_d');
    const result = await world.server.mutateGroup(
      {
        clientId: 'web_d',
        mutationId: client.newId('m'),
        calls: [{ name: 'no.suchMutation', args: {}, ids: [] }]
      },
      {
        actor: 'user:test',
        workspaceId: 'world',
        sessionId: 'web_d'
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok && 'error' in result) {
      expect(result.error.code).toBe('unknown_mutation');
    } else {
      throw new Error('expected an error verdict');
    }
  });

  test('invalid args settle failed through the SAME channel — mutate() never throws', async () => {
    // The bug this pins: mutate() used to `throw new Error(...)` synchronously
    // when args failed validation, bypassing `settled` entirely — a second,
    // hidden error channel a caller `await`ing the handle would never catch.
    // 4.2: invalid args are a caller bug, terminal like a crashed handler, so
    // they settle `failed` through the ONE channel. Nothing is applied or sent.
    const client = await world.client('web_f');
    await client.subscribe(probeList, {});
    await world.settle();

    const before = client.rows(probes).length;
    // probeAdd needs { probeId: string, label: string }; the wrong shape is the
    // point — the cast defeats the compile-time guard so we reach the runtime one.
    let handle: ReturnType<typeof client.mutate>;
    expect(() => {
      handle = client.mutate(probeAdd, { probeId: 123, label: 5 } as unknown as {
        probeId: string;
        label: string;
      });
    }).not.toThrow();

    const info = await handle!.settled; // resolves — does NOT throw
    expect(info.state).toBe('failed');
    expect(info.error?.kind).toBe('error');
    expect(info.error?.code).toBe('invalid_args');
    expect(info.error?.message).toContain('probeId');
    // The mutation never happened: no optimistic row, nothing pending or queued.
    expect(client.rows(probes).length).toBe(before);
    expect(client.pendingMutations()).toBe(0);
    expect(client.queuedMutations()).toBe(0);
  });

  test('JSON-hostile args fail locally and at the server boundary', async () => {
    const client = await world.client('web_json');
    const local = await client.mutate(probeJson, { value: new Date(0) }).settled;
    expect(local).toMatchObject({
      state: 'failed',
      error: { code: 'invalid_args', message: expect.stringContaining('class instances are not data (Date)') }
    });

    const serverResult = await world.server.mutateGroup(
      {
        clientId: 'web_json',
        mutationId: client.newId('m'),
        calls: [{ name: probeJson.name, args: { value: 42n }, ids: [] }]
      },
      {
        actor: 'user:test',
        workspaceId: 'world',
        sessionId: 'web_json'
      }
    );
    expect(serverResult).toMatchObject({
      ok: false,
      error: { code: 'invalid_args', message: expect.stringContaining('bigint is not JSON') }
    });
  });

  test('a scripted rejection still lands on the rejection channel, not error', async () => {
    const client = await world.client('web_e');
    await client.subscribe(probeList, {});
    await world.settle();
    world.rejectNext('probes.add', 'nope', 'Business said no.');
    const handle = client.mutate(probeAdd, { probeId: client.newId('probe'), label: 'x' });
    const info = await handle.settled;
    expect(info.state).toBe('rejected');
    expect(info.rejection?.code).toBe('nope');
    expect(info.error).toBeUndefined();
  });
});
