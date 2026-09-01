// @vitest-environment node
/**
 * The row-immutability invariant, enforced unconditionally:
 *  - every row entering the cache (put/update) is deep-frozen, in production
 *    builds too — cloneCollections shares row objects between base and effective
 *    state, so an unfrozen row mutated in place would silently corrupt the
 *    client's copy of server truth;
 *  - a handler that mutates a row in place fails loudly (TypeError in strict
 *    mode) instead of silently altering base through the shared reference;
 *  - the freeze has no NODE_ENV sensitivity: importing the module with
 *    NODE_ENV=production yields the same frozen rows.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import { collection } from '../declarations';
import { t } from '../schema';
import { OverlayCache, cloneCollections, freezeRow, collectionMap, type Collections } from './cache';

const TodoRow = t.object({
  id: t.string(),
  text: t.string(),
  tags: t.array(t.string())
});
const todos = collection({ name: 'todos', type: TodoRow, key: (row) => row.id });

function seededTables(): Collections {
  const collections: Collections = new Map();
  const cache = new OverlayCache(collections);
  cache.put(todos, { id: 't1', text: 'buy milk', tags: ['errand'] });
  return collections;
}

describe('row freezing is unconditional', () => {
  test('rows returned from the cache are deep-frozen', () => {
    const cache = new OverlayCache(seededTables());

    const row = cache.get(todos, 't1');
    expect(row).toBeDefined();
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row!.tags)).toBe(true);

    for (const listed of cache.list(todos)) {
      expect(Object.isFrozen(listed)).toBe(true);
    }
  });

  test('update produces a new frozen row', () => {
    const cache = new OverlayCache(seededTables());
    const before = cache.get(todos, 't1')!;

    cache.update(todos, 't1', { text: 'buy oat milk' });

    const after = cache.get(todos, 't1')!;
    expect(after).not.toBe(before);
    expect(after.text).toBe('buy oat milk');
    expect(Object.isFrozen(after)).toBe(true);
    // The old row is untouched — replaced, not mutated.
    expect(before.text).toBe('buy milk');
  });

  test('in-place mutation throws instead of silently corrupting shared base', () => {
    const base = seededTables();
    // Optimistic rebase shares row OBJECTS between base and the working view.
    const working = cloneCollections(base);
    const cache = new OverlayCache(working);
    const row = cache.get(todos, 't1')!;

    // A misbehaving handler mutating the row in place must fail loudly...
    expect(() => {
      row.text = 'hacked';
    }).toThrow(TypeError);
    expect(() => {
      row.tags.push('hacked');
    }).toThrow(TypeError);

    // ...and base (server truth) must be untouched.
    const baseRow = collectionMap(base, todos.name).get('t1')!;
    expect(baseRow.text).toBe('buy milk');
    expect(baseRow.tags).toEqual(['errand']);
  });

  test('optimistic puts reject empty and non-string collection keys', () => {
    const emptyKey = collection({ name: 'empty_keys', type: TodoRow, key: () => '' });
    const nonStringKey = collection({
      name: 'number_keys',
      type: TodoRow,
      key: (() => 42) as unknown as (row: typeof TodoRow._output) => string
    });
    const cache = new OverlayCache(new Map());

    expect(() => cache.put(emptyKey, { id: 't1', text: 'x', tags: [] })).toThrow(
      /collection "empty_keys" must return a non-empty string/
    );
    expect(() => cache.put(nonStringKey, { id: 't1', text: 'x', tags: [] })).toThrow(
      /collection "number_keys" must return a non-empty string/
    );
  });
});

describe('no production bypass', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test('freezeRow freezes even when NODE_ENV=production at import time', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const prodCache = await import('./cache');

    const row = prodCache.freezeRow({ id: 't1', nested: { deep: true } });
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.nested)).toBe(true);
    expect(() => {
      (row as Record<string, unknown>).id = 'mutated';
    }).toThrow(TypeError);
  });
});

describe('freezeRow', () => {
  test('is idempotent and returns already-frozen rows as-is', () => {
    const row = freezeRow({ id: 'x' });
    expect(freezeRow(row)).toBe(row);
  });
});
