/**
 * Shell behaviors (specs/shell.md), recorded, against both hosts.
 *
 * The subject is the app AROUND the demos: home page, sidebar, the shared
 * demo header (title + latency selector + sync badge), the sync toasts, the
 * debug panel, and the two whole-tree fallbacks. Two rules this file follows:
 *  1. One behavior() call per spec row, instrumented actions only.
 *  2. BEHAVIORS OWN THEIR FIXTURES: SHELL ids are not a sync demo, so the
 *     harness does NOT reset the standalone engine before these tests. Any
 *     behavior that mutates creates a uniquely-named todo and never reads seed
 *     rows or counts.
 *
 * Host-relative URLs: the embedded host mounts the app at /demos, so an
 * address-bar assertion is always `${b.host.origin}${b.host.prefix}<path>`.
 * `<Link>` hrefs carry the same prefix (the history seam externalizes them),
 * so href assertions use `${b.host.prefix}<path>` too.
 */
import type { Page } from '@playwright/test';
import { wheelDriver } from 'wheel/testing';

import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

const badge = (page: Page) => page.getByTestId('sync-badge');
const toasts = (page: Page) => page.getByTestId('wheel-toast-stack');
const todoInput = (page: Page) => page.getByPlaceholder('Add a todo… (press n)');

/**
 * The shared header's latency `<select>`. Its own class is a hashed CSS
 * module name, so the stable hook is the global `.demo-header` row.
 */
const latencySelect = (page: Page) => page.locator('.demo-header select');

/** The address-bar URL a path has on the host currently under test. */
const urlOn = (b: BehaviorContext, path: string) => `${b.host.origin}${b.host.prefix}${path}`;

/** Open the home page and wait for it to paint. */
async function openHome(b: BehaviorContext): Promise<void> {
  await b.goto('/');
  await expect(b.page.getByTestId('home-page')).toBeVisible({ timeout: 20_000 });
}

/** Open any in-shell path and wait for the sidebar to hydrate. */
async function openShellPath(b: BehaviorContext, path: string): Promise<void> {
  await b.goto(path);
  await expect(b.page.getByTestId('nav-home')).toBeVisible({ timeout: 20_000 });
}

/**
 * Open a sync demo and wait for its client to report `connected` — the
 * hydration point for anything that touches the badge, toasts, or a mutation.
 * (The embedded host boots WASM SQLite in a worker on first load.)
 */
async function openTodos(b: BehaviorContext, path = '/todos'): Promise<void> {
  await b.goto(path);
  await expect(badge(b.page)).toContainText('connected', { timeout: 20_000 });
  await expect(todoInput(b.page)).toBeVisible();
}

/**
 * Set the tab's simulated round-trip latency.
 *
 * RAW playwright: BehaviorContext has no instrumented `selectOption`, so this
 * step does not appear in the recorded timeline.
 */
async function setLatency(b: BehaviorContext, ms: number): Promise<void> {
  await latencySelect(b.page).selectOption(String(ms));
  await expect(latencySelect(b.page)).toHaveValue(String(ms));
}

/** Add a uniquely-named todo and return its title. Does NOT wait for the confirm. */
async function addTodo(b: BehaviorContext, label: string): Promise<string> {
  const title = `${label} ${Math.random().toString(36).slice(2, 8)}`;
  await b.fill(`type todo "${title}"`, todoInput(b.page), title);
  await b.press('submit todo', todoInput(b.page), 'Enter');
  return title;
}

// behavior: SHELL-01
behavior(
  'SHELL-01',
  'the home page renders with the demo navigation',
  async (b) => {
    await openHome(b);
    await expect(b.page.getByRole('heading', { name: 'wheel demos' })).toBeVisible();
    await expect(b.page.getByTestId('nav-home')).toBeVisible();
    for (const demo of ['todos', 'kanban', 'editor', 'sheet', 'graph', 'sequencer', 'routing', 'framing']) {
      await expect(b.page.getByTestId(`nav-${demo}`)).toBeVisible();
    }
  },
  { smoke: true }
);

