/**
 * The component tree, driven by hand in a real browser.
 *
 * Every other test of the tree reaches its nodes through `reveal`, which
 * expands paths directly and never clicks a row or moves a pointer. That left
 * the two things a person actually does — clicking a row, hovering one —
 * untested, and both broke:
 *
 * `trackDebug()` is bumped by every service FIELD WRITE, not just by registry
 * changes. The tree's shape memo read it, and the rows write a field on hover
 * (the inspector's `highlighted`). So hovering the tree rebuilt the tree:
 * `instanceTree()` hands back fresh node objects, `<For>` tore down every row,
 * and the row under the pointer was detached mid-gesture. A click never
 * completed. A `mouseleave` never arrived, so the highlight stayed on forever.
 *
 * jsdom cannot show this — it has no pointer, and Playwright's own
 * "element was detached from the DOM, retrying" is what finally named it.
 */
import { expect, test } from '@playwright/test';

import { SEED } from '../seed/seed';

const actorId = SEED.users[0].id;
const team = SEED.teams[0];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('axle.actorId', id);
  }, actorId);
  await page.goto(`/teams/${team.id}/issues`);
  await expect(page.getByTestId('sync-badge')).toContainText('connected');
  await page.getByTestId('wheel-debug-toggle').click();
  await expect(page.getByTestId('wheel-pane-components')).toBeVisible();
});

test('a tree row opens and closes when a person clicks it', async ({ page }) => {
  const rows = page.getByTestId('wheel-pane-components').locator('[data-tree-row]');
  const closed = rows.filter({ hasText: /^▸/ }).first();

  const before = await rows.count();
  await closed.click();
  await expect(rows).not.toHaveCount(before);

  const opened = await rows.count();
  expect(opened).toBeGreaterThan(before);

  // And back. A row that only ever opened would still look "working".
  await rows.filter({ hasText: /^▾/ }).last().click();
  await expect(rows).not.toHaveCount(opened);
});

test('hovering a row highlights its component, and leaving clears it', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  const outlined = () => page.evaluate(() => document.querySelectorAll('[style*="outline"]').length);

  expect(await outlined()).toBe(0);

  await pane.locator('[data-tree-node] [data-tree-row]').first().hover();
  await expect.poll(outlined).toBeGreaterThan(0);

  // The bug: the hovered row was destroyed by its own highlight, so nothing
  // was left to receive `mouseleave` and the outline stayed on the app.
  await page.mouse.move(600, 400);
  await expect.poll(outlined).toBe(0);
});

test('the children prop lists the components it mounted, and they are reachable', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  const rows = pane.locator('[data-tree-row]');

  // `Frame:tracker-shell` takes children, which is the prop under test. Open
  // the tree until its row is on screen.
  for (let pass = 0; pass < 12; pass += 1) {
    if ((await rows.filter({ hasText: 'Frame:tracker-shell' }).count()) > 0) break;
    const closed = rows.filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }

  // The `children` prop lives in the sub-view now, with the rest of a
  // component's data.
  const shell = pane.locator('[data-tree-node="Frame:tracker-shell"]').first();
  await shell.getByTestId('wheel-tree-inspect').first().click();

  const links = pane.getByTestId('wheel-tree-child-link');
  await expect(links.first()).toBeVisible();

  // It used to read `<jsx children>` — a marker, not a lie: reading the getter
  // MOUNTS what it returns, and the tree re-renders on every registration, so
  // reading it here is a mount loop. These are the child nodes the tree
  // already had.
  const label = (await links.first().textContent())!.trim();
  expect(label).not.toBe('<jsx children>');
  expect(label.length).toBeGreaterThan(0);

  // And it is a way THROUGH the tree: pressing one reveals that component.
  await links.first().click();
  await expect(page.locator(`[data-tree-node="${label}"]`)).toHaveCount(1);
});

