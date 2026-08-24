/**
 * Routing behaviors (specs/routing.md), recorded, against both hosts.
 *
 * The routing demo has NO sync backend — its data is two local atoms — so
 * nothing resets between behaviors and there is no in-flight state to settle.
 * What the second host DOES add here is the deployment base: the embedded build
 * mounts at `/demos/`, so every URL assertion is written against
 * `host.origin + host.prefix`, and the not-found anchor has to be base-aware to
 * land on the app's 404 instead of the website's.
 *
 * `router.spec.ts` covers most of these rows standalone, in more depth. The
 * value of the versions here is the embedded host: the same behavior, one
 * `basedHistory` layer down.
 *
 * Note the panel's `url` readout is the router's OWN url — base stripped — so
 * it reads `/routing/...` on both hosts while the address bar differs.
 */
import type { Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

const stateUrl = (page: Page) => page.getByTestId('state-url');
const stateName = (page: Page) => page.getByTestId('state-name');
const stateParams = (page: Page) => page.getByTestId('state-params');
const stateSearch = (page: Page) => page.getByTestId('state-search');
const issueRows = (page: Page) => page.getByTestId('issue-rows');

/** The address-bar URL a demo path has on THIS host (the embed adds `/demos`). */
const at = (b: BehaviorContext, path: string): string => `${b.host.origin}${b.host.prefix}${path}`;

/** Load a routing-demo URL and wait for the demo layout to mount. */
async function openRoutingAt(b: BehaviorContext, path: string): Promise<void> {
  await b.goto(path);
  await expect(b.page.getByTestId('routing-demo')).toBeVisible({ timeout: 20_000 });
}

/** Open the routing demo at its index route. */
async function openRouting(b: BehaviorContext): Promise<void> {
  await openRoutingAt(b, '/routing');
}

// behavior: ROUTING-01
behavior(
  'ROUTING-01',
  'the demo layout renders its nav, history buttons, state panel, and the overview index',
  async (b) => {
    await openRouting(b);
    await expect(b.page.getByTestId('overview-page')).toBeVisible();
    await expect(b.page.getByTestId('nav-overview')).toBeVisible();
    await expect(b.page.getByTestId('nav-team-core')).toBeVisible();
    await expect(b.page.getByTestId('nav-team-design')).toBeVisible();
    await expect(b.page.getByTestId('history-back')).toBeVisible();
    await expect(b.page.getByTestId('history-forward')).toBeVisible();
    await expect(b.page.getByTestId('router-state')).toBeVisible();
    await expect(stateName(b.page)).toHaveText('routing.overview');
  },
  { smoke: true }
);

// behavior: ROUTING-02
behavior('ROUTING-02', 'the active demo link is marked and the mark follows navigation', async (b) => {
  await openRouting(b);
  await expect(b.page.getByTestId('nav-overview')).toHaveAttribute('aria-current', 'page');
  await expect(b.page.getByTestId('nav-overview')).toHaveClass(/active/);
  await expect(b.page.getByTestId('nav-team-core')).not.toHaveAttribute('aria-current', 'page');

  await b.click('open the Core team', b.page.getByTestId('nav-team-core'));
  await expect(b.page.getByTestId('nav-team-core')).toHaveAttribute('aria-current', 'page');
  await expect(b.page.getByTestId('nav-overview')).not.toHaveAttribute('aria-current', 'page');
});

// behavior: ROUTING-04
behavior('ROUTING-04', 'a cold load of a deep URL renders the whole chain with its param', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  await expect(b.page.getByTestId('team-page')).toBeVisible();
  await expect(b.page.getByTestId('issues-page')).toBeVisible();
  await expect(b.page.getByTestId('team-name')).toHaveText('Core');
  await expect(stateName(b.page)).toHaveText('routing.team.issues');
  await expect(stateParams(b.page)).toHaveText('{"teamId":"core"}');
});

// behavior: ROUTING-06
behavior('ROUTING-06', 'switching teams swaps only the leaf and keeps the layouts mounted', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  // Local DOM state in the leaf proves nothing above it remounted.
  await b.fill('filter the issues', b.page.getByTestId('issue-filter'), 'router');
  await expect(issueRows(b.page)).toContainText('Router keeps layouts mounted');

  await b.click('switch to the Design team', b.page.getByTestId('nav-team-design'));
  await expect(b.page.getByTestId('team-name')).toHaveText('Design');
  await expect(b.page.getByTestId('routing-demo')).toBeVisible();
  await expect(b.page.getByTestId('team-page')).toBeVisible();
  await expect(b.page.getByTestId('issues-page')).toBeVisible();
});