// behavior: SHELL-02
behavior('SHELL-02', 'the sidebar renders real hrefs and routes between demos', async (b) => {
  await openHome(b);
  // A real anchor with a real href, so the browser owns cmd-click, middle
  // click, and "copy link address" without the component knowing about them.
  // The href carries the host's mount prefix (history externalizes it), so a
  // copied link is a working cold-load entry point on either host.
  await expect(b.page.getByTestId('nav-kanban')).toHaveAttribute('href', `${b.host.prefix}/kanban`);
  await expect(b.page.getByTestId('nav-routing')).toHaveAttribute('href', `${b.host.prefix}/routing`);

  await b.click('open Kanban from the sidebar', b.page.getByTestId('nav-kanban'));
  await expect(b.page).toHaveURL(urlOn(b, '/kanban'));
  await expect(badge(b.page)).toBeVisible();

  await b.click('open Routing from the sidebar', b.page.getByTestId('nav-routing'));
  await expect(b.page).toHaveURL(urlOn(b, '/routing'));
  await expect(b.page.getByTestId('routing-demo')).toBeVisible();
});

// behavior: SHELL-03
behavior('SHELL-03', 'a cold load of a deep URL survives the SPA fallback', async (b) => {
  // Nothing navigated here: the host served index.html for a path it has no
  // file for, and the router rebuilt the whole chain from the URL alone.
  await openShellPath(b, '/routing/teams/core/issues');
  await expect(b.page.getByTestId('routing-demo')).toBeVisible();
  await expect(b.page.getByTestId('team-page')).toBeVisible();
  await expect(b.page.getByTestId('issues-page')).toBeVisible();
  await expect(b.page.getByTestId('team-name')).toHaveText('Core');
  await expect(b.page.getByTestId('state-name')).toHaveText('routing.team.issues');
});

// behavior: SHELL-04
behavior('SHELL-04', 'the sidebar lists every demo and the brand returns home', async (b) => {
  await openShellPath(b, '/sheet');
  // Brand + eight demos, and nothing else in the nav.
  await expect(b.page.locator('nav.sidebar a')).toHaveCount(9);
  await b.click('click the brand', b.page.getByTestId('nav-home'));
  await expect(b.page).toHaveURL(urlOn(b, '/'));
  await expect(b.page.getByTestId('home-page')).toBeVisible();
});

// behavior: SHELL-05
behavior('SHELL-05', 'the active sidebar link is marked for CSS and for assistive tech', async (b) => {
  await openShellPath(b, '/editor');
  await expect(b.page.getByTestId('nav-editor')).toHaveAttribute('aria-current', 'page');
  await expect(b.page.getByTestId('nav-editor')).toHaveClass(/active/);
  await expect(b.page.getByTestId('nav-todos')).not.toHaveAttribute('aria-current', 'page');

  // The mark follows the navigation; exactly one link is lit at a time.
  await b.click('open Todos from the sidebar', b.page.getByTestId('nav-todos'));
  await expect(b.page.getByTestId('nav-todos')).toHaveAttribute('aria-current', 'page');
  await expect(b.page.getByTestId('nav-editor')).not.toHaveAttribute('aria-current', 'page');
});

// behavior: SHELL-06
behavior('SHELL-06', 'the home page shows one card per demo and a card routes into it', async (b) => {
  await openHome(b);
  for (const demo of ['todos', 'kanban', 'editor', 'sheet', 'graph', 'sequencer', 'routing', 'framing']) {
    await expect(b.page.getByTestId(`home-card-${demo}`)).toBeVisible();
  }
  await expect(b.page.getByTestId('home-card-todos')).toHaveAttribute('href', `${b.host.prefix}/todos`);
  // The routing card points at the section's index route, not at a child.
  await expect(b.page.getByTestId('home-card-routing')).toHaveAttribute('href', `${b.host.prefix}/routing`);

  await b.click('open the Kanban card', b.page.getByTestId('home-card-kanban'));
  await expect(b.page).toHaveURL(urlOn(b, '/kanban'));
  await expect(badge(b.page)).toBeVisible();
});

// behavior: SHELL-07
behavior('SHELL-07', 'moving between demos never reloads the document', async (b) => {
  await openHome(b);
  // Every full document load fires `load`. The first one already happened
  // above; from here a client-side route change must fire none.
  let loads = 0;
  b.page.on('load', () => {
    loads += 1;
  });

  await b.click('open Todos', b.page.getByTestId('nav-todos'));
  await expect(b.page).toHaveURL(urlOn(b, '/todos'));
  await b.click('open Framing', b.page.getByTestId('nav-framing'));
  await expect(b.page.getByTestId('framing-demo')).toBeVisible();
  await b.click('open Todos again', b.page.getByTestId('nav-todos'));
  await expect(todoInput(b.page)).toBeVisible();

  expect(loads).toBe(0);
  // The shell itself is what stayed mounted across all three.
  await expect(b.page.getByTestId('nav-home')).toBeVisible();
});