test('a row shows what a component is, and opens its data on request', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  const rows = pane.locator('[data-tree-row]');

  // The row says the component's name and nothing else it does not need to:
  // `view` is the icon's job, and the child count is the children themselves.
  const first = rows.filter({ hasText: /Shell|App/ }).first();
  await expect(first).not.toContainText('view');

  // Data is not in the tree until it is asked for — four groups under every
  // open node is what made the tree unscannable.
  await expect(pane.getByTestId('wheel-tree-detail')).toHaveCount(0);

  await pane.getByTestId('wheel-tree-inspect').first().click();
  const detail = pane.getByTestId('wheel-tree-detail');
  await expect(detail).toBeVisible();

  // And it closes again, from the row or from the panel.
  await detail.getByTestId('wheel-tree-detail-close').click();
  await expect(pane.getByTestId('wheel-tree-detail')).toHaveCount(0);
});

test('the name opens the component, the caret opens its children', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  const rows = pane.locator('[data-tree-row]');

  // Two questions, two targets. Pressing the name asks "what is this holding",
  // which is the same question the eye asks — and it must not also expand.
  const before = await rows.count();
  // A component row, not a bucket heading: only a component has data to open.
  const label = pane.locator('[data-tree-node] [data-tree-row] [data-tree-label]').first();
  await label.click();

  await expect(pane.getByTestId('wheel-tree-detail')).toBeVisible();
  expect(await rows.count()).toBe(before);
});

test('values carrying nothing fold away until asked for', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  for (let pass = 0; pass < 10; pass += 1) {
    const closed = pane.locator('[data-tree-row]').filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }

  // Open components until one has values to fold. A part like CheckboxRoot
  // reports a dozen keys and almost all of them say `false`: every one true,
  // and almost none of it what the panel was opened for.
  const toggles = pane.getByTestId('wheel-tree-inspect');
  const count = await toggles.count();
  let fold = pane.getByTestId('wheel-tree-unset-toggle');
  for (let index = 0; index < count; index += 1) {
    await toggles.nth(index).click();
    if ((await fold.count()) > 0) break;
  }
  await expect(fold.first()).toBeVisible();

  const detail = pane.getByTestId('wheel-tree-detail');
  const before = (await detail.innerText()).split('\n').length;
  await fold.first().click();

  // Nothing is hidden permanently — this is about what to read first.
  await expect
    .poll(async () => (await detail.innerText()).split('\n').length)
    .toBeGreaterThan(before);
});

test('the inspect toggle does not also expand the row it sits in', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  const rows = pane.locator('[data-tree-row]');

  const before = await rows.count();
  await pane.getByTestId('wheel-tree-inspect').first().click();

  // Two controls in one row: pressing one must not do the other's job.
  await expect(pane.getByTestId('wheel-tree-detail')).toBeVisible();
  expect(await rows.count()).toBe(before);
});

test('the tree and its detail scroll on their own, and the split is draggable', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');

  // Fill the tree, so there is genuinely more than fits.
  for (let pass = 0; pass < 8; pass += 1) {
    const closed = pane.locator('[data-tree-row]').filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }
  await pane.getByTestId('wheel-tree-inspect').first().click();

  const scroller = pane.getByTestId('wheel-tree-scroll');
  await expect(scroller).toBeVisible();

  // The tree scrolls INSIDE the pane. It used to be one box with everything
  // in it, so a big tree pushed the detail off the bottom and one scrollbar
  // chased two things.
  const box = await scroller.boundingBox();
  const paneBox = await pane.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(paneBox!.height + 1);

  // The detail is anchored under it and the split is draggable — up makes it
  // taller, because the detail is pinned to the bottom.
  const detail = pane.getByTestId('wheel-tree-detail');
  const before = (await detail.boundingBox())!.height;
  // Frame draws the handle: an ARIA separator, labelled by the region it
  // resizes. Nothing here hand-rolls a drag any more.
  // Frame's handle belongs to the region ABOVE the boundary it straddles, so
  // the split between tree and detail is the TREE's handle. Nothing here
  // hand-rolls a drag any more.
  // Frame's handle belongs to the region ABOVE the boundary it straddles, so
  // the split between tree and detail is the TREE's handle. Nothing here
  // hand-rolls a drag any more — including the keyboard path, which comes
  // with it.
  const handle = pane.locator('[data-wheel-frame-handle="wheel-debug-tree"]');
  await expect(handle).toBeVisible();
  await handle.focus();
  await handle.press('ArrowUp');

  // Shrinking the tree gives the space to the detail.
  await expect
    .poll(async () => Math.round((await detail.boundingBox())!.height))
    .toBeGreaterThan(Math.round(before));
});

