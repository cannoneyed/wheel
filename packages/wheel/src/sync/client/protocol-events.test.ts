// @vitest-environment node
/** Phase 1 client handling for query status, order-only deltas, and checkpoints. */
import { describe, expect, test } from 'vitest';

import { mutation, query, table } from '../declarations';
import { fixedClock, seededRandomBytes } from '../ids';
import type { MutateResult, ServerEvent, Snapshot } from '../protocol';
import { t } from '../schema';
import { SyncClient } from './client';
import { MemoryCache } from './local-cache';
import type { SyncTransport } from './transport';

const ItemRow = t.object({ id: t.string(), label: t.string() });
const items = table({ name: 'protocol_items', type: ItemRow, key: (row) => row.id });
const itemList = query({
  name: 'protocol_items.all',
  params: t.object({}),
  into: items,
  projection: { filter: () => true }
});
const previewOnly = mutation({
  name: 'protocol_items.previewOnly',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => cache.update(items, args.itemId, { label: args.label })
});

interface Harness {
  readonly client: SyncClient;
  readonly push: (event: ServerEvent) => void;
  readonly resolveMutation: (result: MutateResult) => void;
}

function harness(snapshot: Snapshot): Harness {
  let onEvent: (event: ServerEvent) => void = () => {};
  let resolveMutation: (result: MutateResult) => void = () => {};
  const mutationResult = new Promise<MutateResult>((resolve) => {
    resolveMutation = resolve;
  });
  const transport: SyncTransport = {
    async connect(_clientId, listener): Promise<void> {
      onEvent = listener;
    },
    async subscribe(): Promise<Snapshot> {
      return snapshot;
    },
    async unsubscribe(): Promise<void> {},
    async mutate(): Promise<MutateResult> {
      return mutationResult;
    },
    async setPresence(): Promise<void> {},
    close(): void {}
  };
  return {
    client: new SyncClient({
      transport,
      clientId: 'protocol_client',
      actor: 'user:test',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(9),
      localCache: new MemoryCache()
    }),
    push: (event) => onEvent(event),
    resolveMutation
  };
}

async function drainMicrotasks(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

describe('query lifecycle events', () => {
  test('keeps last valid rows while stale and returns to live', async () => {
    const testHarness = harness({
      subscriptionId: 'sub_items',
      query: itemList.name,
      seq: 0,
      rows: [{ id: 'item_1', label: 'kept' }],
      status: { kind: 'live' }
    });
    const handle = await testHarness.client.subscribe(itemList, {});

    testHarness.push({
      type: 'query_status',
      status: {
        subscriptionId: 'sub_items',
        query: itemList.name,
        seq: 1,
        status: {
          kind: 'stale',
          error: { code: 'query_error', message: 'The live query failed.' }
        }
      }
    });
    expect(handle.status()).toMatchObject({ kind: 'stale', error: { code: 'query_error' } });
    expect(handle.rows()).toEqual([{ id: 'item_1', label: 'kept' }]);

    testHarness.push({
      type: 'query_status',
      status: {
        subscriptionId: 'sub_items',
        query: itemList.name,
        seq: 2,
        status: { kind: 'live' }
      }
    });
    expect(handle.status()).toEqual({ kind: 'live' });
    expect(handle.rows()).toEqual([{ id: 'item_1', label: 'kept' }]);
    testHarness.client.close();
  });

  test('surfaces an initial query failure as a handle status', async () => {
    const testHarness = harness({
      subscriptionId: 'sub_error',
      query: itemList.name,
      seq: 4,
      rows: [],
      status: {
        kind: 'error',
        error: { code: 'query_error', message: 'The live query failed.' }
      }
    });

    const handle = await testHarness.client.subscribe(itemList, {});

    expect(handle.status()).toMatchObject({ kind: 'error', error: { code: 'query_error' } });
    expect(handle.rows()).toEqual([]);
    testHarness.client.close();
  });
});

describe('ordered deltas and checkpoints', () => {
  test('applies an order-only delta with no row writes', async () => {
    const testHarness = harness({
      subscriptionId: 'sub_order',
      query: itemList.name,
      seq: 0,
      rows: [
        { id: 'item_1', label: 'first' },
        { id: 'item_2', label: 'second' }
      ],
      status: { kind: 'live' }
    });
    const handle = await testHarness.client.subscribe(itemList, {});

    testHarness.push({
      type: 'delta',
      delta: {
        subscriptionId: 'sub_order',
        query: itemList.name,
        seq: 1,
        puts: [],
        deletes: [],
        order: ['item_2', 'item_1']
      }
    });

    expect(handle.rows().map((row) => row.id)).toEqual(['item_2', 'item_1']);
    testHarness.client.close();
  });

  test('uses a checkpoint to clear confirmed optimistic state without a delta', async () => {
    const testHarness = harness({
      subscriptionId: 'sub_checkpoint',
      query: itemList.name,
      seq: 0,
      rows: [{ id: 'item_1', label: 'server' }],
      status: { kind: 'live' }
    });
    await testHarness.client.subscribe(itemList, {});
    const mutationHandle = testHarness.client.mutate(previewOnly, {
      itemId: 'item_1',
      label: 'optimistic'
    });
    expect(testHarness.client.get(items, 'item_1')?.label).toBe('optimistic');
    await drainMicrotasks();

    testHarness.push({ type: 'checkpoint', seq: 1 });
    testHarness.resolveMutation({ ok: true, seq: 1 });
    expect((await mutationHandle.settled).state).toBe('confirmed');

    expect(testHarness.client.pendingMutations()).toBe(0);
    expect(testHarness.client.get(items, 'item_1')?.label).toBe('server');
    testHarness.client.close();
  });
});