// behavior: SHELL-08
behavior('SHELL-08', 'every sync demo renders the shared header', async (b) => {
  await openTodos(b);
  await expect(b.page.locator('.demo-header h1')).toHaveText('Todos');
  await expect(latencySelect(b.page)).toBeVisible();
  await expect(badge(b.page)).toBeVisible();

  // Same header, same three parts, on another sync demo.
  await b.click('open Kanban', b.page.getByTestId('nav-kanban'));
  await expect(b.page.locator('.demo-header h1')).toHaveText('Kanban');
  await expect(latencySelect(b.page)).toBeVisible();
  await expect(badge(b.page)).toBeVisible();
});

// behavior: SHELL-09
behavior('SHELL-09', 'the sync badge reaches connected on a sync demo', async (b) => {
  // One badge over two transports: WebSocket standalone, worker embedded.
  await openTodos(b);
  await expect(badge(b.page)).toContainText('connected');
  await expect(badge(b.page)).not.toContainText('offline');
});

// behavior: SHELL-10
behavior('SHELL-10', 'the latency selector offers four steps and keeps the choice', async (b) => {
  await openTodos(b);
  await expect(latencySelect(b.page).locator('option')).toHaveText([
    'none',
    '100ms',
    '500ms',
    '2000ms'
  ]);
  await expect(latencySelect(b.page)).toHaveValue('0');
  await setLatency(b, 500);
  await expect(latencySelect(b.page)).toHaveValue('500');
});

// behavior: SHELL-11
behavior('SHELL-11', 'the latency choice carries across a route change', async (b) => {
  await openTodos(b);
  await setLatency(b, 500);

  // Each demo mounts its OWN LatencyService, but they all mirror one per-tab
  // ref — so the setting is still 500ms on the next demo.
  await b.click('open Kanban', b.page.getByTestId('nav-kanban'));
  await expect(b.page.locator('.demo-header h1')).toHaveText('Kanban');
  await expect(latencySelect(b.page)).toHaveValue('500');

  // It is a tab setting, not a stored preference: a fresh document is back to none.
  await b.goto('/kanban');
  await expect(latencySelect(b.page)).toHaveValue('0', { timeout: 20_000 });
});

// behavior: SHELL-12
behavior('SHELL-12', 'a mutation under latency shows the in-flight chip until it confirms', async (b) => {
  await openTodos(b);
  await setLatency(b, 2000);
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible();

  const title = await addTodo(b, 'shell latency todo');
  // Optimistic write is on screen immediately; the chip says it is not saved yet.
  await expect(b.page.getByText(title)).toBeVisible();
  await expect(b.page.getByTestId('inflight-chip')).toBeVisible();
  await expect(b.page.getByTestId('inflight-chip')).toContainText('in flight');

  // The confirm lands, the chip holds its settled state briefly, then leaves.
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible({ timeout: 20_000 });
  await expect(badge(b.page)).toContainText('connected');
});

// behavior: SHELL-13
behavior('SHELL-13', 'the sync toast tracks the same mutation from saving to saved', async (b) => {
  await openTodos(b);
  await setLatency(b, 2000);

  await addTodo(b, 'shell toast todo');
  await expect(toasts(b.page)).toContainText('Saving 1 change', { timeout: 10_000 });
  await expect(toasts(b.page)).toContainText('✓ Saved', { timeout: 20_000 });
});

// behavior: SHELL-14
behavior('SHELL-14', 'coming back to a sync demo finds its client already connected', async (b) => {
  await openTodos(b);
  // 2000ms latency makes the discriminator visible: a client that had to
  // re-handshake would sit in `connecting` for seconds.
  await setLatency(b, 2000);

  await b.click('open Kanban', b.page.getByTestId('nav-kanban'));
  await expect(badge(b.page)).toContainText('connected', { timeout: 30_000 });

  await b.click('back to Todos', b.page.getByTestId('nav-todos'));
  // One cached SyncClient per demo: the badge is connected on the first render.
  await expect(badge(b.page)).toContainText('connected', { timeout: 1_500 });
  await expect(todoInput(b.page)).toBeVisible();
});

