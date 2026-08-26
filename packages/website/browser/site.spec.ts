/**
 * wheel.dev end to end: landing renders, /docs serves the documentation, and
 * /demos serves the embedded demos app running the in-browser sync engine —
 * the full static-host topology with zero backend processes.
 */
import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  // All landing copy lives in packages/website/src/home.mdx. These assertions
  // deliberately name structure (test ids, section ids), never sentences — an
  // owner rewording the headline must never turn this suite red.
  test('renders the hero and the narrative sections', async ({ page }) => {
    await page.goto('/');
    const headline = page.getByTestId('hero').locator('h1');
    await expect(headline).toBeVisible();
    expect((await headline.innerText()).trim().length).toBeGreaterThan(0);
    // The MDX document produced the whole scroll, not just the hero.
    expect(await page.getByTestId('section').count()).toBeGreaterThan(5);
    await expect(page.getByTestId('install').first()).toBeVisible();
    await expect(page.locator('.site-topnav .site-alpha-chip')).toHaveText('alpha');
    // The live figure is a real app, not a picture — live-demo.spec.ts drives it.
    await expect(page.getByTestId('live-demo')).toBeVisible();
    await expect(page.locator('.site-topnav').getByRole('link', { name: 'Components' })).toHaveAttribute(
      'href',
      '/components/'
    );
    const debugPreview = page.getByTestId('debug-preview');
    const debugRows = debugPreview.locator('.debug-preview-row');
    await expect(debugRows).toHaveCount(3);
    await debugRows.nth(1).click();
    await expect(debugRows.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('feature-code')).toContainText('export const');
    // Snippets go through the shared shiki pipeline.
    await expect(page.locator('pre.shiki').first()).toBeVisible();
  });

  test('theme toggle flips and persists', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
    const chosen = await html.getAttribute('data-theme');
    expect(chosen === 'light' || chosen === 'dark').toBe(true);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', chosen!);
  });

});

