// @vitest-environment node
/**
 * e2e proof that invalidation is collection-scoped through the REAL pipeline:
 * server, transport, client marking, context channels, liveQuery cache.
 *
 * The bug this locks out: every client change used to bump ONE global
 * version signal, and every `.rows` read rebuilt a fresh array — so a write
 * to any collection re-ran every mounted rows consumer in the app, with no memo
 * able to cut it (new identity every read). In the Surface app that meant a
 * progress heartbeat re-rendered the whole shell, several times a second.
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

const AlphaRow = t.object({ id: t.string(), label: t.string() });
const alphas = collection({ name: 'alphas', type: AlphaRow, key: (row) => row.id });
const alphaList = query({ name: 'alphas.list', params: t.object({}), into: alphas });
const BetaRow = t.object({ id: t.string(), label: t.string() });
const betas = collection({ name: 'betas', type: BetaRow, key: (row) => row.id });
const betaList = query({ name: 'betas.list', params: t.object({}), into: betas });

const renameAlpha = mutation({
  name: 'alphas.rename',
  args: t.object({ id: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    cache.update(alphas, args.id, { label: args.label });
  }
});

const syncModule = { alphas, alphaList, betas, betaList, renameAlpha };
const serverModule = {
  alphaListServer: serveQuery({
    query: alphaList,
    sql: () => sql`select id, label from alphas order by id`
  }),
  betaListServer: serveQuery({
    query: betaList,
    sql: () => sql`select id, label from betas order by id`
  }),
  renameAlphaServer: serveMutation({
    mutation: renameAlpha,
    handler: async (tx, args) => {
      await tx.sql`update alphas set label = ${args.label} where id = ${args.id}`;
    }
  })
};

class TwoTables extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'TwoTables';

  readonly alphas = this.liveQuery(alphaList, {});
  readonly betas = this.liveQuery(betaList, {});
}

let world: World;
beforeAll(async () => {
  world = await World.create({
    syncModules: [syncModule],
    servers: [serverModule],
    setup: async (db) => {
      await db.query(`create table alphas (id text primary key, label text not null)`);
      await db.query(`create table betas (id text primary key, label text not null)`);
      await db.query(`insert into alphas values ('a1', 'alpha-one')`);
      await db.query(`insert into betas values ('b1', 'beta-one')`);
    }
  });
});
afterAll(async () => {
  await world.close();
});

describe('collection-scoped invalidation (e2e)', () => {
  test('a write to alphas re-runs no beta subscriber, and beta rows keep identity', async () => {
    const client = await world.client('web_a');
    const context = new ServiceContext({ client });
    const service = context.get(TwoTables);
    // Read both views once so the lazy subscriptions open, then settle.
    void service.alphas.rows;
    void service.betas.rows;
    await world.settle();
    expect(service.alphas.rows.map((row) => row.label)).toEqual(['alpha-one']);
    expect(service.betas.rows.map((row) => row.label)).toEqual(['beta-one']);

    let alphaRuns = 0;
    let betaRuns = 0;
    const dispose = createRoot((d) => {
      createEffect(() => {
        void service.alphas.rows;
        alphaRuns += 1;
      });
      createEffect(() => {
        void service.betas.rows;
        betaRuns += 1;
      });
      return d;
    });
    expect(alphaRuns).toBe(1);
    expect(betaRuns).toBe(1);
    const betaRowsBefore = service.betas.rows;

    // A second client writes to ALPHAS; the delta lands in web_a.
    const other = await world.client('web_b');
    await other.subscribe(alphaList, {});
    await world.settle();
    await other.mutate(renameAlpha, { id: 'a1', label: 'renamed' }).settled;
    await world.settle();

    expect(service.alphas.rows.map((row) => row.label)).toEqual(['renamed']);
    // The alpha effect saw the change; the beta effect never re-ran, and
    // beta rows kept their identity through the whole exchange.
    expect(alphaRuns).toBeGreaterThan(1);
    expect(betaRuns).toBe(1);
    expect(service.betas.rows).toBe(betaRowsBefore);

    dispose();
    context.dispose();
  });
});