// behavior: SHELL-15
behavior('SHELL-15', 'the debug panel opens and lists the live state tree', async (b) => {
  await openTodos(b);
  await expect(b.page.getByTestId('wheel-debug-panel')).toHaveCount(0);

  await b.click('open the debug panel', b.page.getByTestId('wheel-debug-toggle'));
  const panel = b.page.getByTestId('wheel-debug-panel');
  await expect(panel).toBeVisible();
  for (const section of ['state tree', 'components', 'tables', 'subscriptions', 'change stream']) {
    await expect(panel).toContainText(section);
  }
  // The panel reads the same client the page does.
  await expect(panel).toContainText('connected');
  await expect(panel).toContainText('seq');

  // The header's own toggle closes it again.
  await b.click('close the debug panel', panel.getByTestId('wheel-debug-toggle'));
  await expect(b.page.getByTestId('wheel-debug-panel')).toHaveCount(0);
});

// behavior: SHELL-16
behavior('SHELL-16', 'the debug panel stays open across a fresh page load', async (b) => {
  await openTodos(b);
  await b.click('open the debug panel', b.page.getByTestId('wheel-debug-toggle'));
  await expect(b.page.getByTestId('wheel-debug-panel')).toBeVisible();

  // A whole new document — the open state came back from localStorage, not memory.
  await b.goto('/todos');
  await expect(b.page.getByTestId('wheel-debug-panel')).toBeVisible({ timeout: 20_000 });
});

// behavior: SHELL-21
behavior('SHELL-21', 'the window.__wheel bridge finds components, reads state, and drives actions', async (b) => {
  await openTodos(b);
  const wheel = wheelDriver(b.page);
  await wheel.settle();

  // REAL names survive the production build (wheelDevTools keepNames): a
  // minified `So`/`rT` here means the debug story went illegible.
  const services = await wheel.state();
  expect(services.map((entry) => entry.service)).toContain('TodoService');

  // find + read: the todo list is mounted and its live state is legible.
  const hits = await wheel.find('TodoList');
  expect(hits.length).toBeGreaterThan(0);
  const detail = await wheel.component(hits[0].instanceId);
  expect(detail).not.toBeNull();
  expect(detail!.actions).toContain('add');

  // act: the ONE sanctioned write door — invoke the shape's action, then
  // watch the optimistic write land in the real UI.
  const added = await wheel.act(hits[0].instanceId, 'add', 'driven through __wheel');
  expect(added.ok).toBe(true);
  await expect(b.page.getByText('driven through __wheel')).toBeVisible();
  await wheel.settle();
});

// behavior: SHELL-22
behavior('SHELL-22', 'a console.error is captured with an id, shown in the panel, and thrown to the driver', async (b) => {
  b.allowAppErrors(); // this behavior EXISTS to provoke one
  await openTodos(b);
  const wheel = wheelDriver(b.page, { ignoreAppErrors: true });
  await wheel.settle();

  await b.page.evaluate(() => console.error('deliberate boom', new Error('provoked')));
  const fresh = await wheel.newErrors();
  expect(fresh).toHaveLength(1);
  expect(fresh[0].id).toMatch(/^err_\d+$/);
  expect(fresh[0].message).toContain('deliberate boom');
  expect(fresh[0].stack.length).toBeGreaterThan(0);

  // The panel's errors section lists the same entry by id.
  await b.click('open the debug panel', b.page.getByTestId('wheel-debug-toggle'));
  await expect(b.page.getByTestId('wheel-error-entry')).toContainText(fresh[0].id);

  // A throwing driver (the default) starts with its cursor at zero: its
  // FIRST call surfaces the errors already in the buffer — an agent cannot
  // attach to a broken app without hearing about it.
  const strict = wheelDriver(b.page);
  await expect(strict.meta()).rejects.toThrow(/deliberate boom/);
  // And it refuses to sail past the NEXT error too.
  await b.page.evaluate(() => console.error('second boom'));
  await expect(strict.find('TodoList')).rejects.toThrow(/second boom/);
});

