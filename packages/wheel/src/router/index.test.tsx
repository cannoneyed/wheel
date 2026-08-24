// @vitest-environment jsdom
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Service, ServiceProvider, componentRoot, connect, view } from '../core/index';
import { createRouter } from './create-router';
import { Outlet } from './outlet';
import { memoryHistoryOverride, type RouterService } from './router-service';

let shellMounts = 0;
let teamLayoutMounts = 0;

function Shell(): JSX.Element {
  shellMounts += 1;
  return (
    <div data-testid="shell">
      <Link to="home">Home</Link>
      <Link to="teams.detail" params={{ teamId: 't1' }} activeClass="on" data-testid="team-link">
        Team one
      </Link>
      <Link to="teams.detail" params={{ teamId: 't2' }} data-testid="team-link-2">
        Team two
      </Link>
      <Outlet />
    </div>
  );
}

function Home(): JSX.Element {
  return <div data-testid="home">home</div>;
}

function TeamLayout(): JSX.Element {
  teamLayoutMounts += 1;
  return (
    <section data-testid="team-layout">
      <Outlet />
    </section>
  );
}

/** The doctrine test: a route component reads its params through connect(), not a hook. */
class TeamTitleService extends Service {
  readonly prefix = this.computed(() => 'Team', 'prefix');
}

const connectTeamPage = connect('TeamPage', (c) => {
  const router = c.service(appRouter.Service) as RouterService<typeof routes>;
  const titles = c.service(TeamTitleService);
  return view({
    prefix: titles.prefix,
    teamId: () => router.matchOf('teams.detail')?.params.teamId ?? '',
    tab: () => router.search().tab as string
  });
});

function TeamPage(): JSX.Element {
  const state = connectTeamPage({});
  return (
    <div use:componentRoot data-testid="team-page">
      {state.prefix} {state.teamId} / {state.tab}
    </div>
  );
}

const routes = {
  path: '/',
  component: Shell,
  children: {
    home: { path: '/', component: Home },
    teams: {
      path: 'teams',
      children: {
        detail: {
          path: '$teamId',
          component: TeamLayout,
          search: z.object({ tab: z.enum(['issues', 'board']).default('issues') }),
          children: {
            index: { path: '/', component: TeamPage }
          }
        }
      }
    }
  }
} as const;

const appRouter = createRouter(routes, { notFound: () => <div data-testid="missing">404</div> });
const Link = appRouter.Link;

function mount(entries: string[]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(
    () => (
      <ServiceProvider scopeId="router-app" overrides={[memoryHistoryOverride(entries)]}>
        <appRouter.Root />
      </ServiceProvider>
    ),
    host
  );
  return {
    host,
    teardown: () => {
      dispose();
      host.remove();
    }
  };
}

let routerPreventedDefault = false;

// A real <a href> whose default is left alone makes jsdom attempt a page
// navigation it cannot perform. This document-level listener runs after the
// anchor's own handler: it records whether the router claimed the click, then
// stops the default so the environment stays quiet.
beforeAll(() => {
  document.addEventListener('click', (event) => {
    routerPreventedDefault = event.defaultPrevented;
    event.preventDefault();
  });
});

function click(element: Element, init: MouseEventInit = {}): boolean {
  routerPreventedDefault = false;
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
  return routerPreventedDefault;
}

describe('router rendering', () => {
  it('renders the matched chain through nested outlets', () => {
    const { host, teardown } = mount(['/teams/t1']);
    expect(host.querySelector('[data-testid=shell]')).not.toBeNull();
    expect(host.querySelector('[data-testid=team-layout]')).not.toBeNull();
    expect(host.querySelector('[data-testid=team-page]')?.textContent).toContain('Team t1 / issues');
    expect(host.querySelector('[data-testid=home]')).toBeNull();
    teardown();
  });

  it('renders the index child at the root path', () => {
    const { host, teardown } = mount(['/']);
    expect(host.querySelector('[data-testid=home]')).not.toBeNull();
    teardown();
  });

  it('renders the not-found component for an unmatched URL', () => {
    const { host, teardown } = mount(['/nowhere']);
    expect(host.querySelector('[data-testid=missing]')).not.toBeNull();
    expect(host.querySelector('[data-testid=shell]')).toBeNull();
    teardown();
  });

  it('keeps layouts mounted across a param change', () => {
    shellMounts = 0;
    teamLayoutMounts = 0;
    const { host, teardown } = mount(['/teams/t1']);
    expect(teamLayoutMounts).toBe(1);
    click(host.querySelector('[data-testid=team-link-2]')!);
    expect(host.querySelector('[data-testid=team-page]')?.textContent).toContain('Team t2');
    // Same route, different params: no remount of the shell or the layout.
    expect(shellMounts).toBe(1);
    expect(teamLayoutMounts).toBe(1);
    teardown();
  });
});

describe('Link', () => {
  it('renders a real href so the browser features work', () => {
    const { host, teardown } = mount(['/']);
    const link = host.querySelector('[data-testid=team-link]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/teams/t1');
    teardown();
  });

  it('navigates on a plain left click, claiming the default action', () => {
    const { host, teardown } = mount(['/']);
    expect(click(host.querySelector('[data-testid=team-link]')!)).toBe(true);
    expect(host.querySelector('[data-testid=team-page]')).not.toBeNull();
    teardown();
  });

  it('leaves modified clicks to the browser', () => {
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const { host, teardown } = mount(['/']);
      const label = JSON.stringify(init);
      expect(click(host.querySelector('[data-testid=team-link]')!, init), label).toBe(false);
      expect(host.querySelector('[data-testid=home]'), label).not.toBeNull();
      teardown();
    }
  });

  it('marks the active link for styling and for assistive tech', () => {
    const { host, teardown } = mount(['/teams/t1']);
    const link = host.querySelector('[data-testid=team-link]')!;
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.className).toContain('on');
    teardown();
  });

  it('drops the active marker once the route changes', () => {
    const { host, teardown } = mount(['/']);
    const link = host.querySelector('[data-testid=team-link]')!;
    expect(link.getAttribute('aria-current')).toBeNull();
    teardown();
  });
});
