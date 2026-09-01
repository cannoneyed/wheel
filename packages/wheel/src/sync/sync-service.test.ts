/**
 * SyncService's subscribe/dispose race — the data-backed half of the kernel.
 * Split out of the core kernel tests because it needs the sync client seam.
 */
import { describe, expect, it } from 'vitest';

import { ServiceContext } from '../core/services';
import type { SyncClient, QueryHandle } from './client/client';
import { query, collection } from './declarations';
import { t } from './schema';
import { SyncService } from './sync-service';

describe('liveQuery subscribe/dispose race', () => {
  // Stubbed client, not a World harness: this race needs the subscribe promise
  // held open while the context disposes, which only a hand-controlled promise
  // gives deterministically.
  it('releases a handle that arrives after dispose and skips the bump', async () => {
    const Row = t.object({ id: t.string() });
    const todos = collection({ name: 'todos', type: Row, key: (row) => row.id });
    const todosAll = query({ name: 'todos.all', params: t.object({}), into: todos });

    let releaseCalls = 0;
    const handle: QueryHandle<{ id: string }> = {
      query: 'todos.all',
      subscriptionId: 'sub-1',
      rows: () => [],
      status: () => ({ kind: 'live' }),
      stale: () => false,
      release: () => {
        releaseCalls += 1;
      }
    };
    let resolveSubscribe!: (h: QueryHandle<{ id: string }>) => void;
    const stubClient = {
      onChange: () => () => {},
      subscribe: () =>
        new Promise<QueryHandle<{ id: string }>>((resolve) => {
          resolveSubscribe = resolve;
        })
    } as unknown as SyncClient;

    class TodoService extends SyncService {
      readonly todos = this.liveQuery(todosAll, {});
    }

    const context = new ServiceContext({ client: stubClient });
    const service = context.get(TodoService);
    expect(service.todos.status).toEqual({ kind: 'loading' });

    // Unmount outruns the round-trip: dispose while subscribe is in flight.
    context.dispose();
    expect(releaseCalls).toBe(0);

    resolveSubscribe(handle);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The late handle was released immediately — no server-subscription leak.
    expect(releaseCalls).toBe(1);
    // And never assigned: the view stayed loading instead of flipping live
    // (which would have bumped the disposed root).
    expect(service.todos.status).toEqual({ kind: 'loading' });
    expect(service.todos.rows).toEqual([]);
  });
});

describe('liveQuery invalidation is collection-scoped', () => {
  // Stub client again: the contract under test is the CONTEXT's — which
  // channel a rows read tracks, and when the cached array rebuilds — so the
  // change notifications are hand-fired with exact scopes.
  it('rows keep identity between changes, and only the touched collection rebuilds', async () => {
    const Row = t.object({ id: t.string() });
    const alphas = collection({ name: 'alphas', type: Row, key: (row) => row.id });
    const betas = collection({ name: 'betas', type: Row, key: (row) => row.id });
    const alphasAll = query({ name: 'alphas.all', params: t.object({}), into: alphas });
    const betasAll = query({ name: 'betas.all', params: t.object({}), into: betas });

    let listener: ((changed?: ReadonlySet<string>) => void) | undefined;
    const handleFor = (name: string): QueryHandle<{ id: string }> => ({
      query: name,
      subscriptionId: `sub-${name}`,
      // Fresh array per call, exactly like the real client's queryRows —
      // identity stability must come from the view's cache, not the stub.
      rows: () => [{ id: `${name}-row` }],
      status: () => ({ kind: 'live' }),
      stale: () => false,
      release: () => {}
    });
    const stubClient = {
      onChange: (cb: (changed?: ReadonlySet<string>) => void) => {
        listener = cb;
        return () => {};
      },
      subscribe: (q: { name: string }) => Promise.resolve(handleFor(q.name))
    } as unknown as SyncClient;

    class TwoTables extends SyncService {
      readonly alphas = this.liveQuery(alphasAll, {});
      readonly betas = this.liveQuery(betasAll, {});
    }
    const context = new ServiceContext({ client: stubClient });
    const service = context.get(TwoTables);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const alphaRows = service.alphas.rows;
    const betaRows = service.betas.rows;
    expect(alphaRows).toHaveLength(1);
    // No change: the SAME array comes back, so a memo's === cut holds.
    expect(service.alphas.rows).toBe(alphaRows);

    // A change scoped to alphas rebuilds alphas and leaves betas alone.
    listener?.(new Set(['alphas']));
    expect(service.alphas.rows).not.toBe(alphaRows);
    expect(service.betas.rows).toBe(betaRows);

    // A data-free change (status, presence, mutation lifecycle) rebuilds neither.
    const alphaRows2 = service.alphas.rows;
    listener?.(new Set());
    expect(service.alphas.rows).toBe(alphaRows2);

    // Unknown scope is conservative: everything rebuilds.
    listener?.(undefined);
    expect(service.alphas.rows).not.toBe(alphaRows2);
    expect(service.betas.rows).not.toBe(betaRows);
    context.dispose();
  });
});
