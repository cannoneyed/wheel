/**
 * The router's browser contract, exercised against a real address bar.
 *
 * Everything here needs a browser to be honest about: `history.pushState`,
 * back and forward, anchor semantics, and what a COLD LOAD of a deep URL does
 * (which is also the test that the SPA fallback is configured).
 */
import { expect, test, type Page } from '@playwright/test';

const stateUrl = (page: Page) => page.getByTestId('state-url');
const stateName = (page: Page) => page.getByTestId('state-name');
const stateParams = (page: Page) => page.getByTestId('state-params');
const stateSearch = (page: Page) => page.getByTestId('state-search');

test.describe('shell navigation', () => {
  // behavior: SHELL-01 (also SHELL-02: the sidebar hop)
  test('boots at the index route and navigates through the sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();

    await page.getByTestId('nav-routing').click();
    await expect(page).toHaveURL('/routing');
    await expect(page.getByTestId('routing-demo')).toBeVisible();
    await expect(page.getByTestId('overview-page')).toBeVisible();
  });

  // behavior: SHELL-02
  test('renders a real href, so the browser owns its own features', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nav-routing')).toHaveAttribute('href', '/routing');
  });

  // behavior: ROUTING-02 (the Link active-marking contract, asserted on the shell's nav)
  test('marks the active link for CSS and for assistive tech', async ({ page }) => {
    await page.goto('/routing');
    await expect(page.getByTestId('nav-routing')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-routing')).toHaveClass(/active/);
    await expect(page.getByTestId('nav-todos')).not.toHaveAttribute('aria-current', 'page');
  });

  // behavior: ROUTING-03
  test('leaves a modified click to the browser', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('nav-todos').click({ modifiers: ['ControlOrMeta'] });
    // The router did not intercept, so this tab stayed where it was.
    await expect(page).toHaveURL('/routing');
  });
});

test.describe('nested routes and path params', () => {
  // behavior: ROUTING-04 (also SHELL-03: the cold load proves the SPA fallback)
  test('cold-loads a deep URL and renders the whole chain', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    await expect(page.getByTestId('routing-demo')).toBeVisible();
    await expect(page.getByTestId('team-page')).toBeVisible();
    await expect(page.getByTestId('issues-page')).toBeVisible();
    await expect(page.getByTestId('team-name')).toHaveText('Core');
    await expect(stateName(page)).toHaveText('routing.team.issues');
    await expect(stateParams(page)).toHaveText('{"teamId":"core"}');
  });

  // behavior: ROUTING-05
  test('a layout reads its own param even though a child matched', async ({ page }) => {
    await page.goto('/routing/teams/design/board');
    await expect(page.getByTestId('team-name')).toHaveText('Design');
    await expect(page.getByTestId('board-page')).toBeVisible();
    await expect(stateName(page)).toHaveText('routing.team.board');
  });

  // behavior: ROUTING-06
  test('keeps the layout mounted across a param change', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    const filter = page.getByTestId('issue-filter');
    // Local DOM state survives only if the node is not remounted.
    await filter.fill('router');
    await expect(page.getByTestId('issue-rows')).toContainText('Router keeps layouts mounted');

    await page.getByTestId('nav-team-design').click();
    await expect(page.getByTestId('team-name')).toHaveText('Design');
    await expect(page.getByTestId('routing-demo')).toBeVisible();
  });

  // behavior: ROUTING-07 (also ROUTING-32: the detail's title)
  test('binds two params at once for a nested detail route', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    await page.getByTestId('issue-link-c-1').click();
    await expect(page).toHaveURL('/routing/teams/core/issues/c-1');
    await expect(page.getByTestId('issue-title')).toHaveText('Router keeps layouts mounted');
    await expect(stateParams(page)).toHaveText('{"teamId":"core","issueId":"c-1"}');

    await page.getByTestId('issue-back-to-list').click();
    await expect(page).toHaveURL('/routing/teams/core/issues');
  });

  // behavior: ROUTING-08
  test('prefers the more specific route when two could match', async ({ page }) => {
    // `issues` and `issues/$issueId` are siblings; segment count decides.
    await page.goto('/routing/teams/core/issues');
    await expect(stateName(page)).toHaveText('routing.team.issues');
    await page.goto('/routing/teams/core/issues/c-2');
    await expect(stateName(page)).toHaveText('routing.team.issue');
  });

  // behavior: ROUTING-09
  test('renders the page\'s own missing-data view for an unknown id', async ({ page }) => {
    await page.goto('/routing/teams/core/issues/nope');
    await expect(page.getByTestId('issue-missing')).toBeVisible();
    await expect(page.getByTestId('not-found')).toHaveCount(0);
  });
});