test.describe('/docs', () => {
  // Same stance as the landing assertions: name structure, never sentences.
  // Group headings and page titles come from packages/docs/src/nav.ts and the
  // pages' frontmatter, and renaming either must not turn this suite red.
  test('serves the documentation shell with the grouped pages nav', async ({ page }) => {
    await page.goto('/docs/');
    const groups = page.locator('.sidebar .sidebar-group');
    // The shell is a client-rendered bundle and can reload while Vite settles.
    // Keep the count and each group assertion on Playwright's retrying locator
    // path, and give the first paint longer than the default expect timeout —
    // a cold docs bundle does not finish booting in five seconds.
    await expect(groups).toHaveCount(6, { timeout: 20_000 });
    // Every group is a micro-label heading plus at least one page row.
    for (let index = 0; index < 6; index += 1) {
      const group = groups.nth(index);
      await expect(group.locator('.sidebar-label')).toBeVisible();
      await expect(group.locator('a')).not.toHaveCount(0);
    }
    // Exactly one row is marked as the page you are on.
    await expect(page.locator('.sidebar a.active')).toHaveCount(1);
    await expect(page.locator('.content .alpha-banner')).toBeVisible();
    await expect(page.locator('.content h1').first()).toBeVisible();
    const contentLink = page.locator('.content a').first();
    const activeTocLink = page.locator('.page-toc-link.active').first();
    await expect(contentLink).toBeVisible();
    await expect(activeTocLink).toBeVisible();
    expect(await contentLink.evaluate((link) => getComputedStyle(link).color)).toBe(
      await activeTocLink.evaluate((link) => getComputedStyle(link).color)
    );
    await expect(page.locator('.site-topnav').getByRole('link', { name: 'Components' })).toHaveAttribute(
      'href',
      '/components/'
    );
  });

  test('switching pages starts the next one at the top', async ({ page }) => {
    await page.goto('/docs/#/getting-started');
    await expect(page.locator('.content h1')).toBeVisible();
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await page.locator('.sidebar a[href="#/components"]').click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('the on-this-page rail tracks scrolling and jumps on click', async ({ page }) => {
    await page.goto('/docs/#/components');
    const links = page.locator('.page-toc-link');
    // At the top of the page, the first heading is the one you are under.
    await expect(links.first()).toHaveClass(/active/);
    expect(await links.count()).toBeGreaterThan(2);
    const third = links.nth(2);
    await third.click();
    await expect(third).toHaveClass(/active/);
    const thirdHeading = page.locator('.content h2, .content h3').nth(2);
    await expect
      .poll(() =>
        thirdHeading.evaluate((heading) => {
          const top = heading.getBoundingClientRect().top;
          const scrollMargin = Number.parseFloat(getComputedStyle(heading).scrollMarginTop);
          return Math.abs(Math.round(top - scrollMargin));
        })
      )
      .toBe(0);
    // Scrolling back up hands the highlight back, so tracking is not click-only.
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(links.first()).toHaveClass(/active/);
  });

  test('example files render as highlighted code, not plain text', async ({ page }) => {
    await page.goto('/docs/#/getting-started');
    const example = page.locator('.source-example pre.shiki').first();
    await expect(example).toBeVisible();
    // Dual-theme shiki emits one styled span per token, both palettes as vars.
    expect(await example.locator('span[style]').count()).toBeGreaterThan(10);
  });
});

test.describe('/components', () => {
  test('serves all component families with stable deep links', async ({ page }) => {
    await page.goto('/components/#/dialog');
    await expect(page.getByTestId('component-audit')).toBeVisible();
    await expect(page.locator('.component-audit__index [data-family]')).toHaveCount(156);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dialog');
    await expect(page.locator('[data-family="Dialog"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByLabel('Dialog usage')).toContainText("import { Dialog } from 'wheel/components'");

    await page.getByTestId('audit-search').fill('drawer');
    await expect(page.getByTestId('audit-filter-count')).toHaveText('2 of 156 components');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.locator('[data-family="Drawer"]').click();
    await expect(page).toHaveURL(/\/components\/#\/drawer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Drawer');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('operates previews and keeps the site navigation', async ({ page }) => {
    await page.goto('/components/');
    const preview = page.getByTestId('audit-preview');
    await expect(preview.getByTestId('focus-button')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Props', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Examples', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Stage', exact: true })).toHaveCount(0);
    await preview.getByTestId('focus-button').click();
    await expect(page.getByTestId('demo-snackbar')).toHaveText('primary triggered.');
    const urlBeforeLink = page.url();
    await preview.getByTestId('button-link').click();
    await expect(page).toHaveURL(urlBeforeLink);
    await page.getByTestId('audit-theme-dark').click();
    await expect(preview).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.site-topnav').getByRole('link', { name: 'Components' })).toHaveClass(
      /site-active/
    );
    await expect(page.locator('.site-topnav').getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      '/docs/'
    );
  });

  test('opens a component family at its first child', async ({ page }) => {
    await page.goto('/components/#/dialog');
    const buttonFamily = page.locator('[data-component-family="Button"]');
    await expect(buttonFamily).toHaveAttribute('aria-expanded', 'false');

    await buttonFamily.click();

    await expect(page).toHaveURL(/\/components\/#\/button$/);
    await expect(page.locator('[data-family="ButtonGroup"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button');

    await page.locator('[data-family="ButtonGroup"]').click();
    await page.getByRole('link', { name: 'Next component' }).click();
    await expect(page).toHaveURL(/\/components\/#\/icon-button$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('IconButton');
    await expect(page.getByRole('heading', { name: 'Props', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Examples', exact: true })).toBeVisible();
  });

  test('opens the Checkbox family and keeps each entry on its own page', async ({ page }) => {
    await page.goto('/components/#/dialog');
    const family = page.locator('[data-component-family="Checkbox"]');
    await family.click();
    await expect(page).toHaveURL(/\/components\/#\/checkbox$/);
    await expect(page.locator('[data-family="CheckboxList"]')).toBeVisible();

    await page.locator('[data-family="CheckboxGroup"]').click();
    await page.getByRole('link', { name: 'Next component' }).click();
    await expect(page).toHaveURL(/\/components\/#\/checkbox-list$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('CheckboxList');
    await expect(page.getByLabel('CheckboxList usage')).toBeVisible();
  });

  test('reports Checkbox labels and resulting state', async ({ page }) => {
    await page.goto('/components/#/checkbox');
    const checkbox = page.getByTestId('audit-preview').getByRole('checkbox', {
      name: 'Unchecked',
    });

    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('demo-snackbar')).toHaveText('Unchecked — checked: true');
  });

  test('renders component Markdown specs', async ({ page }) => {
    await page.goto('/components/#/checkbox');
    await page.getByTestId('component-spec-tab').click();

    await expect(page.getByRole('heading', { name: 'Checkbox specification' })).toBeVisible();
    await expect(page.getByText('packages/wheel/src/components/checkbox/checkbox.spec.md')).toBeVisible();
    await expect(page.getByText('Every checkmark and mixed mark', { exact: false })).toBeVisible();
    expect(
      await page.locator('.component-spec__markdown .wheel-Code-token').count(),
    ).toBeGreaterThan(5);
  });
});

test.describe('/demos (embedded, in-browser sync)', () => {
  test('todos runs the worker engine under the /demos base path', async ({ page }) => {
    await page.goto('/demos/todos');
    await expect(page.getByTestId('sync-badge')).toContainText('connected', { timeout: 20_000 });
    const input = page.getByPlaceholder('Add a todo… (press n)');
    await input.fill('embedded and serverless');
    await input.press('Enter');
    await expect(page.getByText('embedded and serverless')).toBeVisible();
  });

  test('router navigation keeps the /demos prefix in the address bar', async ({ page }) => {
    await page.goto('/demos/');
    await page.getByTestId('nav-routing').click();
    await expect(page).toHaveURL('/demos/routing');
    // A cold load of the deep URL survives the SPA fallback.
    await page.reload();
    await expect(page.getByTestId('routing-demo')).toBeVisible();
  });

  test('the broken-link 404 stays inside the demos app, not the host site', async ({ page }) => {
    await page.goto('/demos/routing');
    // Deliberate full page load onto an unknown URL: the demos app's 404 must
    // answer — not wheel.dev's landing page.
    await page.getByTestId('nav-broken').click();
    await expect(page).toHaveURL('/demos/routing/does-not-exist');
    await expect(page.getByTestId('not-found')).toBeVisible();
  });
});
