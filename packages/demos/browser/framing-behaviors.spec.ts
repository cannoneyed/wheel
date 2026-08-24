/**
 * Framing behaviors (specs/framing.md), recorded, against both hosts.
 *
 * Framing has no sync backend: structure lives in `WorkbenchService`, geometry
 * in `LayoutService`, and geometry persists to localStorage. Two rules follow
 * from that:
 *  1. Each behavior gets a fresh browser context, so storage starts empty and
 *     no behavior has to clean up after another.
 *  2. A behavior that tests persistence re-navigates INSIDE itself (the second
 *     `openFraming` is the reload), never across behaviors.
 *
 * The rows that need a raw pointer drag — divider drags, pane reorder, dock
 * drops (FRAMING-09/10/21/22) — have no instrumented action, so they are
 * covered standalone-only by `framing.spec.ts` and skipped here.
 */
import type { Locator, Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

/** One registered frame's element, by frame id. */
const frame = (page: Page, id: string): Locator => page.locator(`[data-wheel-frame="${id}"]`);
/** The resize divider that belongs to one frame (present only between siblings). */
const handle = (page: Page, id: string): Locator =>
  page.locator(`[data-wheel-frame-handle="${id}"]`);
/** One docked panel's body, by catalog panel id. */
const dockPanel = (page: Page, panelId: string): Locator =>
  page.locator(`[data-wheel-dock-panel="${panelId}"]`);
/** Every docked panel currently in the dock tree. */
const dockPanels = (page: Page): Locator => page.locator('[data-wheel-dock-panel]');
/** Every editor pane's frame, in DOM order. */
const editorFrames = (page: Page): Locator => page.locator('[data-wheel-frame^="editor-"]');
/** The portaled context menu (panel ⋯ menus and the workspace ☰ menu). */
const menu = (page: Page): Locator => page.getByTestId('wheel-context-menu');

/** Open /framing and wait for the layout to mount (embedded host boots on load). */
async function openFraming(b: BehaviorContext): Promise<void> {
  await b.goto('/framing');
  await expect(b.page.getByTestId('framing-demo')).toBeVisible({ timeout: 20_000 });
  await expect(frame(b.page, 'shell')).toBeVisible({ timeout: 20_000 });
  // A reported measurement is the precondition for every resize (the pair's
  // clamps are computed from measured pixels), so wait for the first one.
  await expect(b.page.getByTestId('frame-pixels-sidebar')).toContainText('×', {
    timeout: 20_000
  });
}

/**
 * Drive the stage-width slider — the container width `collapseBelow` reacts to.
 * `fill` on a range input sets the value and dispatches `input`, which is
 * exactly what the demo listens for.
 */
async function setStageWidth(b: BehaviorContext, width: number): Promise<void> {
  await b.fill(`stage width ${width}px`, b.page.getByTestId('container-width'), String(width));
  await expect(b.page.getByTestId('stage-width')).toHaveText(`${width}px`);
}

/** Rounded on-screen width of one frame's track. */
async function frameWidth(page: Page, id: string): Promise<number> {
  const box = await frame(page, id).boundingBox();
  return Math.round(box?.width ?? -1);
}

// behavior: FRAMING-01
behavior(
  'FRAMING-01',
  'the workbench renders the nested split tree with panes and dock panels',
  async (b) => {
    await openFraming(b);
    for (const id of ['shell', 'sidebar', 'work', 'editors', 'bottom-panel', 'outline']) {
      await expect(frame(b.page, id)).toBeVisible();
    }
    // Nesting: the editor row and the bottom dock are inside the work column.
    await expect(frame(b.page, 'work').locator('[data-wheel-frame="editors"]')).toHaveCount(1);
    await expect(frame(b.page, 'work').locator('[data-wheel-frame="bottom-panel"]')).toHaveCount(1);
    // Structure is app state: three editors in the service, three frames.
    await expect(editorFrames(b.page)).toHaveCount(3);
    await expect(b.page.getByTestId('editor-count')).toHaveText('3 open');
    await expect(dockPanels(b.page)).toHaveCount(3);
    // The drawer is registered but starts closed, and is not part of the split.
    await expect(frame(b.page, 'inspector-drawer')).toHaveAttribute('data-frame-open', 'false');
  },
  { smoke: true }
);

// behavior: FRAMING-02
behavior('FRAMING-02', 'dividers exist between siblings only, with separator semantics', async (b) => {
  await openFraming(b);
  const sidebar = handle(b.page, 'sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('role', 'separator');
  // Sidebar splits a row, so its divider moves along the horizontal axis.
  await expect(sidebar).toHaveAttribute('aria-orientation', 'vertical');
  await expect(sidebar).toHaveAttribute('aria-label', 'Resize sidebar');
  await expect(sidebar).toHaveAttribute('aria-valuemin', '160');
  await expect(sidebar).toHaveAttribute('aria-valuemax', '420');
  await expect(sidebar).toHaveAttribute('aria-valuenow', /^\d+$/);
  // The editor row splits a column, so its divider is the other orientation.
  await expect(handle(b.page, 'editors')).toBeVisible();
  await expect(handle(b.page, 'editors')).toHaveAttribute('aria-orientation', 'horizontal');
  // Outline is the last child of the shell: nothing to resize against.
  await expect(handle(b.page, 'outline')).not.toBeVisible();
});

// behavior: FRAMING-03
behavior('FRAMING-03', 'the inspector reports every mounted frame as live state', async (b) => {
  await openFraming(b);
  for (const id of [
    'shell',
    'sidebar',
    'work',
    'editors',
    'editor-app',
    'bottom-panel',
    'outline',
    'inspector-drawer'
  ]) {
    await expect(b.page.getByTestId(`frame-row-${id}`)).toHaveCount(1);
  }
  // Dock splits render as ordinary frames, so they show up here too.
  await expect(b.page.getByTestId('frame-row-dock-terminal')).toHaveCount(1);
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('240px');
  await expect(b.page.getByTestId('frame-open-sidebar')).toHaveText('open');
  await expect(b.page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
  await expect(b.page.getByTestId('frame-pixels-sidebar')).toContainText('240×');
  await expect(b.page.getByTestId('frame-open-inspector-drawer')).toHaveText('closed');
  await expect(b.page.getByTestId('frame-count')).toHaveText(/^\d+ frames$/);
  await expect(b.page.getByTestId('layout-interaction')).toHaveText('idle');
  await expect(b.page.getByTestId('layout-diagnostics')).toHaveText('none');
});

// behavior: FRAMING-04
behavior('FRAMING-04', 'arrow keys resize the pair, shift takes the coarse step', async (b) => {
  await openFraming(b);
  const separator = handle(b.page, 'sidebar');
  await b.press('grow the sidebar', separator, 'ArrowRight');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('250px');
  await b.press('shrink the sidebar', separator, 'ArrowLeft');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('240px');
  await b.press('coarse grow', separator, 'Shift+ArrowRight');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('290px');
  // The preference is the truth: the track on screen follows it.
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(290);
  // A keyboard step is not a gesture; no draft is left behind.
  await expect(b.page.getByTestId('layout-interaction')).toHaveText('idle');
});

// behavior: FRAMING-05
behavior('FRAMING-05', 'home and end clamp the track to its min and max', async (b) => {
  await openFraming(b);
  const separator = handle(b.page, 'sidebar');
  await b.press('clamp to minimum', separator, 'Home');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('160px');
  await b.press('clamp to maximum', separator, 'End');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('420px');
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(420);
});

// behavior: FRAMING-06
behavior('FRAMING-06', 'the horizontal divider moves the editor-row/dock boundary', async (b) => {
  await openFraming(b);
  const separator = handle(b.page, 'editors');
  await expect(b.page.getByTestId('frame-size-bottom-panel')).toHaveText('190px');
  await b.press('grow the editor row', separator, 'ArrowDown');
  // Pixels are written to the px sibling; the 1fr sibling is left alone.
  await expect(b.page.getByTestId('frame-size-bottom-panel')).toHaveText('180px');
  await expect(b.page.getByTestId('frame-size-editors')).toHaveText('1fr');
  await b.press('shrink the editor row', separator, 'ArrowUp');
  await expect(b.page.getByTestId('frame-size-bottom-panel')).toHaveText('190px');
});

// behavior: FRAMING-07
behavior('FRAMING-07', 'enter on a divider collapses its frame', async (b) => {
  await openFraming(b);
  await b.press('collapse the sidebar', handle(b.page, 'sidebar'), 'Enter');
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-open', 'false');
  await expect(b.page.getByTestId('frame-open-sidebar')).toHaveText('closed');
  // The header button is the same service call, so it reopens it.
  await b.click('reopen the sidebar', b.page.getByTestId('toggle-sidebar'));
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-open', 'true');
});

// behavior: FRAMING-08
behavior('FRAMING-08', 'double-clicking a divider resets both tracks', async (b) => {
  await openFraming(b);
  const separator = handle(b.page, 'sidebar');
  await b.press('coarse grow', separator, 'Shift+ArrowRight');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('290px');
  await b.dblclick('reset the pair', separator);
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('240px');
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(240);
});

// behavior: FRAMING-11
behavior('FRAMING-11', 'the sidebar toggle collapses and restores the region', async (b) => {
  await openFraming(b);
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-open', 'true');
  await b.click('hide the sidebar', b.page.getByTestId('toggle-sidebar'));
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-open', 'false');
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-visible', 'false');
  await expect(b.page.getByTestId('frame-open-sidebar')).toHaveText('closed');
  // Neighbours absorb the space, so the divider between them goes away.
  await expect(handle(b.page, 'sidebar')).not.toBeVisible();
  await b.click('show the sidebar', b.page.getByTestId('toggle-sidebar'));
  await expect(b.page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(240);
});

// behavior: FRAMING-12
behavior('FRAMING-12', 'the panel and outline toggles mirror their frames', async (b) => {
  await openFraming(b);
  await expect(b.page.getByTestId('toggle-panel')).toHaveAttribute('aria-pressed', 'true');
  await b.click('hide the bottom panel', b.page.getByTestId('toggle-panel'));
  await expect(frame(b.page, 'bottom-panel')).toHaveAttribute('data-frame-open', 'false');
  await expect(b.page.getByTestId('toggle-panel')).toHaveAttribute('aria-pressed', 'false');
  await b.click('hide the outline', b.page.getByTestId('toggle-outline'));
  await expect(frame(b.page, 'outline')).toHaveAttribute('data-frame-open', 'false');
  await expect(b.page.getByTestId('toggle-outline')).toHaveAttribute('aria-pressed', 'false');
  await b.click('show the outline', b.page.getByTestId('toggle-outline'));
  await expect(b.page.getByTestId('frame-open-outline')).toHaveText('open');
  await expect(b.page.getByTestId('toggle-outline')).toHaveAttribute('aria-pressed', 'true');
});

// behavior: FRAMING-13
behavior('FRAMING-13', 'a hidden region is aria-hidden and inert', async (b) => {
  await openFraming(b);
  await b.click('hide the sidebar', b.page.getByTestId('toggle-sidebar'));
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('aria-hidden', 'true');
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('inert', '');
  await expect(b.page.getByTestId('frame-visible-sidebar')).toHaveText('hidden');
  await b.click('show the sidebar', b.page.getByTestId('toggle-sidebar'));
  await expect(frame(b.page, 'sidebar')).not.toHaveAttribute('aria-hidden', 'true');
});

// behavior: FRAMING-14
behavior('FRAMING-14', 'a narrow stage auto-collapses the sidebar without touching open', async (b) => {
  await openFraming(b);
  await setStageWidth(b, 620);
  // `visible` is the effective result; `open` is still what the user asked for.
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-visible', 'false');
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-open', 'true');
  await expect(b.page.getByTestId('frame-visible-sidebar')).toHaveText('hidden');
  await expect(b.page.getByTestId('frame-open-sidebar')).toHaveText('open');
  await setStageWidth(b, 1100);
  await expect(b.page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(240);
});

// behavior: FRAMING-15
behavior('FRAMING-15', 'the sidebar toggle disables while responsive collapse hides it', async (b) => {
  await openFraming(b);
  await expect(b.page.getByTestId('toggle-sidebar')).toBeEnabled();
  await setStageWidth(b, 620);
  await expect(frame(b.page, 'sidebar')).toHaveAttribute('data-frame-visible', 'false');
  // The toggle could change nothing visible, so it is disabled rather than lying.
  await expect(b.page.getByTestId('toggle-sidebar')).toBeDisabled();
  await setStageWidth(b, 1100);
  await expect(b.page.getByTestId('toggle-sidebar')).toBeEnabled();
});

// behavior: FRAMING-16
behavior('FRAMING-16', 'the drawer opens as an overlay and nothing reflows', async (b) => {
  await openFraming(b);
  const drawer = frame(b.page, 'inspector-drawer');
  await expect(drawer).not.toBeVisible();
  const workBefore = await frameWidth(b.page, 'work');
  await b.click('open the drawer', b.page.getByTestId('toggle-drawer'));
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('aria-label', 'Inspector drawer');
  await expect(b.page.getByTestId('frame-open-inspector-drawer')).toHaveText('open');
  // It overlays: the work column did not give up any space for it.
  expect(await frameWidth(b.page, 'work')).toBeCloseTo(workBefore, 0);
  await b.click('close the drawer', b.page.getByTestId('toggle-drawer'));
  await expect(drawer).not.toBeVisible();
  await expect(b.page.getByTestId('frame-open-inspector-drawer')).toHaveText('closed');
});

// behavior: FRAMING-17
behavior('FRAMING-17', 'new pane appends an editor frame with no layout call', async (b) => {
  await openFraming(b);
  await expect(b.page.getByTestId('editor-count')).toHaveText('3 open');
  await b.click('open a new pane', b.page.getByTestId('new-editor'));
  await expect(b.page.getByTestId('editor-count')).toHaveText('4 open');
  await expect(frame(b.page, 'editor-untitled-1')).toBeVisible();
  await expect(editorFrames(b.page)).toHaveCount(4);
  // The frame exists because its data does, and the inspector sees it.
  await expect(b.page.getByTestId('frame-row-editor-untitled-1')).toHaveCount(1);
});

// behavior: FRAMING-18
behavior('FRAMING-18', 'panes close, and the last pane cannot be closed', async (b) => {
  await openFraming(b);
  await b.click('close app.tsx', b.page.getByTestId('close-app'));
  await expect(b.page.getByTestId('editor-count')).toHaveText('2 open');
  await expect(frame(b.page, 'editor-app')).toHaveCount(0);
  await b.click('close layout-service.ts', b.page.getByTestId('close-layout'));
  await expect(b.page.getByTestId('editor-count')).toHaveText('1 open');
  // The split is never left empty: closing the last pane is a no-op.
  await b.click('try to close the last pane', b.page.getByTestId('close-readme'));
  await expect(b.page.getByTestId('editor-count')).toHaveText('1 open');
  await expect(frame(b.page, 'editor-readme')).toBeVisible();
});

// behavior: FRAMING-19
behavior('FRAMING-19', 'each pane keeps its own draft text', async (b) => {
  await openFraming(b);
  await b.fill('type in the app.tsx pane', b.page.getByTestId('draft-app'), 'one\ntwo\nthree');
  await expect(frame(b.page, 'editor-app')).toContainText('Ln 3');
  // The sibling pane's own local state is untouched (README is four lines).
  await expect(frame(b.page, 'editor-readme')).toContainText('Ln 4');
  await expect(b.page.getByTestId('draft-readme')).toHaveValue(/^# Framing/);
});

// behavior: FRAMING-20
behavior('FRAMING-20', 'overflowing panes stay reachable by scrolling the row', async (b) => {
  await openFraming(b);
  for (let added = 0; added < 5; added += 1) {
    await b.click(`open pane ${added + 1}`, b.page.getByTestId('new-editor'));
  }
  await expect(b.page.getByTestId('editor-count')).toHaveText('8 open');
  const content = b.page.locator('[data-wheel-frame-content="editors"]');
  await expect
    .poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeGreaterThan(0);
  // The last pane exists off-screen; reaching for it scrolls the row to it.
  await expect(frame(b.page, 'editor-untitled-5')).toHaveCount(1);
  await b.hover('reach the last pane', frame(b.page, 'editor-untitled-5'));
  await expect(frame(b.page, 'editor-untitled-5')).toBeVisible();
  await expect(b.page.getByTestId('draft-untitled-5')).toBeVisible();
});

// behavior: FRAMING-23
behavior('FRAMING-23', 'the top-bar chips mirror and toggle the dock panels', async (b) => {
  await openFraming(b);
  await expect(b.page.getByTestId('chip-terminal')).toHaveAttribute('aria-pressed', 'true');
  // Chip off: the panel leaves the dock tree.
  await b.click('close the problems panel', b.page.getByTestId('chip-problems'));
  await expect(b.page.getByTestId('chip-problems')).toHaveAttribute('aria-pressed', 'false');
  await expect(dockPanel(b.page, 'problems')).toHaveCount(0);
  await expect(dockPanels(b.page)).toHaveCount(2);
  // Chip on: it returns as the last sibling of the dock row.
  await b.click('reopen the problems panel', b.page.getByTestId('chip-problems'));
  await expect(dockPanel(b.page, 'problems')).toHaveCount(1);
  await expect(dockPanels(b.page)).toHaveCount(3);
});

// behavior: FRAMING-24
behavior('FRAMING-24', 'a chip reopens the closed bottom-panel region', async (b) => {
  await openFraming(b);
  await b.click('close the terminal panel', b.page.getByTestId('chip-terminal'));
  await b.click('hide the bottom panel', b.page.getByTestId('toggle-panel'));
  await expect(frame(b.page, 'bottom-panel')).toHaveAttribute('data-frame-open', 'false');
  // Turning a chip on would change nothing visible, so it opens the region too.
  await b.click('reopen the terminal panel', b.page.getByTestId('chip-terminal'));
  await expect(frame(b.page, 'bottom-panel')).toHaveAttribute('data-frame-open', 'true');
  await expect(dockPanel(b.page, 'terminal')).toHaveCount(1);
});

// behavior: FRAMING-25
behavior('FRAMING-25', 'the workspace menu is a checklist that stays open', async (b) => {
  await openFraming(b);
  await b.click('open the workspace menu', b.page.getByTestId('workspace-menu'));
  await expect(menu(b.page)).toBeVisible();
  await expect(b.page.getByTestId('workspace-panel-terminal')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await b.click('uncheck problems', b.page.getByTestId('workspace-panel-problems'));
  await expect(dockPanel(b.page, 'problems')).toHaveCount(0);
  await expect(b.page.getByTestId('workspace-panel-problems')).toHaveAttribute(
    'aria-checked',
    'false'
  );
  // A checklist, not a command: the menu is still open, and the chip agrees.
  await expect(menu(b.page)).toBeVisible();
  await expect(b.page.getByTestId('chip-problems')).toHaveAttribute('aria-pressed', 'false');
  await b.click('check problems again', b.page.getByTestId('workspace-panel-problems'));
  await expect(dockPanel(b.page, 'problems')).toHaveCount(1);
});

// behavior: FRAMING-26
behavior('FRAMING-26', 'reset workspace restores the default panels and closes the menu', async (b) => {
  await openFraming(b);
  await b.click('open the workspace menu', b.page.getByTestId('workspace-menu'));
  await b.click('uncheck output', b.page.getByTestId('workspace-panel-output'));
  await expect(dockPanels(b.page)).toHaveCount(2);
  await b.click('reset the workspace', b.page.getByTestId('workspace-reset'));
  await expect(dockPanels(b.page)).toHaveCount(3);
  await expect(menu(b.page)).not.toBeVisible();
});

// behavior: FRAMING-27
behavior('FRAMING-27', 'the panel menu closes panels and an empty dock says so', async (b) => {
  await openFraming(b);
  await b.click('open the terminal menu', b.page.getByTestId('more-terminal'));
  await b.click('close the terminal panel', b.page.getByTestId('close-panel-terminal'));
  await expect(dockPanel(b.page, 'terminal')).toHaveCount(0);
  await expect(b.page.getByTestId('chip-terminal')).toHaveAttribute('aria-pressed', 'false');
  for (const panelId of ['problems', 'output']) {
    await b.click(`open the ${panelId} menu`, b.page.getByTestId(`more-${panelId}`));
    await b.click(`close the ${panelId} panel`, b.page.getByTestId(`close-panel-${panelId}`));
  }
  // An empty dock is app state like any other, so the region can say so.
  await expect(dockPanels(b.page)).toHaveCount(0);
  await expect(b.page.getByTestId('dock-empty')).toBeVisible();
  await b.click('reopen the terminal panel', b.page.getByTestId('chip-terminal'));
  await expect(dockPanel(b.page, 'terminal')).toHaveCount(1);
  await expect(b.page.getByTestId('dock-empty')).toHaveCount(0);
});

// behavior: FRAMING-28
behavior('FRAMING-28', 'right-clicking a panel opens the same actions menu', async (b) => {
  await openFraming(b);
  await b.rightClick('right-click the terminal actions', b.page.getByTestId('more-terminal'));
  await expect(menu(b.page)).toBeVisible();
  await expect(b.page.getByTestId('close-panel-terminal')).toBeVisible();
  await b.pressGlobal('Escape');
  await expect(menu(b.page)).not.toBeVisible();
  // The panel is untouched: opening a menu is not an edit.
  await expect(dockPanel(b.page, 'terminal')).toHaveCount(1);
});

// behavior: FRAMING-29
behavior('FRAMING-29', 'sizes and open state survive a page load', async (b) => {
  await openFraming(b);
  await b.press('grow the sidebar', handle(b.page, 'sidebar'), 'ArrowRight');
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('250px');
  await b.click('hide the outline', b.page.getByTestId('toggle-outline'));
  await expect(b.page.getByTestId('frame-open-outline')).toHaveText('closed');

  // Same context, second load: geometry comes back keyed by frame id.
  await openFraming(b);
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('250px');
  await expect(b.page.getByTestId('frame-open-outline')).toHaveText('closed');
  await expect.poll(() => frameWidth(b.page, 'sidebar')).toBe(250);
});

// behavior: FRAMING-30
behavior('FRAMING-30', 'reset layout forgets deviations, and the reset persists', async (b) => {
  await openFraming(b);
  await b.press('grow the sidebar', handle(b.page, 'sidebar'), 'ArrowRight');
  await b.click('hide the outline', b.page.getByTestId('toggle-outline'));
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('250px');

  await b.click('reset the layout', b.page.getByTestId('reset-layout'));
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('240px');
  await expect(b.page.getByTestId('frame-open-outline')).toHaveText('open');

  // The reset was written, not just applied in memory.
  await openFraming(b);
  await expect(b.page.getByTestId('frame-size-sidebar')).toHaveText('240px');
  await expect(b.page.getByTestId('frame-open-outline')).toHaveText('open');
});

// behavior: FRAMING-10
behavior('FRAMING-10', 'escape during a divider drag cancels it, sizes untouched', async (b) => {
  await openFraming(b);
  const before = await frameWidth(b.page, 'sidebar');
  const grip = (await handle(b.page, 'sidebar').boundingBox())!;
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  // Raw pointer drag — BehaviorContext has no mouse-move API, so these three
  // steps are absent from the recorded timeline (documented harness gap).
  await b.page.mouse.move(x, y);
  await b.page.mouse.down();
  await b.page.mouse.move(x + 60, y, { steps: 5 });
  await expect(b.page.getByTestId('layout-interaction')).not.toHaveText('idle');
  await b.pressGlobal('Escape');
  await b.page.mouse.up();
  await expect(b.page.getByTestId('layout-interaction')).toHaveText('idle');
  expect(await frameWidth(b.page, 'sidebar')).toBe(before);
});
