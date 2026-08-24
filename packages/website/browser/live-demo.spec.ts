/**
 * The landing page's live figure, end to end: two real sync clients, one real
 * wheel engine on WASM SQLite in a worker, no server process anywhere.
 *
 * This is the one test that would catch the figure quietly becoming a picture.
 * It asserts the whole local-first claim the section makes: a write in one
 * pane reaches the other, a write made with the wire cut still lands locally
 * and does NOT reach the other, and plugging back in converges them.
 */
import { expect, test } from '@playwright/test';

test('two panes, one server, unplug and converge', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const fig = page.getByTestId('live-demo');
  await expect(fig).toBeVisible();

  const panes = fig.locator('.live-pane');
  await expect(panes).toHaveCount(2);
  const a = panes.nth(0);
  const b = panes.nth(1);

  // Both panes finish booting (the loading note clears).
  await expect(a.locator('.stale-note')).toHaveCount(0, { timeout: 30_000 });
  await expect(b.locator('.stale-note')).toHaveCount(0, { timeout: 30_000 });

  // Type in A, see it in B.
  const stamp = `hello-${Date.now()}`;
  await a.locator('input[type=text]').fill(stamp);
  await a.locator('input[type=text]').press('Enter');
  await expect(b.getByText(stamp)).toBeVisible({ timeout: 15_000 });

  // Unplug B, write in B while it is offline.
  await b.getByRole('switch').click();
  await expect(b.locator('.live-offline')).toHaveText('offline');
  const offlineItem = `offline-${Date.now()}`;
  await b.locator('input[type=text]').fill(offlineItem);
  await b.locator('input[type=text]').press('Enter');
  await expect(b.getByText(offlineItem)).toBeVisible();
  // A must NOT have it yet.
  await expect(a.getByText(offlineItem)).toHaveCount(0);

  // Plug B back in; A converges.
  await b.getByRole('switch').click();
  await expect(a.getByText(offlineItem)).toBeVisible({ timeout: 15_000 });

  expect(errors, errors.join('\n')).toEqual([]);
});