test.describe('typed search params', () => {
  // behavior: ROUTING-11
  test('a search param drives the view and the URL together', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    await page.getByTestId('status-done').click();
    await expect(page).toHaveURL('/routing/teams/core/issues?status=done');
    await expect(page.getByTestId('issue-rows')).toContainText('Back button restores filters');
    await expect(page.getByTestId('issue-rows')).not.toContainText('Search params validate');
    await expect(stateSearch(page)).toContainText('"status":"done"');
  });

  // behavior: ROUTING-12
  test('the schema default is left out of the URL', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?status=done');
    await page.getByTestId('status-all').click();
    await expect(page).toHaveURL('/routing/teams/core/issues');
    await expect(stateSearch(page)).toContainText('"status":"all"');
  });

  // behavior: ROUTING-13
  test('a hand-edited value the schema rejects falls back instead of crashing', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?status=banana');
    await expect(page.getByTestId('issues-page')).toBeVisible();
    await expect(stateSearch(page)).toContainText('"status":"all"');
  });

  // behavior: ROUTING-14
  test('a search param set through a Link survives the click', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('overview-design-done').click();
    await expect(page).toHaveURL('/routing/teams/design/issues?status=done');
    await expect(page.getByTestId('issue-rows')).toContainText('Not-found page copy');
  });

  // behavior: ROUTING-15 (also ROUTING-16: the board renders)
  test('search params carry across sibling routes that share the layout', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?status=done');
    await page.getByTestId('tab-board').click();
    await expect(page).toHaveURL('/routing/teams/core/board?status=done');
    await expect(page.getByTestId('board-page')).toBeVisible();
  });
});

test.describe('URL-backed atoms (searchAtom)', () => {
  // behavior: ROUTING-17
  test('typing filters the list and writes the URL', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    await page.getByTestId('issue-filter').fill('zod');
    await expect(page.getByTestId('issue-rows')).toContainText('Search params validate with Zod');
    await expect(page.getByTestId('issue-rows')).not.toContainText('Router keeps layouts');
    await expect(page).toHaveURL('/routing/teams/core/issues?q=zod');
    await expect(stateUrl(page)).toHaveText('/routing/teams/core/issues?q=zod');
  });

  // behavior: ROUTING-18
  test('a typed word adds NO history entries, not one per keystroke', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('nav-team-core').click();
    await expect(page).toHaveURL('/routing/teams/core/issues');

    await page.getByTestId('issue-filter').pressSequentially('filters', { delay: 20 });
    await expect(page).toHaveURL('/routing/teams/core/issues?q=filters');

    // The filter writes with replaceState, so ONE back leaves the list
    // entirely. Seven keystrokes leaving seven entries would strand the user
    // pressing back through `f`, `fi`, `fil`, …
    await page.goBack();
    await expect(page).toHaveURL('/routing');
  });

  // behavior: ROUTING-19
  test('the filter is a shareable link — a cold load restores it', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?q=badge');
    await expect(page.getByTestId('issue-filter')).toHaveValue('badge');
    await expect(page.getByTestId('issues-empty')).toBeVisible();
  });

  // behavior: ROUTING-20
  test('an empty filter is left out of the URL', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?q=zod');
    await page.getByTestId('issue-filter').fill('');
    await expect(page).toHaveURL('/routing/teams/core/issues');
  });

  // behavior: ROUTING-21
  test('the text filter and the typed status filter compose', async ({ page }) => {
    await page.goto('/routing/teams/core/issues?status=open');
    await page.getByTestId('issue-filter').fill('router');
    await expect(page).toHaveURL('/routing/teams/core/issues?q=router&status=open');
    await expect(page.getByTestId('issue-rows')).toContainText('Router keeps layouts mounted');
  });
});

test.describe('history', () => {
  // behavior: ROUTING-22
  test('the in-app back and forward buttons move through entries', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('nav-team-core').click();
    await expect(page).toHaveURL('/routing/teams/core/issues');
    await page.getByTestId('nav-team-design').click();
    await expect(page).toHaveURL('/routing/teams/design/issues');

    await page.getByTestId('history-back').click();
    await expect(page).toHaveURL('/routing/teams/core/issues');
    await page.getByTestId('history-forward').click();
    await expect(page).toHaveURL('/routing/teams/design/issues');
  });

  // behavior: ROUTING-23
  test('the browser\'s own back button restores the previous filter', async ({ page }) => {
    await page.goto('/routing/teams/core/issues');
    await page.getByTestId('status-open').click();
    await expect(page).toHaveURL('/routing/teams/core/issues?status=open');
    await page.getByTestId('status-done').click();
    await expect(page).toHaveURL('/routing/teams/core/issues?status=done');

    await page.goBack();
    await expect(page).toHaveURL('/routing/teams/core/issues?status=open');
    await expect(page.getByTestId('status-open')).toHaveClass(/active/);
    await page.goForward();
    await expect(page).toHaveURL('/routing/teams/core/issues?status=done');
  });

  // behavior: ROUTING-24
  test('a reload keeps the exact view', async ({ page }) => {
    await page.goto('/routing/teams/design/issues?status=done&q=copy');
    await expect(page.getByTestId('issue-rows')).toContainText('Not-found page copy');
    await page.reload();
    await expect(page.getByTestId('issue-filter')).toHaveValue('copy');
    await expect(page.getByTestId('issue-rows')).toContainText('Not-found page copy');
  });
});

