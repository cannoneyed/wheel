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

test('hovering does not rebuild the tree under the pointer', async ({ page }) => {
  const row = page.getByTestId('wheel-pane-components').locator('[data-tree-node] [data-tree-row]').first();
  const handle = await row.elementHandle();

  await row.hover();
  await page.waitForTimeout(300);

  // The root cause, asserted directly: the very node that was hovered is still
  // the node in the document. If the tree rebuilds on hover it is not.
  expect(await handle!.evaluate((node) => node.isConnected)).toBe(true);
});
