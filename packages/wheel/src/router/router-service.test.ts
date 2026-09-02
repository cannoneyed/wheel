import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Service, ServiceContext, type Defer } from '../core/index';
import { createRouter } from './create-router';
import { memoryHistory } from './history';
import { RouterHistoryService, type RouterService } from './router-service';

const routes = {
  path: '/',
  children: {
    home: { path: '/' },
    teams: {
      path: 'teams',
      children: {
        detail: {
          path: '$teamId',
          search: z.object({ tab: z.enum(['issues', 'board']).default('issues') }),
          children: {
            issues: { path: 'issues', search: z.object({ q: z.string().default('') }) }
          }
        }
      }
    }
  }
} as const;

const router = createRouter(routes);

/** A Defer whose timers only run when the test says so. */
function manualDefer(): { defer: Defer; flush: () => void; pending: () => number } {
  let queue: Array<() => void> = [];
  return {
    defer: {
      schedule(_ms, fn) {
        queue.push(fn);
        return () => {
          queue = queue.filter((entry) => entry !== fn);
        };
      }
    },
    flush() {
      const due = queue;
      queue = [];
      for (const fn of due) fn();
    },
    pending: () => queue.length
  };
}

function setup(entries: string[] = ['/'], defer?: Defer) {
  const history = memoryHistory(entries);
  const context = new ServiceContext({ scopeId: 'router-test', defer });
  context.override(
    RouterHistoryService,
    { history } as unknown as RouterHistoryService,
    { ownership: 'caller' }
  );
  return { context, history, service: context.get(router.Service) };
}

describe('RouterService state', () => {
  it('starts at the history\'s current entry', () => {
    const { service, context } = setup(['/teams/t1/issues']);
    expect(service.url.get()).toBe('/teams/t1/issues');
    expect(service.match()?.name).toBe('teams.detail.issues');
    expect(service.params()).toEqual({ teamId: 't1' });
    expect(service.search()).toEqual({ tab: 'issues', q: '' });
    context.dispose();
  });

  it('derives everything from the url atom — set it and the match follows', () => {
    const { service, context } = setup(['/']);
    service.url.set('/teams/t9');
    expect(service.routeName()).toBe('teams.detail');
    expect(service.params()).toEqual({ teamId: 't9' });
    context.dispose();
  });

  it('reports null for a URL that matches nothing, without throwing', () => {
    const { service, context } = setup(['/nowhere']);
    expect(service.match()).toBeNull();
    expect(service.routeName()).toBeNull();
    expect(service.params()).toEqual({});
    context.dispose();
  });
});

describe('RouterService navigation', () => {
  it('navigate writes the atom and pushes a history entry', () => {
    const { service, history, context } = setup(['/']);
    service.navigate('teams.detail.issues', { params: { teamId: 't1' }, search: { q: 'bug' } });
    expect(service.url.get()).toBe('/teams/t1/issues?q=bug');
    expect(history.read()).toBe('/teams/t1/issues?q=bug');
    context.dispose();
  });

  it('replace: true does not grow the back stack', () => {
    const { service, history, context } = setup(['/']);
    service.navigate('teams.detail', { params: { teamId: 't1' }, replace: true });
    history.back();
    expect(history.read()).toBe('/teams/t1');
    context.dispose();
  });

  it('back and forward flow through the atom into the match', () => {
    const { service, context } = setup(['/']);
    service.navigate('teams.detail', { params: { teamId: 't1' } });
    service.navigate('teams.detail', { params: { teamId: 't2' } });
    service.back();
    expect(service.url.get()).toBe('/teams/t1');
    expect(service.params()).toEqual({ teamId: 't1' });
    service.forward();
    expect(service.params()).toEqual({ teamId: 't2' });
    context.dispose();
  });

  it('href builds without navigating', () => {
    const { service, context } = setup(['/']);
    expect(service.href('teams.detail', { params: { teamId: 't1' } })).toBe('/teams/t1');
    expect(service.url.get()).toBe('/');
    context.dispose();
  });

  it('matchOf narrows to one route and returns null for any other', () => {
    const { service, context } = setup(['/teams/t1/issues']);
    expect(service.matchOf('teams.detail.issues')?.params.teamId).toBe('t1');
    expect(service.matchOf('home')).toBeNull();
    context.dispose();
  });

  it('isActive covers the whole chain, so a section link stays lit', () => {
    const { service, context } = setup(['/teams/t1/issues']);
    createRoot((dispose) => {
      expect(service.isActive('teams')).toBe(true);
      expect(service.isActive('teams.detail')).toBe(true);
      expect(service.isActive('teams.detail.issues')).toBe(true);
      expect(service.isActive('home')).toBe(false);
      dispose();
    });
    context.dispose();
  });
});

