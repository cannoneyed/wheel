/**
 * The framing kitchen sink in a real browser.
 *
 * Everything here needs Chromium to be honest about: pointer capture and the
 * gesture machines built on it (resize drags, pane reorder drags, dock drops),
 * `ResizeObserver`-driven responsive collapse, real focus for keyboard
 * resizing, and localStorage surviving a reload. jsdom covers the service math;
 * this file covers the parts only a layout engine in a real viewport can prove.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

const frame = (page: Page, id: string): Locator =>
  page.locator(`[data-wheel-frame="${id}"]`);
const handle = (page: Page, id: string): Locator =>
  page.locator(`[data-wheel-frame-handle="${id}"]`);
const dockPanel = (page: Page, panelId: string): Locator =>
  page.locator(`[data-wheel-dock-panel="${panelId}"]`);

/** Frame ids of the editor panes, in DOM order. */
async function editorOrder(page: Page): Promise<(string | null)[]> {
  return page
    .locator('[data-wheel-frame^="editor-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-wheel-frame'))
    );
}

/** Drive the stage-width slider, which is what `collapseBelow` reacts to. */
async function setStageWidth(page: Page, width: number): Promise<void> {
  await page.getByTestId('container-width').evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, width);
  await expect(page.getByTestId('stage-width')).toHaveText(`${width}px`);
}

/** Press, drag, release — a real pointer gesture, not a synthesized event. */
async function dragFromTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** Load `/framing` in a fresh test context, then scroll the stage on screen. */
async function openFramingDemo(page: Page): Promise<void> {
  await page.goto('/framing', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('framing-demo')).toBeVisible();
  await page.getByTestId('framing-stage').scrollIntoViewIfNeeded();
}

test.beforeEach(async ({ page }) => {
  await openFramingDemo(page);
});

