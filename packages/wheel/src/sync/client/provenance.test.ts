/**
 * `causeMutations` is the ONE place that reads what a write cause contains.
 *
 * Every surface that shows a cause — the annotator's timeline, the tracker's
 * provenance receipt, the debug panel's change stream — goes through it rather
 * than destructuring `WriteCause`. That is not a style preference. When 0.2
 * renamed `mutation` to `mutations`, two surfaces narrowed on property
 * presence (`'mutation' in cause`), which stays valid TypeScript after a
 * rename and simply stops matching — so both silently dropped the mutation
 * names from every row they rendered, and nothing failed.
 *
 * With one owner, that rename is a compile error where the shape is read, and
 * consumers cannot get it wrong because they never touch the shape.
 */
import { describe, expect, it } from 'vitest';

import { causeMutations, type WriteCause } from './provenance';

describe('causeMutations', () => {
  it('names the mutations behind a local write', () => {
    const cause: WriteCause = { kind: 'optimistic', mutationId: 'm1', mutations: ['toggleCell'] };
    expect(causeMutations(cause)).toEqual(['toggleCell']);
  });

  it('names every mutation in an atomic group', () => {
    // A group publishes, commits, retries and rolls back as one command, so
    // one cause can stand for several edits. Showing only the first would be
    // a lie about what happened.
    const cause: WriteCause = {
      kind: 'optimistic',
      mutationId: 'm1',
      mutations: ['addRow', 'setTotal']
    };
    expect(causeMutations(cause)).toEqual(['addRow', 'setTotal']);
  });

  it('names them for a rollback and an orphan too', () => {
    const rolled: WriteCause = { kind: 'rollback', mutationId: 'm1', mutations: ['setDue'] };
    const orphaned: WriteCause = { kind: 'orphaned', mutationId: 'm2', mutations: ['addTag'] };
    expect(causeMutations(rolled)).toEqual(['setDue']);
    expect(causeMutations(orphaned)).toEqual(['addTag']);
  });

  it('returns nothing for the causes that name no mutation', () => {
    // Server-originated and cache-originated writes have a sequence, not a
    // local edit behind them.
    const server: readonly WriteCause[] = [
      { kind: 'bootstrap', seq: 1, subscriptionId: 's1' },
      { kind: 'sync-apply', seq: 2, subscriptionId: 's1' },
      { kind: 'hydrate', seq: 3 }
    ];
    for (const cause of server) {
      expect(causeMutations(cause)).toEqual([]);
    }
  });
});
