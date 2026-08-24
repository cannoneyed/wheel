// @vitest-environment node
/**
 * The declaration name grammars. The one that earns a test is the operation
 * name: `<namespace>.<op>`. Query namespaces equal their target table.
 * Mutation namespaces are organizational because one mutation may touch
 * several tables.
 */
import { describe, expect, it } from 'vitest';

import { mutation, query, table } from './declarations';
import { t } from './schema';

const anyParams = t.object({});
const rows = table({ name: 'rows', type: t.object({ id: t.string() }), key: (row) => row.id });

const makeQuery = (name: string) => query({ name, params: anyParams, into: rows });
const makeMutation = (name: string) => mutation({ name, args: anyParams });

describe('operation-name grammar (4.6)', () => {
  it('accepts a target-matched query namespace and organizational mutation namespaces', () => {
    expect(() => makeQuery('rows.byTeam')).not.toThrow();
    expect(() => makeMutation('issues.update')).not.toThrow();
    expect(() => makeMutation('notifications.setRead')).not.toThrow();
  });

  it('REJECTS a camelCase namespace (the pre-4.6 shape)', () => {
    expect(() => makeQuery('cycleStats.byTeam')).toThrow(/must look like/);
    expect(() => makeQuery('projectCounts.all')).toThrow(/must look like/);
    expect(() => makeMutation('issueLabels.add')).toThrow(/must look like/);
  });

  it('REJECTS an un-namespaced name (no dot) and a leading-uppercase op', () => {
    expect(() => makeMutation('update')).toThrow(/must look like/);
    expect(() => makeQuery('rows.ByTeam')).toThrow(/must look like/);
  });

  it('REJECTS a query namespace that does not equal its target table', () => {
    expect(() => makeQuery('issues.byTeam')).toThrow(/namespace "issues" must equal target table "rows"/);
  });
});
