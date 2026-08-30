// @vitest-environment node
/**
 * Phase 0B proof for the Wheel-owned state materializer.
 *
 * The cases focus on semantic command replay, query membership, atomic
 * publication, and whole-group failure. Production SyncClient still owns
 * application reads while this proof remains internal.
 */
import { describe, expect, test } from 'vitest';

import {
  mutation,
  orphan,
  query,
  table,
  type InverseSpec,
  type MutationDecl,
  type QueryDecl
} from '../declarations';
import { fixedClock, seededRandomBytes } from '../ids';
import type { MutateResult, ServerEvent } from '../protocol';
import { t } from '../schema';
import { SyncClient } from './client';
import { MemoryCache } from './local-cache';
import {
  WheelMaterializer,
  type MaterializerCall,
  type MaterializerQueryStatus,
  type MaterializerQueryUpdate
} from './materializer';
import type { SyncTransport } from './transport';

const ItemRow = t.object({
  id: t.string(),
  teamId: t.string(),
  label: t.string(),
  mode: t.string()
});
const LinkRow = t.object({ id: t.string(), itemId: t.string(), label: t.string() });
const AuditRow = t.object({ id: t.string(), message: t.string() });

const items = table({ name: 'items', type: ItemRow, key: (row) => row.id });
const links = table({ name: 'links', type: LinkRow, key: (row) => row.id });
const audits = table({ name: 'audits', type: AuditRow, key: (row) => row.id });

const itemsByTeam = query({
  name: 'items.byTeam',
  params: t.object({ teamId: t.string() }),
  into: items,
  projection: {
    filter: (row, params) => row.teamId === params.teamId,
    sort: (left, right) => left.label.localeCompare(right.label)
  }
});
const itemsByMode = query({
  name: 'items.byMode',
  params: t.object({ mode: t.string() }),
  into: items,
  projection: { filter: (row, params) => row.mode === params.mode }
});
const serverOnlyItems = query({
  name: 'items.serverOnly',
  params: t.object({}),
  into: items
});
const allLinks = query({
  name: 'links.all',
  params: t.object({}),
  into: links,
  projection: { filter: () => true }
});
const allAudits = query({
  name: 'audits.all',
  params: t.object({}),
  into: audits,
  projection: { filter: () => true }
});

const replaceItem = mutation({
  name: 'items.replace',
  args: ItemRow,
  optimistic: (cache, args) => {
    if (!cache.get(items, args.id)) throw orphan(`item ${args.id} is gone`);
    cache.put(items, args);
  },
  invert: (reader, args): InverseSpec | null => {
    const prior = reader.get(items, args.id);
    return prior ? { mutation: replaceItem, args: prior, description: 'replace item' } : null;
  }
});

const setItemLabel = mutation({
  name: 'items.setLabel',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: args.label });
  },
  invert: (reader, args): InverseSpec | null => {
    const prior = reader.get(items, args.itemId);
    return prior
      ? { mutation: setItemLabel, args: { itemId: args.itemId, label: prior.label }, description: 'set item label' }
      : null;
  }
});

const appendItemLabel = mutation({
  name: 'items.appendLabel',
  args: t.object({ itemId: t.string(), suffix: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(items, args.itemId);
    if (!row) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: `${row.label}${args.suffix}` });
  },
  invert: (reader, args): InverseSpec | null => {
    const prior = reader.get(items, args.itemId);
    return prior
      ? { mutation: setItemLabel, args: { itemId: args.itemId, label: prior.label }, description: 'append item label' }
      : null;
  }
});

const moveItem = mutation({
  name: 'items.move',
  args: t.object({ itemId: t.string(), teamId: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(items, args.itemId);
    if (!row) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { teamId: args.teamId, label: `from-${row.teamId}` });
  },
  invert: (reader, args): InverseSpec | null => {
    const prior = reader.get(items, args.itemId);
    return prior ? { mutation: replaceItem, args: prior, description: 'move item' } : null;
  }
});

