import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildUrl, compileRoutes, matchUrl } from './match';

const routes = compileRoutes({
  path: '/',
  children: {
    home: { path: '/' },
    settings: { path: 'settings' },
    teams: {
      path: 'teams',
      children: {
        // Static sibling of a param route: `/teams/new` must prefer this.
        create: { path: 'new' },
        detail: {
          path: '$teamId',
          search: z.object({ tab: z.enum(['issues', 'board']).default('issues') }),
          children: {
            issues: {
              path: 'issues',
              search: z.object({ q: z.string().default(''), page: z.number().default(1) })
            },
            board: { path: 'board' }
          }
        }
      }
    }
  }
});

describe('compileRoutes', () => {
  it('names every node by its dotted path and accumulates segments', () => {
    expect([...routes.byName.keys()]).toEqual([
      'home',
      'settings',
      'teams',
      'teams.create',
      'teams.detail',
      'teams.detail.issues',
      'teams.detail.board'
    ]);
    expect(routes.byName.get('teams.detail.issues')?.chain).toEqual([
      'teams',
      'teams.detail',
      'teams.detail.issues'
    ]);
  });

  it('rejects a malformed tree at startup, not at navigation time', () => {
    expect(() => compileRoutes({ path: '/', children: { bad: { path: '$' } } })).toThrow(
      /no param name/
    );
    expect(() =>
      compileRoutes({
        path: '/',
        children: { a: { path: '$id', children: { b: { path: '$id' } } } }
      })
    ).toThrow(/declares param 'id' twice/);
    expect(() => compileRoutes({ path: '/', children: { 'a.b': { path: 'x' } } })).toThrow(
      /cannot contain '\.'/
    );
  });
});

describe('matchUrl', () => {
  it('matches an index child rather than the root layout', () => {
    expect(matchUrl(routes, '/')?.name).toBe('home');
  });

  it('binds params from the whole chain', () => {
    const match = matchUrl(routes, '/teams/t1/issues');
    expect(match?.name).toBe('teams.detail.issues');
    expect(match?.params).toEqual({ teamId: 't1' });
    expect(match?.chain).toEqual(['teams', 'teams.detail', 'teams.detail.issues']);
  });

  it('prefers a static segment over a param at the same depth', () => {
    expect(matchUrl(routes, '/teams/new')?.name).toBe('teams.create');
    expect(matchUrl(routes, '/teams/other')?.name).toBe('teams.detail');
  });

  it('returns null instead of throwing for a URL that matches nothing', () => {
    expect(matchUrl(routes, '/nope')).toBeNull();
    expect(matchUrl(routes, '/teams/t1/issues/extra')).toBeNull();
  });

  it('percent-decodes param values', () => {
    expect(matchUrl(routes, '/teams/a%2Fb')?.params).toEqual({ teamId: 'a/b' });
    expect(matchUrl(routes, '/teams/hello%20world')?.params).toEqual({ teamId: 'hello world' });
  });

  it('applies schema defaults from every schema in the chain', () => {
    expect(matchUrl(routes, '/teams/t1/issues')?.search).toEqual({
      tab: 'issues',
      q: '',
      page: 1
    });
  });

  it('decodes each search field by type without z.coerce', () => {
    const match = matchUrl(routes, '/teams/t1/issues?q=123&page=4&tab=board');
    // `q` is a z.string(): '123' stays the string it was typed as.
    expect(match?.search).toEqual({ q: '123', page: 4, tab: 'board' });
  });

  it('falls back to defaults for a hand-edited value the schema rejects', () => {
    const match = matchUrl(routes, '/teams/t1/issues?page=banana&tab=nonsense');
    expect(match?.search).toEqual({ q: '', page: 1, tab: 'issues' });
  });

  it('reads the hash without the leading marker', () => {
    expect(matchUrl(routes, '/settings#danger')?.hash).toBe('danger');
    expect(matchUrl(routes, '/settings')?.hash).toBe('');
  });
});

describe('buildUrl', () => {
  it('is the inverse of matchUrl', () => {
    const cases = [
      '/',
      '/settings',
      '/teams/new',
      '/teams/t1',
      '/teams/t1/board',
      '/teams/t1/issues',
      '/teams/t1/issues?page=3',
      '/teams/t1/issues?q=bug',
      '/teams/a%2Fb/issues',
      '/settings#danger'
    ];
    for (const url of cases) {
      const match = matchUrl(routes, url);
      expect(match, url).not.toBeNull();
      const rebuilt = buildUrl(routes, match!.name, {
        params: match!.params,
        search: match!.search,
        hash: match!.hash
      });
      expect(rebuilt, url).toBe(url);
    }
  });

  it('omits search values equal to their schema default', () => {
    expect(buildUrl(routes, 'teams.detail.issues', { params: { teamId: 't1' } })).toBe(
      '/teams/t1/issues'
    );
    expect(
      buildUrl(routes, 'teams.detail.issues', {
        params: { teamId: 't1' },
        search: { q: '', page: 1, tab: 'issues' }
      })
    ).toBe('/teams/t1/issues');
  });

  it('encodes param values that contain path characters', () => {
    expect(buildUrl(routes, 'teams.detail', { params: { teamId: 'a/b' } })).toBe('/teams/a%2Fb');
  });

  it('throws for a programmer error, unlike a bad URL from a user', () => {
    expect(() => buildUrl(routes, 'teams.detail', {})).toThrow(/needs param 'teamId'/);
    expect(() => buildUrl(routes, 'nope', {})).toThrow(/Unknown route 'nope'/);
  });

  it('sorts search keys so the same state always produces the same URL', () => {
    const url = buildUrl(routes, 'teams.detail.issues', {
      params: { teamId: 't1' },
      search: { page: 2, q: 'bug' }
    });
    expect(url).toBe('/teams/t1/issues?page=2&q=bug');
  });
});