test.describe('framing kitchen sink', () => {
  // behavior: FRAMING-01 (also FRAMING-03: the inspector rows)
  test('renders the nested split tree and reports every frame as live state', async ({
    page
  }) => {
    for (const id of [
      'shell',
      'sidebar',
      'work',
      'editors',
      'bottom-panel',
      'outline'
    ]) {
      await expect(frame(page, id)).toBeVisible();
    }
    // Nesting: the editor row and the bottom panel are inside the work column.
    await expect(
      frame(page, 'work').locator('[data-wheel-frame="editors"]')
    ).toHaveCount(1);
    await expect(
      frame(page, 'work').locator('[data-wheel-frame="bottom-panel"]')
    ).toHaveCount(1);

    // Structure is app state: three editors in the service, three frames.
    expect(await editorOrder(page)).toEqual([
      'editor-app',
      'editor-layout',
      'editor-readme'
    ]);
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(3);

    // A handle exists between siblings, and only between siblings.
    await expect(handle(page, 'sidebar')).toBeVisible();
    await expect(handle(page, 'editors')).toBeVisible();
    await expect(handle(page, 'outline')).not.toBeVisible();
    await expect(handle(page, 'sidebar')).toHaveAttribute('role', 'separator');
    await expect(handle(page, 'sidebar')).toHaveAttribute(
      'aria-orientation',
      'vertical'
    );

    // The inspector reads the same nodes the components render from.
    await expect(page.getByTestId('frame-row-shell')).toBeVisible();
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('240px');
    await expect(page.getByTestId('frame-open-sidebar')).toHaveText('open');
    await expect(page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
    await expect(page.getByTestId('frame-pixels-sidebar')).toContainText('240×');
    await expect(page.getByTestId('layout-interaction')).toHaveText('idle');
    await expect(page.getByTestId('layout-diagnostics')).toHaveText('none');
  });

  // behavior: FRAMING-09
  test('resizes a track by dragging its handle', async ({ page }) => {
    const sidebar = frame(page, 'sidebar');
    const before = (await sidebar.boundingBox())!.width;
    const grip = (await handle(page, 'sidebar').boundingBox())!;
    const y = grip.y + grip.height / 2;
    const x = grip.x + grip.width / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 70, y, { steps: 12 });
    // Only the dragged boundary lights up: `work` is the pair's other side,
    // and neither it nor any other handle may show drag chrome.
    await expect(handle(page, 'sidebar')).toHaveAttribute(
      'data-state',
      'dragging'
    );
    await expect(handle(page, 'work')).toHaveAttribute('data-state', 'idle');
    await page.mouse.up();

    await expect
      .poll(async () => (await sidebar.boundingBox())!.width)
      .toBeGreaterThan(before + 50);
    expect((await sidebar.boundingBox())!.width).toBeLessThan(before + 90);
    // The commit lands as a preference, in pixels, and the draft is gone.
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText(/^3\d\dpx$/);
    await expect(page.getByTestId('layout-interaction')).toHaveText('idle');
  });

  // behavior: FRAMING-04 (also FRAMING-08: double-click reset)
  test('resizes from the keyboard and resets on double-click', async ({ page }) => {
    const sidebar = frame(page, 'sidebar');
    const separator = handle(page, 'sidebar');
    const expectSidebarWidth = async (width: number): Promise<void> => {
      await expect
        .poll(async () => Math.round((await sidebar.boundingBox())!.width))
        .toBe(width);
    };
    await separator.focus();

    await separator.press('ArrowRight');
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('250px');
    await expectSidebarWidth(250);
    await separator.press('ArrowLeft');
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('240px');
    await expectSidebarWidth(240);
    // Shift is the coarse step.
    await separator.press('Shift+ArrowRight');
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('290px');
    await expectSidebarWidth(290);

    await separator.dblclick();
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('240px');
    await expectSidebarWidth(240);
  });

  // behavior: FRAMING-11 (also FRAMING-12: the header toggles)
  test('collapses and reopens a region from a header button', async ({ page }) => {
    const sidebar = frame(page, 'sidebar');
    await expect(sidebar).toHaveAttribute('data-frame-open', 'true');

    await page.getByTestId('toggle-sidebar').click();
    await expect(sidebar).toHaveAttribute('data-frame-open', 'false');
    await expect(sidebar).toHaveAttribute('data-frame-visible', 'false');
    await expect(page.getByTestId('frame-open-sidebar')).toHaveText('closed');
    // Neighbours absorb the space; the handle between them goes away.
    await expect(handle(page, 'sidebar')).not.toBeVisible();

    await page.getByTestId('toggle-sidebar').click();
    await expect(sidebar).toHaveAttribute('data-frame-open', 'true');
    await expect(page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
    await expect
      .poll(async () => Math.round((await sidebar.boundingBox())!.width))
      .toBe(240);
  });

  // behavior: FRAMING-14
  test('auto-collapses on a narrow container without touching the user choice', async ({
    page
  }) => {
    await setStageWidth(page, 620);

    // `visible` is the effective result; `open` is still what the user asked for.
    await expect(frame(page, 'sidebar')).toHaveAttribute(
      'data-frame-visible',
      'false'
    );
    await expect(frame(page, 'sidebar')).toHaveAttribute(
      'data-frame-open',
      'true'
    );
    await expect(page.getByTestId('frame-visible-sidebar')).toHaveText('hidden');
    await expect(page.getByTestId('frame-open-sidebar')).toHaveText('open');

    await setStageWidth(page, 1100);
    await expect(page.getByTestId('frame-visible-sidebar')).toHaveText('visible');
    await expect
      .poll(async () => Math.round((await frame(page, 'sidebar').boundingBox())!.width))
      .toBe(240);
  });

  // behavior: FRAMING-16
  test('opens and closes the overlay drawer', async ({ page }) => {
    const drawer = frame(page, 'inspector-drawer');
    // Drawers start closed and do not join the split.
    await expect(drawer).toHaveAttribute('data-frame-open', 'false');
    await expect(drawer).not.toBeVisible();
    const workBefore = (await frame(page, 'work').boundingBox())!.width;

    await page.getByTestId('toggle-drawer').click();
    await expect(drawer).toHaveAttribute('data-frame-open', 'true');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-label', 'Inspector drawer');
    // It overlays; nothing reflowed to make room for it.
    expect((await frame(page, 'work').boundingBox())!.width).toBeCloseTo(
      workBefore,
      0
    );

    await page.getByTestId('toggle-drawer').click();
    await expect(drawer).toHaveAttribute('data-frame-open', 'false');
    await expect(drawer).not.toBeVisible();
  });

  // behavior: FRAMING-29 (also FRAMING-30: reset forgets the persisted state)
  test('restores sizes and open state after a reload, and forgets them on reset', async ({
    page
  }) => {
    await handle(page, 'sidebar').focus();
    await handle(page, 'sidebar').press('ArrowRight');
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('250px');
    await page.getByTestId('toggle-outline').click();
    await expect(page.getByTestId('frame-open-outline')).toHaveText('closed');

    await page.reload();
    await expect(page.getByTestId('framing-demo')).toBeVisible();
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('250px');
    await expect(page.getByTestId('frame-open-outline')).toHaveText('closed');

    await page.getByTestId('reset-layout').click();
    await expect(page.getByTestId('frame-size-sidebar')).toHaveText('240px');
    await expect(page.getByTestId('frame-open-outline')).toHaveText('open');
  });

  // behavior: FRAMING-17 (also FRAMING-18: the last pane cannot close)
  test('opens and closes editor panes from app state', async ({ page }) => {
    await expect(page.getByTestId('editor-count')).toHaveText('3 open');

    await page.getByTestId('new-editor').click();
    await expect(page.getByTestId('editor-count')).toHaveText('4 open');
    await expect(frame(page, 'editor-untitled-1')).toBeVisible();

    await page.getByTestId('close-untitled-1').click();
    await expect(page.getByTestId('editor-count')).toHaveText('3 open');
    await expect(frame(page, 'editor-untitled-1')).toHaveCount(0);
  });

  // behavior: FRAMING-21
  test('reorders editor panes by dragging one past its sibling', async ({ page }) => {
    expect(await editorOrder(page)).toEqual([
      'editor-app',
      'editor-layout',
      'editor-readme'
    ]);

    const grip = (await page.getByTestId('grip-app').boundingBox())!;
    const target = (await frame(page, 'editor-layout').boundingBox())!;
    await dragFromTo(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: target.x + target.width * 0.8, y: target.y + target.height / 2 }
    );

    await expect.poll(() => editorOrder(page)).toEqual([
      'editor-layout',
      'editor-app',
      'editor-readme'
    ]);
    // The service owns the order, so it survives a reload of the pane list.
    await expect(page.getByTestId('editor-count')).toHaveText('3 open');
  });

  // behavior: FRAMING-22
  test('creates a split by dropping a docked panel on another panel edge', async ({
    page
  }) => {
    await expect(page.locator('[data-wheel-frame="split-1"]')).toHaveCount(0);

    const grip = (await page.getByTestId('dock-grip-output').boundingBox())!;
    const target = (await dockPanel(page, 'terminal').boundingBox())!;
    await dragFromTo(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: target.x + target.width / 2, y: target.y + 6 }
    );

    // The split exists because an app action put it in the app's own tree.
    await expect(page.locator('[data-wheel-frame="split-1"]')).toHaveCount(1);
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(3);
    const output = (await dockPanel(page, 'output').boundingBox())!;
    const terminal = (await dockPanel(page, 'terminal').boundingBox())!;
    expect(output.y).toBeLessThan(terminal.y);

    await page.getByTestId('workspace-menu').click();
    await page.getByTestId('workspace-reset').click();
    await expect(page.locator('[data-wheel-frame="split-1"]')).toHaveCount(0);
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(3);
  });

  // behavior: FRAMING-25 (also FRAMING-26: the reset entry)
  test('the workspace menu is a panel checklist with reset below a divider', async ({
    page
  }) => {
    await page.getByTestId('workspace-menu').click();
    await expect(page.getByTestId('workspace-panel-terminal')).toHaveAttribute(
      'aria-checked',
      'true'
    );

    // Toggling an entry applies immediately and keeps the checklist open.
    await page.getByTestId('workspace-panel-problems').click();
    await expect(dockPanel(page, 'problems')).toHaveCount(0);
    await expect(page.getByTestId('workspace-panel-problems')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    await expect(page.getByTestId('chip-problems')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await page.getByTestId('workspace-panel-problems').click();
    await expect(dockPanel(page, 'problems')).toHaveCount(1);

    // Reset restores the default three and closes the menu.
    await page.getByTestId('workspace-panel-output').click();
    await page.getByTestId('workspace-reset').click();
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(3);
    await expect(page.getByTestId('workspace-reset')).toHaveCount(0);
  });

  // behavior: FRAMING-31
  test('overflowing editor panes get the framework scrollbar', async ({
    page
  }) => {
    const scrollbar = frame(page, 'editors').locator('[data-wheel-scrollbar]');
    const thumb = scrollbar.locator('[data-wheel-scrollbar-thumb]');
    const content = page.locator('[data-wheel-frame-content="editors"]');
    // No overflow, no scrollbar — and the content owns the full height.
    await expect(scrollbar).not.toBeVisible();
    const fullHeight = await content.evaluate(
      (element) => element.clientHeight
    );

    for (let added = 0; added < 5; added += 1) {
      await page.getByTestId('new-editor').click();
    }
    await expect(page.getByTestId('editor-count')).toHaveText('8 open');
    await expect(scrollbar).toBeVisible();
    await expect(scrollbar).toHaveAttribute('role', 'scrollbar');
    // The bar is a gutter, not an overlay: content shifted up to make room.
    await expect
      .poll(() => content.evaluate((element) => element.clientHeight))
      .toBeLessThan(fullHeight);

    // The native scrollbar is hidden; the framework one owns the affordance.
    await expect(
      page.locator('[data-wheel-frame-content="editors"]')
    ).toHaveCSS('scrollbar-width', 'none');

    // More panes shrink the thumb.
    const thumbBefore = (await thumb.boundingBox())!.width;
    for (let added = 0; added < 3; added += 1) {
      await page.getByTestId('new-editor').click();
    }
    await expect
      .poll(async () => (await thumb.boundingBox())!.width)
      .toBeLessThan(thumbBefore);

    // Dragging the thumb scrolls the row and reveals the last pane.
    const box = (await thumb.boundingBox())!;
    await dragFromTo(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { x: box.x + box.width / 2 + 600, y: box.y + box.height / 2 }
    );
    await expect
      .poll(() => content.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(100);
    await expect(page.getByTestId('draft-untitled-8')).toBeVisible();

    // Closing panes until nothing overflows removes the scrollbar again —
    // and the content gets its gutter space back.
    for (let closed = 1; closed <= 8; closed += 1) {
      await page.getByTestId(`close-untitled-${closed}`).click();
    }
    await expect(page.getByTestId('editor-count')).toHaveText('3 open');
    await expect(scrollbar).not.toBeVisible();
    await expect
      .poll(() => content.evaluate((element) => element.clientHeight))
      .toBe(fullHeight);
  });

  // behavior: FRAMING-32 (also FRAMING-33: fit widths)
  test('panes grow past overflow with solo resize; fit widths restores them', async ({
    page
  }) => {
    const content = page.locator('[data-wheel-frame-content="editors"]');
    const scrollbar = frame(page, 'editors').locator('[data-wheel-scrollbar]');
    const first = frame(page, 'editor-app');
    const second = frame(page, 'editor-layout');
    const dragHandle = async (id: string, dx: number): Promise<void> => {
      const grip = (await handle(page, id).boundingBox())!;
      const y = grip.y + grip.height / 2;
      const x = grip.x + grip.width / 2;
      await dragFromTo(page, { x, y }, { x: x + dx, y });
    };

    // Drag the SECOND pane's divider: everything left of it must not move.
    const firstBefore = (await first.boundingBox())!;
    const secondBefore = (await second.boundingBox())!.width;
    await dragHandle('editor-layout', 250);
    await expect
      .poll(async () => (await second.boundingBox())!.width)
      .toBeGreaterThan(secondBefore + 200);
    const firstAfter = (await first.boundingBox())!;
    expect(Math.abs(firstAfter.x - firstBefore.x)).toBeLessThan(2);
    expect(Math.abs(firstAfter.width - firstBefore.width)).toBeLessThan(2);
    await expect(page.getByTestId('frame-size-editor-layout')).toHaveText(/px$/);
    // The overflow went to the scrollbar, not to crushed neighbors.
    await expect(scrollbar).toBeVisible();
    await expect
      .poll(() =>
        content.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBeGreaterThan(100);

    // The LAST pane has its own trailing handle and grows the same way.
    await content.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const last = frame(page, 'editor-readme');
    await expect(handle(page, 'editor-readme')).toBeVisible();
    const lastBefore = (await last.boundingBox())!.width;
    await dragHandle('editor-readme', 150);
    await expect
      .poll(async () => (await last.boundingBox())!.width)
      .toBeGreaterThan(lastBefore + 100);

    // Fit widths: everything back to 1fr, nothing overflows, scrollbar gone.
    await page.getByTestId('fit-editors').click();
    await expect(page.getByTestId('frame-size-editor-app')).toHaveText('1fr');
    await expect(page.getByTestId('frame-size-editor-layout')).toHaveText('1fr');
    await expect(scrollbar).not.toBeVisible();
    await expect
      .poll(() =>
        content.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBe(0);

    // A single pane keeps a draggable trailing handle even below fit width.
    await page.getByTestId('close-app').click();
    await page.getByTestId('close-layout').click();
    await expect(page.getByTestId('editor-count')).toHaveText('1 open');
    await expect(handle(page, 'editor-readme')).toBeVisible();
    const soloBefore = (await frame(page, 'editor-readme').boundingBox())!.width;
    await dragHandle('editor-readme', -200);
    await expect
      .poll(async () => (await frame(page, 'editor-readme').boundingBox())!.width)
      .toBeLessThan(soloBefore - 150);
    await expect(handle(page, 'editor-readme')).toBeVisible();
  });

  // behavior: FRAMING-34
  test('a solo drag near the container edge snaps to the fit width', async ({
    page
  }) => {
    const content = page.locator('[data-wheel-frame-content="editors"]');
    const scrollbar = frame(page, 'editors').locator('[data-wheel-scrollbar]');
    const separator = handle(page, 'editor-readme');
    const lock = page.locator('[data-wheel-frame-snap-lock]');

    // The row starts at an exact fit, so the fit delta for the last pane's
    // trailing handle is ~0: drag out beyond tolerance, then come back.
    const grip = (await separator.boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y, { steps: 4 });
    await expect(separator).toHaveAttribute('data-state', 'dragging');
    await expect(lock).toHaveCount(0);
    await expect
      .poll(() =>
        content.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBeGreaterThan(20);

    // Within ±3px of the far edge: the drag locks onto the exact fit width.
    await page.mouse.move(x + 2, y, { steps: 4 });
    await expect(separator).toHaveAttribute('data-state', 'snapped');
    await expect(lock).toBeVisible();
    await page.mouse.up();

    // The release left the row lined up with the viewport: zero overflow.
    // The fit-locked MODE persists, but its chrome is drag-only.
    await expect
      .poll(() =>
        content.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBe(0);
    await expect(scrollbar).not.toBeVisible();
    await expect(lock).toHaveCount(0);
    await expect(separator).not.toHaveAttribute('data-state', 'snapped');
  });

  // behavior: FRAMING-37
  test('an attached row stays attached: the last pane absorbs left drags', async ({
    page
  }) => {
    const content = page.locator('[data-wheel-frame-content="editors"]');
    const scrollbar = frame(page, 'editors').locator('[data-wheel-scrollbar]');
    const lock = page.locator('[data-wheel-frame-snap-lock]');
    const last = frame(page, 'editor-readme');
    const attachedGap = (): Promise<number> =>
      page.evaluate(() => {
        const container = document.querySelector(
          '[data-wheel-frame-content="editors"]'
        ) as HTMLElement;
        const lastPane = document.querySelector(
          '[data-wheel-frame="editor-readme"]'
        ) as HTMLElement;
        return (
          container.getBoundingClientRect().right -
          lastPane.getBoundingClientRect().right
        );
      });

    const firstBefore = (await frame(page, 'editor-app').boundingBox())!.width;
    const lastBefore = (await last.boundingBox())!.width;

    // Shrink the FIRST pane: the last pane absorbs, the row never detaches.
    const grip = (await handle(page, 'editor-app').boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 60, y, { steps: 6 });
    // No lock chrome: staying attached is the natural behavior here.
    await expect(lock).toHaveCount(0);
    await page.mouse.up();

    await expect
      .poll(async () => (await frame(page, 'editor-app').boundingBox())!.width)
      .toBeLessThan(firstBefore - 40);
    await expect
      .poll(async () => (await last.boundingBox())!.width)
      .toBeGreaterThan(lastBefore + 40);
    expect(Math.abs(await attachedGap())).toBeLessThan(1.5);
    await expect(scrollbar).not.toBeVisible();

    // Grow the first pane hard: the last pane KEEPS its width (it never
    // shrinks during someone else's drag) and overflow takes the growth.
    const lastGrown = (await last.boundingBox())!.width;
    const grip2 = (await handle(page, 'editor-app').boundingBox())!;
    await dragFromTo(
      page,
      { x: grip2.x + grip2.width / 2, y },
      { x: grip2.x + grip2.width / 2 + 250, y }
    );
    await expect(scrollbar).toBeVisible();
    await expect
      .poll(() =>
        content.evaluate((element) => element.scrollWidth - element.clientWidth)
      )
      .toBeGreaterThan(200);
    expect((await last.boundingBox())!.width).toBeGreaterThan(lastGrown - 3);
  });

  // behavior: FRAMING-35 (also FRAMING-36: locked refit and unlock)
  test('push-snap locks from any handle; a locked row refits on change', async ({
    page
  }) => {
    const content = page.locator('[data-wheel-frame-content="editors"]');
    const scrollbar = frame(page, 'editors').locator('[data-wheel-scrollbar]');
    const lastHandle = handle(page, 'editor-readme');
    const lock = page.locator('[data-wheel-frame-snap-lock]');
    const overflow = (): Promise<number> =>
      content.evaluate(
        (element) => element.scrollWidth - element.clientWidth
      );
    const dragHandle = async (id: string, dx: number): Promise<void> => {
      const grip = (await handle(page, id).boundingBox())!;
      const y = grip.y + grip.height / 2;
      const x = grip.x + grip.width / 2;
      await dragFromTo(page, { x, y }, { x: x + dx, y });
    };

    // Underfill the row: shrink the last pane, leaving an ~80px gap.
    await dragHandle('editor-readme', -80);
    await expect.poll(overflow).toBe(0);
    await expect(lock).toHaveCount(0);

    // Grow the SECOND pane: it pushes the last pane's edge back toward the
    // container edge; within tolerance the LAST pane's handle locks, even
    // though it is not the handle being dragged.
    const grip = (await handle(page, 'editor-layout').boundingBox())!;
    const x = grip.x + grip.width / 2;
    const y = grip.y + grip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 79, y, { steps: 6 });
    await expect(lastHandle).toHaveAttribute('data-state', 'snapped');
    await expect(lock).toBeVisible();
    await page.mouse.up();
    // Drag chrome goes away with the drag; the fit-locked mode stays on.
    await expect(lock).toHaveCount(0);
    await expect.poll(overflow).toBe(0);

    // Locked pair drag: while two panes trade space as pixels, the third —
    // a lone fractional item — must still fill the row completely. (Sub-1
    // grow factors under-fill in flexbox; the kit scales them, and this
    // holds the regression.)
    const pairGrip = (await handle(page, 'editor-app').boundingBox())!;
    const px = pairGrip.x + pairGrip.width / 2;
    const py = pairGrip.y + pairGrip.height / 2;
    await page.mouse.move(px, py);
    await page.mouse.down();
    await page.mouse.move(px - 40, py, { steps: 5 });
    const midGap = await page.evaluate(() => {
      const container = document.querySelector(
        '[data-wheel-frame-content="editors"]'
      ) as HTMLElement;
      const panes = container.querySelectorAll('[data-wheel-frame]');
      const lastPane = panes[panes.length - 1] as HTMLElement;
      return (
        container.getBoundingClientRect().right -
        lastPane.getBoundingClientRect().right
      );
    });
    expect(Math.abs(midGap)).toBeLessThan(1.5);
    await page.mouse.up();
    await expect.poll(overflow).toBe(0);

    // Locked: closing a pane refits the rest proportionally — no overflow,
    // no scrollbar, weights not pixels.
    await page.getByTestId('close-app').click();
    await expect(page.getByTestId('editor-count')).toHaveText('2 open');
    await expect.poll(overflow).toBe(0);
    await expect(scrollbar).not.toBeVisible();
    await expect(page.getByTestId('frame-size-editor-layout')).toHaveText(/fr$/);

    // Locked: adding a pane also fits — the new pane joins the weights.
    await page.getByTestId('new-editor').click();
    await expect.poll(overflow).toBe(0);
    await expect(page.getByTestId('frame-size-editor-untitled-1')).toHaveText(
      '1fr'
    );

    // Dragging the trailing edge off the fit releases the lock: the row is
    // pixel-pinned again, so a later close leaves a gap instead of refitting.
    await dragHandle('editor-untitled-1', -60);
    await expect(page.getByTestId('frame-size-editor-untitled-1')).toHaveText(
      /px$/
    );
    const readmeWidth = (await frame(page, 'editor-readme').boundingBox())!
      .width;
    await page.getByTestId('close-untitled-1').click();
    // Unlocked pixel panes keep their widths — no proportional refit.
    await expect
      .poll(async () => (await frame(page, 'editor-readme').boundingBox())!.width)
      .toBeLessThan(readmeWidth + 2);
  });

  // behavior: FRAMING-23
  test('top-bar chips mirror and toggle the bottom panels', async ({ page }) => {
    await expect(page.getByTestId('chip-terminal')).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Chip off: the panel leaves the dock tree.
    await page.getByTestId('chip-problems').click();
    await expect(page.getByTestId('chip-problems')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await expect(dockPanel(page, 'problems')).toHaveCount(0);
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(2);

    // Chip on: it returns as the last sibling of the dock row.
    await page.getByTestId('chip-problems').click();
    await expect(dockPanel(page, 'problems')).toHaveCount(1);
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(3);
  });

  // behavior: FRAMING-27
  test('the panel menu closes panels; an empty dock says so', async ({ page }) => {
    await page.getByTestId('more-terminal').click();
    await page.getByTestId('close-panel-terminal').click();
    await expect(dockPanel(page, 'terminal')).toHaveCount(0);
    await expect(page.getByTestId('chip-terminal')).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    for (const panelId of ['problems', 'output']) {
      await page.getByTestId(`more-${panelId}`).click();
      await page.getByTestId(`close-panel-${panelId}`).click();
    }
    await expect(page.locator('[data-wheel-dock-panel]')).toHaveCount(0);
    await expect(page.getByTestId('dock-empty')).toBeVisible();

    // A chip brings the dock back from empty.
    await page.getByTestId('chip-terminal').click();
    await expect(dockPanel(page, 'terminal')).toHaveCount(1);
    await expect(page.getByTestId('dock-empty')).toHaveCount(0);
  });

  // behavior: FRAMING-24
  test('turning a chip on reopens a hidden bottom-panel region', async ({
    page
  }) => {
    await page.getByTestId('chip-terminal').click();
    await page.getByTestId('toggle-panel').click();
    await expect(frame(page, 'bottom-panel')).toHaveAttribute(
      'data-frame-open',
      'false'
    );

    await page.getByTestId('chip-terminal').click();
    await expect(frame(page, 'bottom-panel')).toHaveAttribute(
      'data-frame-open',
      'true'
    );
    await expect(dockPanel(page, 'terminal')).toHaveCount(1);
  });

  // behavior: FRAMING-15
  test('the sidebar toggle disables while responsive collapse hides it', async ({
    page
  }) => {
    await expect(page.getByTestId('toggle-sidebar')).toBeEnabled();

    await setStageWidth(page, 620);
    await expect(frame(page, 'sidebar')).toHaveAttribute(
      'data-frame-visible',
      'false'
    );
    // The user's request is still "open"; the toggle could change nothing
    // visible, so it is disabled rather than lying.
    await expect(page.getByTestId('toggle-sidebar')).toBeDisabled();

    await setStageWidth(page, 1100);
    await expect(page.getByTestId('toggle-sidebar')).toBeEnabled();
  });
});