const createItem = mutation({
  name: 'items.create',
  args: t.object({ teamId: t.string(), label: t.string(), mode: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.put(items, { id: ctx.newId('item'), ...args });
  }
});

const pruneLink = mutation({
  name: 'links.prune',
  args: t.object({ itemId: t.string(), linkId: t.string() }),
  optimistic: (cache, args) => {
    const item = cache.get(items, args.itemId);
    if (!item) throw orphan(`item ${args.itemId} is gone`);
    if (item.mode === 'drop') cache.delete(links, args.linkId);
  }
});

const editAndAudit = mutation({
  name: 'items.editAndAudit',
  args: t.object({ itemId: t.string(), label: t.string() }),
  optimistic: (cache, args, ctx) => {
    if (!cache.get(items, args.itemId)) throw orphan(`item ${args.itemId} is gone`);
    cache.update(items, args.itemId, { label: args.label });
    cache.put(audits, { id: ctx.newId('audit'), message: `changed ${args.itemId}` });
  }
});

const purgeItem = mutation({
  name: 'items.purge',
  args: t.object({ itemId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(items, args.itemId);
  }
});

const live: MaterializerQueryStatus = { kind: 'live' };

function makeMaterializer(): WheelMaterializer {
  return new WheelMaterializer({ actor: 'user:test', now: () => 1_700_000_000_000 });
}

function update<Params extends Record<string, unknown>, Row extends Record<string, unknown>>(
  queryDecl: QueryDecl<Params, Row>,
  params: Params,
  options: {
    readonly puts?: readonly Row[];
    readonly deletes?: readonly string[];
    readonly order?: readonly string[];
    readonly status?: MaterializerQueryStatus;
  } = {}
): MaterializerQueryUpdate {
  return {
    query: queryDecl,
    params,
    puts: options.puts,
    deletes: options.deletes,
    order: options.order ?? [],
    status: options.status ?? live
  };
}

function call<Args extends Record<string, unknown>>(
  mutationDecl: MutationDecl<Args>,
  args: Args,
  ids: readonly string[] = []
): MaterializerCall<Args> {
  return { mutation: mutationDecl, args, ids };
}

function labels(rows: readonly { readonly label: string }[]): readonly string[] {
  return rows.map((row) => row.label);
}

function seedItem(id: string, teamId = 'A', label = 'base', mode = 'keep') {
  return { id, teamId, label, mode };
}

async function drainMicrotasks(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

describe('Wheel materializer server batches', () => {
  test('publishes entity, membership, and status as one final view', () => {
    const materializer = makeMaterializer();
    const observed: Array<{ revision: number; rows: readonly string[]; status: string | undefined }> = [];
    materializer.onPublish((publication) => {
      observed.push({
        revision: publication.revision,
        rows: labels(materializer.queryRows(itemsByTeam, { teamId: 'A' })),
        status: materializer.queryStatus(itemsByTeam, { teamId: 'A' })?.kind
      });
      expect(publication.changedTables).toEqual(new Set(['items']));
    });

    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })
      ]
    });

    expect(observed).toEqual([{ revision: 1, rows: ['base'], status: 'live' }]);
    expect(materializer.rows(items)).toEqual([seedItem('item_1')]);
  });

  test('replays a local A-to-B move against a newer confirmed A-to-C move', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] }),
        update(itemsByTeam, { teamId: 'B' }),
        update(itemsByTeam, { teamId: 'C' })
      ]
    });
    materializer.enqueue({
      mutationId: 'move_1',
      calls: [call(moveItem, { itemId: 'item_1', teamId: 'B' })],
      requireUndo: false
    });
    expect(materializer.get(items, 'item_1')).toMatchObject({ teamId: 'B', label: 'from-A' });

    let publications = 0;
    materializer.onPublish(() => {
      publications += 1;
    });
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, { deletes: ['item_1'] }),
        update(itemsByTeam, { teamId: 'C' }, {
          puts: [seedItem('item_1', 'C', 'peer', 'keep')],
          order: ['item_1']
        })
      ]
    });

    expect(publications).toBe(1);
    expect(materializer.get(items, 'item_1')).toEqual(seedItem('item_1', 'B', 'from-C', 'keep'));
    expect(labels(materializer.queryRows(itemsByTeam, { teamId: 'A' }))).toEqual([]);
    expect(labels(materializer.queryRows(itemsByTeam, { teamId: 'B' }))).toEqual(['from-C']);
    expect(labels(materializer.queryRows(itemsByTeam, { teamId: 'C' }))).toEqual([]);
  });

  test('replaces an old write set when replay no longer deletes a link', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_1', 'A', 'base', 'drop')],
          order: ['item_1']
        }),
        update(allLinks, {}, {
          puts: [{ id: 'link_1', itemId: 'item_1', label: 'kept by server' }],
          order: ['link_1']
        })
      ]
    });
    materializer.enqueue({
      mutationId: 'prune_1',
      calls: [call(pruneLink, { itemId: 'item_1', linkId: 'link_1' })],
      requireUndo: false
    });
    expect(materializer.get(links, 'link_1')).toBeUndefined();

    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_1', 'A', 'peer', 'keep')],
          order: ['item_1']
        })
      ]
    });

    expect(materializer.get(links, 'link_1')).toEqual({
      id: 'link_1',
      itemId: 'item_1',
      label: 'kept by server'
    });
    expect(materializer.queryRows(allLinks, {})).toHaveLength(1);
  });

  test('orphaned replay removes a command and leaves no ghost row', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })]
    });
    materializer.enqueue({
      mutationId: 'edit_1',
      calls: [call(setItemLabel, { itemId: 'item_1', label: 'local' })],
      requireUndo: false
    });

    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { deletes: ['item_1'] })]
    });

    expect(materializer.commandState('edit_1')?.state).toBe('orphaned');
    expect(materializer.pendingCommandIds()).toEqual([]);
    expect(materializer.get(items, 'item_1')).toBeUndefined();
    expect(materializer.queryRows(itemsByTeam, { teamId: 'A' })).toEqual([]);
  });

  test('rejection rolls back to the latest confirmed row', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })]
    });
    materializer.enqueue({
      mutationId: 'edit_1',
      calls: [call(setItemLabel, { itemId: 'item_1', label: 'local' })],
      requireUndo: false
    });
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_1', 'A', 'remote', 'keep')],
          order: ['item_1']
        })
      ]
    });
    expect(materializer.get(items, 'item_1')?.label).toBe('local');

    expect(materializer.removeCommand('edit_1', 'rejected')).toBe(true);

    expect(materializer.commandState('edit_1')?.state).toBe('rejected');
    expect(materializer.get(items, 'item_1')?.label).toBe('remote');
  });
});