test.describe('not found', () => {
  // behavior: ROUTING-25
  test('a cold load of an unmatched URL renders the not-found page', async ({ page }) => {
    await page.goto('/routing/does-not-exist');
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(page.getByTestId('routing-demo')).toHaveCount(0);
  });

  // behavior: ROUTING-26
  test('a plain anchor to an unmatched URL works, proving the SPA fallback', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('nav-broken').click();
    await expect(page).toHaveURL('/routing/does-not-exist');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });

  // behavior: SHELL-03
  test('the not-found page links back into the app', async ({ page }) => {
    await page.goto('/nope/nope');
    await page.getByTestId('not-found-home').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
  });
});

test.describe('observability', () => {
  // behavior: ROUTING-31
  test('the state panel tracks url, route, chain, params, and search live', async ({ page }) => {
    await page.goto('/routing');
    await expect(stateUrl(page)).toHaveText('/routing');
    await expect(stateName(page)).toHaveText('routing.overview');
    await expect(page.getByTestId('state-chain')).toHaveText('routing › routing.overview');

    await page.getByTestId('nav-team-core').click();
    await expect(stateUrl(page)).toHaveText('/routing/teams/core/issues');
    await expect(page.getByTestId('state-chain')).toHaveText(
      'routing › routing.team › routing.team.issues'
    );
    await expect(stateParams(page)).toHaveText('{"teamId":"core"}');
  });
});

test.describe('the sync demos still mount under the router', () => {
  // behavior: SHELL-03
  test('routing to a sync demo boots its client', async ({ page }) => {
    await page.goto('/todos');
    await expect(page.getByTestId('sync-badge')).toContainText('connected', { timeout: 20_000 });
  });
});

test.describe('the home page', () => {
  // behavior: SHELL-01
  test('shows one card per demo, each a real link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-card-todos')).toHaveAttribute('href', '/todos');
    await expect(page.getByTestId('home-card-routing')).toHaveAttribute('href', '/routing');
    for (const demo of ['todos', 'kanban', 'editor', 'sheet', 'graph', 'sequencer', 'routing', 'framing']) {
      await expect(page.getByTestId(`home-card-${demo}`)).toBeVisible();
    }
  });

  // behavior: SHELL-02
  test('a card navigates without a page load', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('home-card-kanban').click();
    await expect(page).toHaveURL('/kanban');
    await expect(page.getByTestId('sync-badge')).toBeVisible();
  });
});

test.describe('a broken page cannot break the app', () => {
  // behavior: ROUTING-27
  test('contains the failure and keeps every surrounding control alive', async ({ page }) => {
    await page.goto('/routing');
    await page.getByTestId('nav-crash').click();

    await expect(page.getByTestId('route-error')).toBeVisible();
    await expect(page.getByTestId('route-error-message')).toContainText('CrashService');
    // The containment claim, made concrete: the shell, the demo nav, and the
    // history controls are all still on screen and still work.
    await expect(page.getByTestId('nav-todos')).toBeVisible();
    await expect(page.getByTestId('routing-demo')).toBeVisible();
    await expect(page.getByTestId('history-back')).toBeVisible();
  });

  // behavior: ROUTING-28
  test('recovers the moment you navigate away', async ({ page }) => {
    await page.goto('/routing/crash');
    await expect(page.getByTestId('route-error')).toBeVisible();

    await page.getByTestId('nav-overview').click();
    await expect(page).toHaveURL('/routing');
    await expect(page.getByTestId('route-error')).toHaveCount(0);
    await expect(page.getByTestId('overview-page')).toBeVisible();
  });

  // behavior: ROUTING-29
  test('survives a cold load straight onto the broken URL', async ({ page }) => {
    await page.goto('/routing/crash');
    await expect(page.getByTestId('route-error')).toBeVisible();

    await page.getByTestId('route-error-home').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
  });
});
