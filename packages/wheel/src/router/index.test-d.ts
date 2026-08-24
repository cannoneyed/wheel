/**
 * The router's type-level contract, asserted so it fails loudly.
 *
 * If `PathParams` or `RouteName` breaks, nothing errors at runtime — every
 * route quietly degrades to untyped string params and the whole point of the
 * design is gone. These assertions are the tripwire.
 */
import { expectTypeOf } from 'vitest';
import { z } from 'zod';

import { createRouter } from './create-router';
import type { RouteName, RouteParams, RouteSearchOutput } from './types';

const routes = {
  path: '/',
  children: {
    home: { path: '/' },
    settings: { path: 'settings' },
    teams: {
      path: 'teams',
      children: {
        detail: {
          path: '$teamId',
          search: z.object({ tab: z.enum(['issues', 'board']).default('issues') }),
          children: {
            issue: { path: 'issues/$issueId' }
          }
        }
      }
    }
  }
} as const;

type Routes = typeof routes;

const router = createRouter(routes);
const service = null as unknown as InstanceType<typeof router.Service>;

// Every navigable name, dotted. The root contributes nothing — it is a layout.
expectTypeOf<RouteName<Routes>>().toEqualTypeOf<
  'home' | 'settings' | 'teams' | 'teams.detail' | 'teams.detail.issue'
>();

// Params accumulate down the chain: the leaf needs BOTH ancestors' captures.
expectTypeOf<RouteParams<Routes, 'teams.detail'>>().toEqualTypeOf<{ readonly teamId: string }>();
expectTypeOf<RouteParams<Routes, 'teams.detail.issue'>>().toEqualTypeOf<{
  readonly teamId: string;
  readonly issueId: string;
}>();

// Search schemas merge down the chain and arrive with defaults applied.
expectTypeOf<RouteSearchOutput<Routes, 'teams.detail.issue'>['tab']>().toEqualTypeOf<
  'issues' | 'board'
>();

// A route with no params needs no options object at all.
service.navigate('home');
service.navigate('settings');

// A route with params requires them, and they are strings.
service.navigate('teams.detail', { params: { teamId: 't1' } });
service.navigate('teams.detail.issue', { params: { teamId: 't1', issueId: 'i1' } });
service.navigate('teams.detail', { params: { teamId: 't1' }, search: { tab: 'board' } });

// @ts-expect-error — no such route.
service.navigate('nope');
// @ts-expect-error — `teams.detail` needs `teamId`.
service.navigate('teams.detail');
// @ts-expect-error — `issueId` is missing.
service.navigate('teams.detail.issue', { params: { teamId: 't1' } });
// @ts-expect-error — `tab` only accepts the enum's members.
service.navigate('teams.detail', { params: { teamId: 't1' }, search: { tab: 'nope' } });
// @ts-expect-error — params are strings, not numbers.
service.navigate('teams.detail', { params: { teamId: 1 } });

// matchOf narrows params and search to the named route.
const match = service.matchOf('teams.detail.issue');
expectTypeOf(match?.params.issueId).toEqualTypeOf<string | undefined>();
expectTypeOf(match?.search.tab).toEqualTypeOf<'issues' | 'board' | undefined>();
// @ts-expect-error — this route captured `issueId`, not `wrong`.
void match?.params.wrong;

// href takes the same arguments as navigate.
expectTypeOf(service.href('teams.detail', { params: { teamId: 't1' } })).toEqualTypeOf<string>();