describe('Wheel materializer command replay', () => {
  test('keeps two commands in order and reuses the original ID stream', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({ queries: [update(itemsByTeam, { teamId: 'A' })] });
    materializer.enqueue({
      mutationId: 'create_1',
      calls: [call(createItem, { teamId: 'A', label: 'created', mode: 'keep' }, ['item_fixed'])],
      requireUndo: false
    });
    materializer.enqueue({
      mutationId: 'edit_1',
      calls: [call(setItemLabel, { itemId: 'item_fixed', label: 'edited second' })],
      requireUndo: false
    });

    materializer.applyServerBatch({ queries: [update(itemsByTeam, { teamId: 'A' })] });

    expect(materializer.pendingCommandIds()).toEqual(['create_1', 'edit_1']);
    expect(materializer.get(items, 'item_fixed')).toEqual(seedItem('item_fixed', 'A', 'edited second'));
    expect(labels(materializer.queryRows(itemsByTeam, { teamId: 'A' }))).toEqual(['edited second']);
    expect(materializer.metrics()).toMatchObject({
      preflights: 2,
      rebuilds: 4,
      tableClones: 13,
      commandReplays: 5,
      memberReplays: 5,
      publications: 4
    });
  });

  test('publishes a multi-collection command without an intermediate view', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] }),
        update(allAudits, {})
      ]
    });
    const observed: Array<{ item: string | undefined; audits: number; changed: readonly string[] }> = [];
    materializer.onPublish((publication) => {
      observed.push({
        item: materializer.get(items, 'item_1')?.label,
        audits: materializer.rows(audits).length,
        changed: [...publication.changedTables].sort()
      });
    });

    materializer.enqueue({
      mutationId: 'audit_1',
      calls: [call(editAndAudit, { itemId: 'item_1', label: 'edited' }, ['audit_fixed'])],
      requireUndo: false
    });

    expect(observed).toEqual([{ item: 'edited', audits: 1, changed: ['audits', 'items'] }]);
    expect(materializer.queryRows(allAudits, {})).toEqual([
      { id: 'audit_fixed', message: 'changed item_1' }
    ]);
  });

  test('applies three group members in order and publishes once', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })]
    });
    let publications = 0;
    materializer.onPublish(() => {
      publications += 1;
    });

    expect(materializer.enqueue({
      mutationId: 'group_1',
      calls: [
        call(appendItemLabel, { itemId: 'item_1', suffix: 'A' }),
        call(appendItemLabel, { itemId: 'item_1', suffix: 'B' }),
        call(appendItemLabel, { itemId: 'item_1', suffix: 'C' })
      ],
      requireUndo: true
    })).toEqual({ state: 'pending' });

    expect(publications).toBe(1);
    expect(materializer.get(items, 'item_1')?.label).toBe('baseABC');
    expect(materializer.commandInverses('group_1').map((inverse) => inverse.args)).toEqual([
      { itemId: 'item_1', label: 'baseAB' },
      { itemId: 'item_1', label: 'baseA' },
      { itemId: 'item_1', label: 'base' }
    ]);

    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_1', 'A', 'remote', 'keep')],
          order: ['item_1']
        })
      ]
    });
    expect(publications).toBe(2);
    expect(materializer.get(items, 'item_1')?.label).toBe('remoteABC');
  });

  test('rejects a non-invertible group before any public apply', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })]
    });
    const beforeRevision = materializer.revision();
    let publications = 0;
    materializer.onPublish(() => {
      publications += 1;
    });

    const result = materializer.enqueue({
      mutationId: 'group_bad',
      calls: [
        call(setItemLabel, { itemId: 'item_1', label: 'must not appear' }),
        call(purgeItem, { itemId: 'item_1' })
      ],
      requireUndo: true
    });

    expect(result).toMatchObject({ state: 'failed' });
    expect(result.message).toContain('not invertible');
    expect(materializer.revision()).toBe(beforeRevision);
    expect(publications).toBe(0);
    expect(materializer.pendingCommandIds()).toEqual([]);
    expect(materializer.get(items, 'item_1')?.label).toBe('base');
  });

  test('drops an orphaned group and replays a later command from confirmed state', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_a', 'A', 'A'), seedItem('item_b', 'A', 'B')],
          order: ['item_a', 'item_b']
        })
      ]
    });
    materializer.enqueue({
      mutationId: 'group_1',
      calls: [
        call(appendItemLabel, { itemId: 'item_a', suffix: '-group' }),
        call(appendItemLabel, { itemId: 'item_b', suffix: '-group' })
      ],
      requireUndo: true
    });
    materializer.enqueue({
      mutationId: 'later_1',
      calls: [call(setItemLabel, { itemId: 'item_a', label: 'later' })],
      requireUndo: false
    });

    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_a', 'A', 'remote')],
          deletes: ['item_b'],
          order: ['item_a']
        })
      ]
    });

    expect(materializer.commandState('group_1')?.state).toBe('orphaned');
    expect(materializer.pendingCommandIds()).toEqual(['later_1']);
    expect(materializer.get(items, 'item_a')?.label).toBe('later');
    expect(materializer.get(items, 'item_b')).toBeUndefined();
  });
});

