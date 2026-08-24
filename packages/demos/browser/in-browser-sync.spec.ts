/**
 * The in-browser sync mode (`?sync=local`): the full wheel server engine on
 * WASM SQLite in a Web Worker, RPC'd over postMessage. Needs a browser to be
 * honest about: worker module loading, the WASM fetch, and the real SyncClient
 * booting against the worker transport instead of the HTTP server.
 *
 * Deliberately does NOT talk to the bun demo server — passing proves the
 * demos are fully serverless in this mode.
 */
import { expect, test } from '@playwright/test';

test.describe('in-browser sync worker', () => {
  // behavior: SHELL-19
  test('todos boots, seeds, and round-trips a mutation with no sync server', async ({ page }) => {
    await page.goto('/todos?sync=local');

    // The badge reports the worker engine accepted the connection. Generous
    // timeout: first load fetches + instantiates the SQLite WASM module.
    await expect(page.getByTestId('sync-badge')).toContainText('connected', { timeout: 20_000 });

    // Seed rows flowed through subscribe → snapshot → cache → view.
    const input = page.getByPlaceholder('Add a todo… (press n)');
    await expect(input).toBeVisible();

    // A mutation round-trips: optimistic write renders, worker confirms.
    await input.fill('ship the in-browser engine');
    await input.press('Enter');
    await expect(page.getByText('ship the in-browser engine')).toBeVisible();
    await expect(page.getByTestId('sync-badge')).toContainText('connected');
  });
});
