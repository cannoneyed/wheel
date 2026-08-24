// @vitest-environment jsdom
/**
 * The outlet's persistence contract: a route change remounts ONLY the depths
 * whose node actually changed. Parent layouts (and therefore their providers
 * and services) survive sibling navigation; an index route and a `$param`
 * sibling sharing one component keep that component mounted; param-only
 * changes remount nothing.
 */
import type { JSX } from 'solid-js';
import { onMount } from 'solid-js';
import { render } from 'solid-js/web';
import { beforeAll, describe, expect, it } from 'vitest';

import { ServiceProvider } from '../core/index';
import { createRouter } from './create-router';
import { Outlet } from './outlet';
import { memoryHistoryOverride } from './router-service';

const mounts = { shell: 0, team: 0, issues: 0, settings: 0, detail: 0 };

function Shell(): JSX.Element {
  // imperative boundary: tally real mounts so tests can assert persistence.
  onMount(() => (mounts.shell += 1));
  return (
    <div data-testid="shell">
      <router.Link to="team.issues" params={{ teamId: 't1' }} data-testid="go-issues">
        issues
      </router.Link>
      <router.Link to="team.settings" params={{ teamId: 't1' }} data-testid="go-settings">
        settings
      </router.Link>
      <router.Link to="team.detail" params={{ teamId: 't1', issueId: 'i2' }} data-testid="go-detail">
        detail
      </router.Link>
      <Outlet />
    </div>
  );
}

function TeamLayout(): JSX.Element {
  // imperative boundary: tally real mounts so tests can assert persistence.
  onMount(() => (mounts.team += 1));
  return (
    <div data-testid="team">
      <Outlet />
    </div>
  );
}

function IssuesPage(): JSX.Element {
  // imperative boundary: tally real mounts so tests can assert persistence.
  onMount(() => (mounts.issues += 1));
  return <div data-testid="issues" />;
}

function SettingsPage(): JSX.Element {
  // imperative boundary: tally real mounts so tests can assert persistence.
  onMount(() => (mounts.settings += 1));
  return <div data-testid="settings" />;
}

/** Shared by the index route and the $issueId child — must stay mounted across both. */
function DetailPage(): JSX.Element {
  // imperative boundary: tally real mounts so tests can assert persistence.
  onMount(() => (mounts.detail += 1));
  return <div data-testid="detail" />;
}

const router = createRouter(
  {
    path: '/',
    component: Shell,
    children: {
      team: {
        path: 'teams/$teamId',
        component: TeamLayout,
        children: {
          issues: { path: 'issues', component: IssuesPage },
          settings: { path: 'settings', component: SettingsPage },
          index: { path: 'detail', component: DetailPage },
          detail: { path: 'detail/$issueId', component: DetailPage }
        }
      }
    }
  } as const,
  { name: 'PersistenceRouter' }
);

function mount(entries: string[]) {
  mounts.shell = mounts.team = mounts.issues = mounts.settings = mounts.detail = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const dispose = render(
    () => (
      <ServiceProvider scopeId="persistence" overrides={[memoryHistoryOverride(entries)]}>
        <router.Root />
      </ServiceProvider>
    ),
    host
  );
  return { host, teardown: () => (dispose(), host.remove()) };
}

beforeAll(() => {
  document.addEventListener('click', (event) => event.preventDefault());
});

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('route-chain persistence', () => {
  it('sibling navigation swaps the leaf and keeps every ancestor mounted', () => {
    const { host, teardown } = mount(['/teams/t1/issues']);
    try {
      expect(host.querySelector('[data-testid=issues]')).not.toBeNull();
      expect(mounts).toMatchObject({ shell: 1, team: 1, issues: 1, settings: 0 });

      click(host.querySelector('[data-testid=go-settings]')!);
      expect(host.querySelector('[data-testid=settings]')).not.toBeNull();
      expect(host.querySelector('[data-testid=issues]')).toBeNull();
      // The ancestors did NOT remount.
      expect(mounts).toMatchObject({ shell: 1, team: 1, issues: 1, settings: 1 });

      click(host.querySelector('[data-testid=go-issues]')!);
      expect(mounts).toMatchObject({ shell: 1, team: 1, issues: 2, settings: 1 });
    } finally {
      teardown();
    }
  });

  it('an index route and its $param sibling share one mounted component', () => {
    const { host, teardown } = mount(['/teams/t1/detail']);
    try {
      expect(host.querySelector('[data-testid=detail]')).not.toBeNull();
      expect(mounts.detail).toBe(1);

      click(host.querySelector('[data-testid=go-detail]')!);
      // Same component value at the same depth → no remount.
      expect(host.querySelector('[data-testid=detail]')).not.toBeNull();
      expect(mounts.detail).toBe(1);
    } finally {
      teardown();
    }
  });
});