describe('Wheel materializer query scopes', () => {
  test('retains shared rows until the final query claim is released', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] }),
        update(itemsByMode, { mode: 'keep' }, { order: ['item_1'] }),
        update(itemsByTeam, { teamId: 'empty' })
      ]
    });

    expect(materializer.queryStatus(itemsByTeam, { teamId: 'empty' })).toEqual({ kind: 'live' });
    expect(materializer.queryRows(itemsByTeam, { teamId: 'empty' })).toEqual([]);
    expect(materializer.releaseQuery(itemsByTeam, { teamId: 'A' })).toBe(true);
    expect(materializer.get(items, 'item_1')).toBeDefined();
    expect(materializer.queryRows(itemsByMode, { mode: 'keep' })).toHaveLength(1);

    expect(materializer.releaseQuery(itemsByMode, { mode: 'keep' })).toBe(true);
    expect(materializer.get(items, 'item_1')).toBeUndefined();
    expect(materializer.queryStatus(itemsByTeam, { teamId: 'empty' })).toEqual({ kind: 'live' });
  });

  test('does not invent query membership without an optimistic projection', () => {
    const materializer = makeMaterializer();
    materializer.applyServerBatch({ queries: [update(serverOnlyItems, {})] });

    materializer.enqueue({
      mutationId: 'create_1',
      calls: [call(createItem, { teamId: 'A', label: 'local', mode: 'keep' }, ['item_local'])],
      requireUndo: false
    });

    expect(materializer.get(items, 'item_local')).toBeDefined();
    expect(materializer.queryRows(serverOnlyItems, {})).toEqual([]);
    expect(materializer.queryStatus(serverOnlyItems, {})).toEqual({ kind: 'live' });
  });
});

