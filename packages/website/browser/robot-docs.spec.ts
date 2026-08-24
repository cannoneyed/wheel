/**
 * The robot documentation is a SERVED surface: an agent handed
 * `https://wheel.dev/llms.txt` must be able to walk the whole tree from there
 * without a checkout. That means the index resolves, its links are site paths
 * rather than repo paths, and the pages behind them are real markdown.
 */
import { expect, test } from '@playwright/test';

test('llms.txt indexes a walkable robot docs tree', async ({ page }) => {
  const index = await page.request.get('/llms.txt');
  expect(index.status()).toBe(200);
  const source = await index.text();
  expect(source).toContain('# Wheel documentation');

  const links = [...source.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);
  expect(links.length).toBeGreaterThan(20);
  // Repo-relative links would 404 for an agent that never cloned anything.
  for (const href of links) {
    expect(href, 'every index link must be a site path').toMatch(/^\/robots\//);
  }

  // Every page the index names actually exists, generated API pages included.
  for (const href of links) {
    const page_ = await page.request.get(href);
    expect(page_.status(), `${href} is not served`).toBe(200);
  }
  expect(links.some((href) => href.startsWith('/robots/api/'))).toBe(true);
});

test('the landing page sends agents to the robot docs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('ctas').first().getByRole('link', { name: /agents/i })).toHaveAttribute(
    'href',
    '/llms.txt'
  );
});

test('a path escaping the robot tree serves no file', async ({ page }) => {
  const res = await page.request.get('/robots/../../../../etc/passwd', { maxRedirects: 0 });
  expect(await res.text()).not.toContain('root:');
});
