// @vitest-environment node
/**
 * The persistence-scope contract (2026-08-10 storm follow-ups):
 *  - snapshots are scoped by the schema fingerprint — a schema change
 *    retires them;
 *  - the outbox is scoped by the store only — pending mutations SURVIVE a
 *    schema change (the old single scope silently abandoned them);
 *  - scopes the app retires are deleted at open, so dead generations stop
 *    taxing every boot's getAll;
 *  - scopes the app does not own (another project in the same store) are
 *    never touched.
 */
import { afterEach, describe, expect, test } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import { createCacheScopes, IndexedDbCache } from './local-cache';

const fingerprint = (value: string) => `wheel-rows-sha256:${value.repeat(64)}`;

const scopesFor = (store: string, value: string) =>
  createCacheScopes({ storeScope: store, rowSchemaFingerprint: fingerprint(value) });

const subscription = (key: string) => ({
  key,
  subscriptionId: `sub_${key}`,
  seq: 1,
  rows: [{ id: 'row_1' }],
  order: ['row_1']
});

const outboxEntry = (mutationId: string, enqueuedAt: number) => ({
  mutationId,
  calls: [{ mutation: 'todos.add', args: { text: 'pending' }, ids: ['id_1'] }],
  enqueuedAt
});

describe('IndexedDbCache scopes', () => {
  afterEach(() => {
    // Each test builds its own factory; nothing global leaks between them.
  });

  test('the outbox survives a schema fingerprint change; snapshots do not', async () => {
    globalThis.indexedDB = new IDBFactory();
    const before = new IndexedDbCache('app', scopesFor('proj-store', 'a'));
    await before.saveSubscription(subscription('todos.byList|{}'));
    await before.appendOutbox(outboxEntry('m_1', 1));

    // The schema changes: same store identity, new fingerprint.
    const after = new IndexedDbCache('app', scopesFor('proj-store', 'b'));
    expect(await after.loadSubscriptions()).toEqual([]);
    const outbox = await after.loadOutbox();
    expect(outbox.map((entry) => entry.mutationId)).toEqual(['m_1']);
  });

  test('outbox order is enqueue order, and remove is scope-keyed', async () => {
    globalThis.indexedDB = new IDBFactory();
    const cache = new IndexedDbCache('app', scopesFor('proj-store', 'a'));
    await cache.appendOutbox(outboxEntry('m_2', 2));
    await cache.appendOutbox(outboxEntry('m_1', 1));
    expect((await cache.loadOutbox()).map((entry) => entry.mutationId)).toEqual(['m_1', 'm_2']);
    await cache.removeOutbox('m_1');
    expect((await cache.loadOutbox()).map((entry) => entry.mutationId)).toEqual(['m_2']);
  });

  test('a retired scope is deleted at open; a foreign scope survives', async () => {
    globalThis.indexedDB = new IDBFactory();
    const dead = new IndexedDbCache('app', scopesFor('proj-store', 'a'));
    await dead.saveSubscription(subscription('todos.byList|{}'));
    const foreign = new IndexedDbCache('app', scopesFor('proj-store|foreign', 'c'));
    await foreign.saveSubscription(subscription('other.query|{}'));

    // Open under the new fingerprint: proj's old generation dies, the other
    // project's rows stay.
    const current = new IndexedDbCache('app', scopesFor('proj-store', 'b'));
    await current.loadSubscriptions();

    const foreignAgain = new IndexedDbCache('app', scopesFor('proj-store|foreign', 'c'));
    expect((await foreignAgain.loadSubscriptions()).map((sub) => sub.key)).toEqual(['other.query|{}']);
    // The dead generation is gone from storage, not merely filtered: reopening
    // under the OLD fingerprint finds nothing.
    const deadAgain = new IndexedDbCache('app', scopesFor('proj-store', 'a'));
    expect(await deadAgain.loadSubscriptions()).toEqual([]);
  });

  test('standard scopes validate their owner and generated fingerprint', () => {
    expect(scopesFor('project-store', 'd')).toMatchObject({
      snapshots: `project-store|snapshots:${fingerprint('d')}`,
      outbox: 'project-store|outbox'
    });
    expect(() => scopesFor('', 'd')).toThrow(/storeScope/);
    expect(() =>
      createCacheScopes({ storeScope: 'project-store', rowSchemaFingerprint: 'manual-v1' })
    ).toThrow(/rowSchemaFingerprint/);
  });
});