describe('searchAtom', () => {
  class FilterService extends Service {
    /** Identity that survives minification (see require-service-name). */
    static override serviceName = 'FilterService';

    private readonly router = this.service(router.Service) as RouterService<typeof routes>;
    readonly query = this.router.searchAtom('q', z.string().default(''));
  }

  it('reads its initial value out of the URL', () => {
    const { context } = setup(['/teams/t1/issues?q=bug']);
    expect(context.get(FilterService).query.get()).toBe('bug');
    context.dispose();
  });

  it('writing the atom updates the url atom immediately', () => {
    const { context, service } = setup(['/teams/t1/issues']);
    context.get(FilterService).query.set('bug');
    expect(service.url.get()).toBe('/teams/t1/issues?q=bug');
    expect(service.search().q).toBe('bug');
    context.dispose();
  });

  it('a value equal to the default is left out of the URL', () => {
    const { context, service } = setup(['/teams/t1/issues?q=bug']);
    context.get(FilterService).query.set('');
    expect(service.url.get()).toBe('/teams/t1/issues');
    context.dispose();
  });

  it('coalesces the address-bar write so typing makes one entry, not forty', () => {
    const timers = manualDefer();
    const { context, history } = setup(['/teams/t1/issues'], timers.defer);
    const filter = context.get(FilterService);
    for (const value of ['b', 'bu', 'bug']) filter.query.set(value);
    expect(history.read()).toBe('/teams/t1/issues');
    expect(timers.pending()).toBe(1);
    timers.flush();
    expect(history.read()).toBe('/teams/t1/issues?q=bug');
    context.dispose();
  });

  it('back writes the URL\'s value into the atom', () => {
    const { context, service, history } = setup(['/teams/t1/issues?q=bug']);
    const filter = context.get(FilterService);
    service.navigate('teams.detail.issues', { params: { teamId: 't1' }, search: { q: 'other' } });
    expect(filter.query.get()).toBe('other');
    history.back();
    expect(filter.query.get()).toBe('bug');
    context.dispose();
  });

  it('rejects two services claiming the same key, naming both sites', () => {
    class OtherFilterService extends Service {
      /** Identity that survives minification (see require-service-name). */
      static override serviceName = 'OtherFilterService';

      private readonly router = this.service(router.Service) as RouterService<typeof routes>;
      readonly query = this.router.searchAtom('q', z.string().default(''));
    }
    const { context } = setup(['/teams/t1/issues']);
    context.get(FilterService);
    expect(() => context.get(OtherFilterService)).toThrow(/Duplicate search key 'q'/);
    context.dispose();
  });
});

describe('observability', () => {
  it('the url atom appears in the debug registry under the router service', () => {
    const { context, service } = setup(['/teams/t1']);
    const snapshot = context.registry.snapshot();
    const url = snapshot.primitives.find(
      (entry) => entry.meta.name === 'url' && entry.meta.serviceName === 'AppRouter'
    );
    expect(url?.meta.kind).toBe('atom');
    expect(url?.value).toBe('/teams/t1');

    service.navigate('home');
    const after = context.registry
      .snapshot()
      .primitives.find((entry) => entry.meta.name === 'url' && entry.meta.serviceName === 'AppRouter');
    expect(after?.value).toBe('/');
    expect(snapshot.services.some((record) => record.name === 'AppRouter')).toBe(true);
    context.dispose();
  });

  it('registers navigate, back, and forward as actions', () => {
    const { context } = setup(['/']);
    const actions = context.registry
      .snapshot()
      .primitives.filter((entry) => entry.meta.kind === 'action' && entry.meta.serviceName === 'AppRouter')
      .map((entry) => entry.meta.name)
      .sort();
    expect(actions).toEqual(['back', 'forward', 'navigate']);
    context.dispose();
  });
});