describe('current client differential', () => {
  test('matches rows through optimistic replay, a peer update, and rejection rollback', async () => {
    let onEvent: (event: ServerEvent) => void = () => {};
    let resolveMutation: (result: MutateResult) => void = () => {};
    const mutationResult = new Promise<MutateResult>((resolve) => {
      resolveMutation = resolve;
    });
    const transport: SyncTransport = {
      async connect(_clientId, listener): Promise<void> {
        onEvent = listener;
      },
      async subscribe(): Promise<{
        subscriptionId: string;
        query: string;
        seq: number;
        rows: readonly Record<string, unknown>[];
        status: { readonly kind: 'live' };
      }> {
        return {
          subscriptionId: 'sub_items_a',
          query: itemsByTeam.name,
          seq: 1,
          rows: [seedItem('item_1')],
          status: { kind: 'live' }
        };
      },
      async unsubscribe(): Promise<void> {},
      async mutateGroup(): Promise<MutateResult> {
        return mutationResult;
      },
      async setPresence(): Promise<void> {},
      close(): void {}
    };
    const client = new SyncClient({
      transport,
      clientId: 'client_proof',
      actor: 'user:test',
      clock: fixedClock(1_700_000_000_000, 1),
      randomBytes: seededRandomBytes(17),
      localCache: new MemoryCache()
    });
    const handle = await client.subscribe(itemsByTeam, { teamId: 'A' });
    const materializer = makeMaterializer();
    materializer.applyServerBatch({
      queries: [update(itemsByTeam, { teamId: 'A' }, { puts: [seedItem('item_1')], order: ['item_1'] })]
    });
    let clientPublications = 0;
    let materializerPublications = 0;
    client.onChange(() => {
      clientPublications += 1;
    });
    materializer.onPublish(() => {
      materializerPublications += 1;
    });

    const clientMutation = client.mutate(setItemLabel, { itemId: 'item_1', label: 'local' });
    materializer.enqueue({
      mutationId: 'edit_1',
      calls: [call(setItemLabel, { itemId: 'item_1', label: 'local' })],
      requireUndo: false
    });
    expect(client.rows(items)).toEqual(materializer.rows(items));
    expect(handle.rows()).toEqual(materializer.queryRows(itemsByTeam, { teamId: 'A' }));

    onEvent({
      type: 'delta',
      delta: {
        subscriptionId: 'sub_items_a',
        query: itemsByTeam.name,
        seq: 2,
        puts: [seedItem('item_1', 'A', 'remote')],
        deletes: [],
        order: ['item_1']
      }
    });
    materializer.applyServerBatch({
      queries: [
        update(itemsByTeam, { teamId: 'A' }, {
          puts: [seedItem('item_1', 'A', 'remote')],
          order: ['item_1']
        })
      ]
    });
    expect(client.rows(items)).toEqual(materializer.rows(items));
    expect(handle.rows()).toEqual(materializer.queryRows(itemsByTeam, { teamId: 'A' }));

    await drainMicrotasks();
    resolveMutation({
      ok: false,
      rejection: { kind: 'rejection', code: 'conflict', message: 'peer won' }
    });
    expect((await clientMutation.settled).state).toBe('rejected');
    materializer.removeCommand('edit_1', 'rejected');

    expect(client.rows(items)).toEqual(materializer.rows(items));
    expect(handle.rows()).toEqual(materializer.queryRows(itemsByTeam, { teamId: 'A' }));
    expect(client.get(items, 'item_1')?.label).toBe('remote');
    expect(clientPublications).toBe(3);
    expect(materializerPublications).toBe(3);
    expect(materializer.metrics().publications).toBe(4);

    handle.release();
    client.close();
  });
});