// behavior: SHELL-23
behavior('SHELL-23', 'annotation mode picks a component and holds its live state in the draft', async (b) => {
  await openTodos(b);
  const wheel = wheelDriver(b.page);
  await wheel.settle();

  await b.click('arm annotation mode', b.page.getByTestId('wheel-annotate-chip'));
  await expect(b.page.getByTestId('wheel-annotate-shield')).toBeVisible();

  // The shield sits over the app on purpose (a press must reach the picker,
  // never the UI beneath it), so the pick is a real click at the component's
  // position rather than a click on its locator.
  const stage = await b.page.locator('.demo-stage').boundingBox();
  expect(stage).not.toBeNull();
  await b.step('pick the component under the cursor', () =>
    b.page.mouse.click(stage!.x + stage!.width / 2, stage!.y + stage!.height / 2)
  );

  await expect(b.page.getByTestId('wheel-annotate-composer')).toBeVisible();

  // The draft is app state like any other, so the bridge can read it: the note
  // already carries the anchor AND what that component held.
  const services = await wheel.state();
  const draft = services
    .find((entry) => entry.service === 'AnnotateService')
    ?.primitives.find((primitive) => primitive.name === 'draft')?.value as
    | { anchor?: { instanceId?: string }; target?: { state?: Record<string, unknown> } }
    | null
    | undefined;
  expect(draft?.anchor?.instanceId).toBeTruthy();
  expect(draft?.target?.state).toBeTruthy();
});

// behavior: SHELL-17
behavior('SHELL-17', 'an unmatched URL replaces the whole tree with the not-found page', async (b) => {
  await b.goto('/nope/nope');
  await expect(b.page.getByTestId('not-found')).toBeVisible({ timeout: 20_000 });
  // The 404 stands in for the ROOT layout, so the sidebar is gone too.
  await expect(b.page.getByTestId('nav-home')).toHaveCount(0);

  await b.click('back to the start', b.page.getByTestId('not-found-home'));
  await expect(b.page).toHaveURL(urlOn(b, '/'));
  await expect(b.page.getByTestId('home-page')).toBeVisible();
  await expect(b.page.getByTestId('nav-home')).toBeVisible();
});

// behavior: SHELL-18
behavior('SHELL-18', 'a route that throws is contained and leaves the shell usable', async (b) => {
  await openShellPath(b, '/routing/crash');
  await expect(b.page.getByTestId('route-error')).toBeVisible();
  await expect(b.page.getByTestId('route-error')).toContainText('This page failed to render');
  await expect(b.page.getByTestId('route-error-message')).toContainText('CrashService');
  // Containment, made concrete: the sidebar is still on screen and still works.
  await expect(b.page.getByTestId('nav-todos')).toBeVisible();

  await b.click('back to demos', b.page.getByTestId('route-error-home'));
  await expect(b.page).toHaveURL(urlOn(b, '/'));
  await expect(b.page.getByTestId('home-page')).toBeVisible();
  await expect(b.page.getByTestId('route-error')).toHaveCount(0);
});

// behavior: SHELL-19
behavior('SHELL-19', 'in-browser sync mode boots a demo with no sync server', async (b) => {
  // `?sync=local` swaps the HTTP wire for the in-page worker engine (WASM
  // SQLite). The embedded host is already in that mode by build flag; the flag
  // is what makes the standalone host prove it too.
  await openTodos(b, '/todos?sync=local');
  const title = await addTodo(b, 'shell in-browser todo');
  await expect(b.page.getByText(title)).toBeVisible();
  // The worker confirmed it: the chip drained without any HTTP sync server.
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible({ timeout: 20_000 });
  await expect(badge(b.page)).toContainText('connected');
});

// behavior: SHELL-20
behavior('SHELL-20', 'two tabs of the same demo stay in sync', async (b) => {
  await b.goto('/todos');
  const addHere = b.page.getByPlaceholder('Add a todo… (press n)');
  await expect(addHere).toBeVisible({ timeout: 20_000 });

  // The second tab is a raw page (uninstrumented — the recording follows tab
  // one): same context, same origin, so in embedded mode it attaches to the
  // same SharedWorker engine; standalone it gets its own WebSocket.
  const other = await b.page.context().newPage();
  await other.goto(`${b.host.origin}${b.host.prefix}/todos`);
  await expect(other.getByPlaceholder('Add a todo… (press n)')).toBeVisible({ timeout: 20_000 });

  const text = `synced across tabs ${Math.random().toString(36).slice(2, 8)}`;
  await b.fill('type a todo in tab one', addHere, text);
  await b.press('submit the todo', addHere, 'Enter');
  await expect(b.page.getByText(text)).toBeVisible();

  // The OTHER tab sees it arrive through the shared engine's delta stream.
  await expect(other.getByText(text)).toBeVisible({ timeout: 10_000 });
  await other.close();
});