// behavior: ROUTING-07
behavior('ROUTING-07', 'the detail route binds two params and links back to its list', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  await b.click('open issue c-1', b.page.getByTestId('issue-link-c-1'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues/c-1'));
  await expect(b.page.getByTestId('issue-title')).toHaveText('Router keeps layouts mounted');
  await expect(b.page.getByTestId('issue-status')).toContainText('open');
  await expect(stateName(b.page)).toHaveText('routing.team.issue');
  await expect(stateParams(b.page)).toHaveText('{"teamId":"core","issueId":"c-1"}');

  await b.click('back to the list', b.page.getByTestId('issue-back-to-list'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues'));
});

// behavior: ROUTING-11
behavior('ROUTING-11', 'the status buttons drive the list, the URL, and the parsed search', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  await b.click('show done issues', b.page.getByTestId('status-done'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?status=done'));
  await expect(issueRows(b.page)).toContainText('Back button restores filters');
  await expect(issueRows(b.page)).not.toContainText('Search params validate');
  await expect(stateSearch(b.page)).toContainText('"status":"done"');
});

// behavior: ROUTING-17
behavior('ROUTING-17', 'typing in the filter narrows the list and writes ?q= into the URL', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  await b.fill('filter for "zod"', b.page.getByTestId('issue-filter'), 'zod');
  await expect(issueRows(b.page)).toContainText('Search params validate with Zod');
  await expect(issueRows(b.page)).not.toContainText('Router keeps layouts');
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?q=zod'));
  // The panel prints the router's url, base stripped — same on both hosts.
  await expect(stateUrl(b.page)).toHaveText('/routing/teams/core/issues?q=zod');
});

// behavior: ROUTING-22
behavior('ROUTING-22', 'the layout\'s own back and forward buttons walk history', async (b) => {
  await openRouting(b);
  await b.click('open the Core team', b.page.getByTestId('nav-team-core'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues'));
  await b.click('open the Design team', b.page.getByTestId('nav-team-design'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/design/issues'));

  await b.click('history back', b.page.getByTestId('history-back'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues'));
  await b.click('history forward', b.page.getByTestId('history-forward'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/design/issues'));
});

// behavior: ROUTING-23
behavior('ROUTING-23', 'the browser\'s back and forward restore the previous filter', async (b) => {
  await openRoutingAt(b, '/routing/teams/core/issues');
  await b.click('show open issues', b.page.getByTestId('status-open'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?status=open'));
  await b.click('show done issues', b.page.getByTestId('status-done'));
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?status=done'));

  // Browser chrome, not the app: goBack/goForward are not instrumented actions,
  // so these two steps do not appear in the recorded timeline.
  await b.page.goBack();
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?status=open'));
  await expect(b.page.getByTestId('status-open')).toHaveClass(/active/);
  await b.page.goForward();
  await expect(b.page).toHaveURL(at(b, '/routing/teams/core/issues?status=done'));
  await expect(b.page.getByTestId('status-done')).toHaveClass(/active/);
});

// behavior: ROUTING-26
behavior('ROUTING-26', 'the broken link reloads onto an unmatched URL and gets the app 404', async (b) => {
  await openRouting(b);
  // Base-aware href: on the embedded host this must stay inside /demos, or the
  // website's index answers instead of the demo app's not-found page.
  await expect(b.page.getByTestId('nav-broken')).toHaveAttribute(
    'href',
    `${b.host.prefix}/routing/does-not-exist`
  );
  await b.click('follow the broken link', b.page.getByTestId('nav-broken'));
  await expect(b.page).toHaveURL(at(b, '/routing/does-not-exist'));
  await expect(b.page.getByTestId('not-found')).toBeVisible({ timeout: 20_000 });
  await expect(b.page.getByTestId('routing-demo')).toHaveCount(0);
});

// behavior: ROUTING-27
behavior('ROUTING-27', 'the broken page fails inside its own pane and nothing around it dies', async (b) => {
  await openRouting(b);
  await b.click('open the broken page', b.page.getByTestId('nav-crash'));
  await expect(b.page.getByTestId('route-error')).toBeVisible();
  await expect(b.page.getByTestId('route-error-message')).toContainText('CrashService');
  // The containment claim, made concrete.
  await expect(b.page.getByTestId('nav-todos')).toBeVisible();
  await expect(b.page.getByTestId('routing-demo')).toBeVisible();
  await expect(b.page.getByTestId('history-back')).toBeVisible();
});

// behavior: ROUTING-28
behavior('ROUTING-28', 'navigating away from the broken page recovers the app', async (b) => {
  await openRoutingAt(b, '/routing/crash');
  await expect(b.page.getByTestId('route-error')).toBeVisible();

  await b.click('go back to the overview', b.page.getByTestId('nav-overview'));
  await expect(b.page).toHaveURL(at(b, '/routing'));
  await expect(b.page.getByTestId('route-error')).toHaveCount(0);
  await expect(b.page.getByTestId('overview-page')).toBeVisible();
});

// behavior: ROUTING-31
behavior('ROUTING-31', 'the state panel tracks url, route, chain, and params live', async (b) => {
  await openRouting(b);
  await expect(stateUrl(b.page)).toHaveText('/routing');
  await expect(stateName(b.page)).toHaveText('routing.overview');
  await expect(b.page.getByTestId('state-chain')).toHaveText('routing › routing.overview');

  await b.click('open the Core team', b.page.getByTestId('nav-team-core'));
  await expect(stateUrl(b.page)).toHaveText('/routing/teams/core/issues');
  await expect(b.page.getByTestId('state-chain')).toHaveText(
    'routing › routing.team › routing.team.issues'
  );
  await expect(stateParams(b.page)).toHaveText('{"teamId":"core"}');
});

// behavior: ROUTING-10
behavior('ROUTING-10', 'an unknown team id renders the team layout missing view', async (b) => {
  await openRoutingAt(b, '/routing/teams/definitely-not-a-team');
  await expect(b.page.getByTestId('team-missing')).toBeVisible();
});

// behavior: ROUTING-30
behavior('ROUTING-30', 'the error fallback retry re-renders the same broken route', async (b) => {
  await openRouting(b);
  await b.click('open the broken page', b.page.getByTestId('nav-crash'));
  await expect(b.page.getByTestId('route-error')).toBeVisible();
  // The crash page is deterministically broken: Retry re-renders the route,
  // it throws again, and the fallback comes back instead of a blank page.
  await b.click('retry the broken route', b.page.getByTestId('route-error-retry'));
  await expect(b.page.getByTestId('route-error')).toBeVisible();
  await expect(b.page.getByTestId('route-error-retry')).toBeVisible();
});
