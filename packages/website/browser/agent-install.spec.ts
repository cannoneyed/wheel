/**
 * The install block hands a reader's AGENT the setup, so three things have to
 * hold: the `{origin}` placeholder is always substituted (an agent has no page
 * to resolve a relative url against, and the raw token must never ship), the
 * COPIED text carries that absolute url even when the visible line is a short
 * human instruction, and the file it points at is actually served.
 *
 * The assertions below name STRUCTURE, never the prompt's wording — an owner
 * rewriting the copy in home.mdx must not turn this suite red.
 */
import { expect, test } from '@playwright/test';

test('every install block renders a substituted prompt it can copy', async ({
  page,
  context,
  baseURL
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  const blocks = page.getByTestId('install');
  const count = await blocks.count();
  expect(count).toBeGreaterThan(0);

  const origin = new URL(baseURL!).origin;
  for (let i = 0; i < count; i++) {
    const block = blocks.nth(i);
    const copy = block.getByTestId('agent-install-copy');
    const visible = await block.getByTestId('agent-install-prompt').innerText();
    const intended = (await copy.getAttribute('data-clipboard'))!;

    expect(visible, 'the {origin} placeholder must never reach the page').not.toContain('{origin}');
    expect(intended, 'the {origin} placeholder must never reach the clipboard').not.toContain(
      '{origin}'
    );
    // The point of the whole block: what an agent receives is fetchable.
    expect(
      intended,
      'the copied text must carry an absolute url — an agent cannot fetch a relative one'
    ).toContain(`${origin}/install.md`);

    await copy.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(intended);
    await expect(block.getByTestId('agent-install-link')).toHaveAttribute('href', '/install.md');
  }

  const res = await page.request.get('/install.md');
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain('# Set up wheel');
});

test('the copy button keeps its width when it says Copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const block = page.getByTestId('install').first();
  const copy = block.getByTestId('agent-install-copy');
  await block.scrollIntoViewIfNeeded();

  const before = (await copy.boundingBox())!.width;
  await copy.click();
  await expect(copy).toContainText('Copied');
  // Both labels share one grid cell, so the swap cannot resize the button and
  // shove the prompt sideways under the reader's cursor.
  expect((await copy.boundingBox())!.width).toBe(before);
});