test('leaves and branches line up, whatever their caret', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  for (let pass = 0; pass < 8; pass += 1) {
    const closed = pane.locator('[data-tree-row]').filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }

  // Group the rows by how deep they sit, and check every row at one depth
  // starts at the same x. A blank spacer standing in for a caret drifted:
  // `▸` and a box of the "same" width are not the same width, so leaves ended
  // up indented past the branches beside them.
  const byDepth = await pane.evaluate((root) => {
    const out: Record<number, number[]> = {};
    for (const row of root.querySelectorAll('[data-tree-row]')) {
      const label = row.querySelector('span:nth-of-type(2)');
      if (!label) continue;
      let depth = 0;
      for (let node = row.parentElement; node && node !== root; node = node.parentElement) depth += 1;
      (out[depth] ??= []).push(Math.round(label.getBoundingClientRect().x));
    }
    return out;
  });

  for (const xs of Object.values(byDepth)) {
    if (xs.length < 2) continue;
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(1);
  }
});

test('a childless row has no caret, and a long name is cut rather than wrapped', async ({ page }) => {
  const pane = page.getByTestId('wheel-pane-components');
  for (let pass = 0; pass < 8; pass += 1) {
    const closed = pane.locator('[data-tree-row]').filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }

  const rows = pane.locator('[data-tree-node] [data-tree-row]');
  // A caret that does nothing is worse than none, so a leaf shows a dot in
  // the same column instead — one element for both states, so nothing drifts.
  await expect(rows.filter({ hasText: /^·/ }).first()).toBeVisible();

  // And no row makes the pane scroll sideways.
  const overflowing = await pane.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(overflowing).toBe(false);
});

test('the panel nests components the way the registry does, on a cold load', async ({ page }) => {
  // Reload with the dock ALREADY open, so the panel renders during the mount
  // burst rather than after it. Nothing about a registration is final while
  // that burst runs: a parent comes from DOM containment, and the element
  // being registered is not in the document yet.
  //
  // The panel used to derive its tree from that half-built state and keep it —
  // rows parented under whichever sibling happened to be mounted when it
  // asked, sitting wrong until something else changed the registry, which
  // might be minutes away.
  await page.reload();
  const pane = page.getByTestId('wheel-pane-components');
  await expect(pane).toBeVisible();
  for (let pass = 0; pass < 12; pass += 1) {
    const closed = pane.locator('[data-tree-row]').filter({ hasText: /^▸/ }).first();
    if ((await closed.count()) === 0) break;
    await closed.click();
  }

  const wrong = await page.evaluate(() => {
    const bridge = (globalThis as Record<string, any>)['__wheel'];
    const pane = document.querySelector('[data-testid="wheel-pane-components"]')!;
    const misplaced: string[] = [];
    const walk = (nodes: readonly any[], parentId: string | null): void => {
      for (const node of nodes) {
        if (parentId) {
          const parent = pane.querySelector(`[data-tree-node="${CSS.escape(parentId)}"]`);
          const child = pane.querySelector(`[data-tree-node="${CSS.escape(node.instanceId)}"]`);
          // Only rows the panel is actually showing can be checked.
          if (parent && child && !parent.contains(child)) {
            misplaced.push(`${node.instanceId} should sit under ${parentId}`);
          }
        }
        walk(node.children ?? [], node.instanceId);
      }
    };
    walk(bridge.components(), null);
    return misplaced;
  });

  expect(wrong).toEqual([]);
});

test('hovering does not rebuild the tree under the pointer', async ({ page }) => {
  const row = page.getByTestId('wheel-pane-components').locator('[data-tree-node] [data-tree-row]').first();
  const handle = await row.elementHandle();

  await row.hover();
  await page.waitForTimeout(300);

  // The root cause, asserted directly: the very node that was hovered is still
  // the node in the document. If the tree rebuilds on hover it is not.
  expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
});
