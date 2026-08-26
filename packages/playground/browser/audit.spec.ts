import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/audit.html');
  await expect(page.getByTestId('component-audit')).toBeVisible();
});

test('provides a focused audit path for all 156 components', async ({ page }) => {
  await expect(page.locator('[data-family]')).toHaveCount(156);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button');
  await expect(page.getByTestId('audit-preview').getByTestId('focus-button')).toBeVisible();

  await page.getByTestId('audit-search').fill('drawer');
  await expect(page.getByTestId('audit-filter-count')).toHaveText('2 of 156 components');
  await page.locator('[data-family="Drawer"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Drawer');
  await expect(page.getByLabel('Drawer usage')).toContainText("wheel/components");
  await expect(page.getByRole('heading', { name: 'Edge panel and swipe' })).toBeVisible();
});

test('opens the Button family at its top component', async ({ page }) => {
  await page.goto('/audit.html?direct#/dialog');
  const buttonFamily = page.locator('[data-component-family="Button"]');
  const buttonGroup = page.locator('[data-family="ButtonGroup"]');
  const familyChevron = buttonFamily.locator('[data-family-chevron]');

  await expect(buttonFamily).toHaveAttribute('aria-expanded', 'false');
  await expect(familyChevron).toHaveAttribute('data-family-chevron', 'right');
  await expect(page.locator('[data-family] [data-family-chevron]')).toHaveCount(0);
  expect(
    await page.locator('[data-family]').evaluateAll((links) =>
      links.every((link) => !link.textContent?.includes('›'))
    ),
  ).toBe(true);
  await expect(buttonGroup).toBeHidden();
  await buttonFamily.click();

  await expect(page).toHaveURL(/#\/button$/);
  await expect(buttonFamily).toHaveAttribute('aria-expanded', 'true');
  await expect(familyChevron).toHaveAttribute('data-family-chevron', 'up');
  await expect(buttonGroup).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button');
});

test('groups every multi-entry component family under one canonical header', async ({ page }) => {
  const families = [
    ['Button', 5],
    ['Checkbox', 4],
    ['Form', 2],
    ['Field', 2],
    ['Radio', 2],
    ['Select', 3],
    ['Combobox', 2],
    ['Avatar', 4],
    ['Code', 2],
    ['Disclosure', 2],
    ['Dialog', 3],
    ['Menu', 3],
    ['Anchored surfaces', 3],
    ['Navigation', 17],
    ['Bottom Sheet', 2],
    ['Breadcrumbs', 2],
    ['Chat', 15],
    ['Date Input', 3],
    ['Layout', 15],
    ['List', 2],
    ['Metadata List', 2],
    ['Resizable', 2],
    ['Stepper', 2],
    ['Text', 2],
    ['Token', 2],
    ['Utilities', 6],
  ] as const;

  for (const [name, count] of families) {
    const family = page.locator(`[data-component-family="${name}"]`);
    await expect(family).toHaveCount(1);
    if (await family.getAttribute('aria-expanded') === 'false') {
      await family.click();
    }
    const children = family.locator('xpath=..').locator('.component-audit__family-children [data-family]');
    await expect(children).toHaveCount(count);
    await expect(children.first()).toHaveAttribute('aria-current', 'page');
  }
});

test('documents Button with the reference page structure', async ({ page }) => {
  for (const heading of ['Usage', 'Props', 'Examples']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Stage', exact: true })).toHaveCount(0);
  await expect(page.getByText('Interactive preview', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('audit-preview').getByRole('heading', { name: 'Variants' })).toBeVisible();
  await expect(page.getByLabel('Button usage')).toContainText("wheel/components/button");
  await expect(page.locator('.component-reference > section > header h2')).toHaveText([
    'Usage',
    'Props',
    'Examples',
  ]);

  const variantButtons = page.getByTestId('audit-preview').getByLabel('Variants').getByRole('button');
  const primary = await variantButtons.nth(0).boundingBox();
  const secondary = await variantButtons.nth(1).boundingBox();
  expect(primary).not.toBeNull();
  expect(secondary).not.toBeNull();
  expect(secondary!.x - (primary!.x + primary!.width)).toBeGreaterThanOrEqual(10);
});

test('keeps overlay triggers sized to their content', async ({ page }) => {
  const triggerPages = [
    'alert-dialog',
    'dialog',
    'drawer',
    'menu',
    'popover',
    'preview-card',
    'tooltip',
  ];

  for (const slug of triggerPages) {
    await page.goto(`/audit.html?compact-trigger#/${slug}`);
    const preview = page.getByTestId('audit-preview');
    const previewBox = await preview.boundingBox();
    const triggerBox = await preview.locator('button, a, [role="button"]').first().boundingBox();

    expect(previewBox, `${slug} preview`).not.toBeNull();
    expect(triggerBox, `${slug} trigger`).not.toBeNull();
    expect(triggerBox!.width, `${slug} trigger width`).toBeLessThan(previewBox!.width * 0.75);
  }
});

test('uses Wheel components for playground chrome and highlights every code surface', async ({ page }) => {
  await expect(page.getByTestId('audit-search')).toHaveClass(/wheel-Input/);
  await expect(page.getByTestId('component-reference-tab')).toHaveClass(/wheel-Tabs-Tab/);
  await expect(page.getByTestId('audit-theme-light')).toHaveClass(/wheel-Toggle/);
  await expect(page.getByRole('link', { name: 'Next component' })).toHaveClass(/wheel-IconButton/);

  const usage = page.getByLabel('Button usage');
  await expect(usage).toHaveClass(/wheel-CodeBlock/);
  await expect(usage).toHaveCSS('font-family', /monospace|Menlo|Consolas|SFMono/);
  await expect(usage.locator('.wheel-Code').first()).toHaveCSS(
    'font-family',
    /monospace|Menlo|Consolas|SFMono/,
  );
  expect(await usage.locator('.wheel-Code-token').count()).toBeGreaterThan(2);
  await expect(usage.locator('.wheel-Code-token--tag').first()).toHaveText('Button');
  await expect(usage.locator('.wheel-Code-token--attr').first()).toHaveText('variant');

  const variantRow = page.locator('.component-reference__props-table tbody tr').filter({
    hasText: 'variant',
  }).first();
  await expect(variantRow.locator('.wheel-Code')).toHaveCount(3);
  await expect(variantRow.locator('.wheel-Code').nth(0)).not.toHaveAttribute('data-language');
  await expect(variantRow.locator('.wheel-Code').nth(0).locator('.wheel-Code-token')).toHaveCount(0);
  await expect(variantRow.locator('.wheel-Code').nth(1)).toHaveAttribute(
    'data-language',
    'typescript',
  );
  expect(
    await variantRow.locator('.wheel-Code-token').count(),
  ).toBeGreaterThan(1);

  const example = page.locator('.component-reference__example').first().locator('.wheel-CodeBlock');
  expect(await example.locator('.wheel-Code-token').count()).toBeGreaterThan(1);
});

test('documents every Button-family subtype', async ({ page }) => {
  const pages = [
    ['button-group', 'ButtonGroup'],
    ['icon-button', 'IconButton'],
    ['toggle', 'Toggle'],
    ['toggle-group', 'ToggleGroup'],
  ] as const;

  for (const [slug, name] of pages) {
    await page.goto(`/audit.html?reference#/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.locator('.component-reference > section > header h2')).toHaveText([
      'Usage',
      'Props',
      'Examples',
    ]);
    await expect(page.getByLabel(`${name} usage`)).toBeVisible();
  }
});

test('renders each written component spec and keeps the Spec tab across pages', async ({ page }) => {
  await page.getByTestId('component-spec-tab').click();
  await expect(page.getByTestId('component-spec-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Button specification' })).toBeVisible();
  await expect(page.getByText('packages/wheel/src/components/button/button.spec.md')).toBeVisible();
  await expect(page.getByText('Button renders a native button', { exact: false })).toBeVisible();

  await page.locator('[data-family="ButtonGroup"]').click();
  await expect(page.getByRole('heading', { name: 'Button Group specification' })).toBeVisible();
  await expect(page.getByTestId('component-spec-tab')).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('component-spec-tab').press('ArrowLeft');
  await expect(page.getByTestId('component-reference-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('audit-preview')).toBeVisible();
});

test('renders the completed Dialog reference and behavior spec', async ({ page }) => {
  await page.goto('/audit.html?dialog-spec#/dialog');
  await expect(page.getByLabel('Dialog usage')).toBeVisible();
  await page.getByTestId('component-spec-tab').click();

  await expect(page.getByRole('heading', { name: 'Dialog behavior specification' })).toBeVisible();
  await expect(page.getByTestId('component-spec-panel')).toContainText('dialog.spec.md');
  await expect(page.getByTestId('component-spec-panel')).toContainText('Entry is immediate');
});

test('renders reference and spec content for every component page', async ({ page }) => {
  test.setTimeout(240_000);
  const links = page.locator('.component-audit__index [data-family]');
  const targets = await links.evaluateAll((elements) => elements.map((element) => ({
    href: element.getAttribute('href'),
    name: element.getAttribute('data-family'),
  })));

  expect(targets).toHaveLength(156);
  for (const target of targets) {
    expect(target.href).not.toBeNull();
    await page.goto(`/audit.html?complete-reference${target.href}`);
    await page.getByTestId('component-reference-tab').click();
    await expect(page.locator('.component-audit__header h1')).toHaveText(target.name!);
    await expect(page.locator('.component-reference > section > header h2')).toHaveText([
      'Usage',
      'Props',
      'Examples',
    ]);
    await expect(page.getByLabel(`${target.name} usage`)).toBeVisible();
    await page.getByTestId('component-spec-tab').click();
    await expect(page.getByTestId('component-spec-panel').locator('.component-spec__source')).toBeVisible();
    await expect(page.getByText('Spec not written', { exact: true })).toHaveCount(0);
  }
});

test('matches every component stage without container-stretched controls', async ({ page }) => {
  test.setTimeout(300_000);
  const links = page.locator('.component-audit__index [data-family]');
  const targets = await links.evaluateAll((elements) => elements.map((element) => ({
    href: element.getAttribute('href'),
    name: element.getAttribute('data-family'),
  })));

  for (const target of targets) {
    expect(target.href).not.toBeNull();
    await page.goto(`/audit.html?visual-sweep${target.href}`);
    const preview = page.getByTestId('audit-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveScreenshot(
      `current-stage-${target.name!.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.png`,
      { animations: 'disabled' },
    );
  }
});

test('moves through Button-family children before the next family', async ({ page }) => {
  await page.goto('/audit.html?stepper#/button-group');

  await page.getByRole('link', { name: 'Next component' }).click();
  await expect(page).toHaveURL(/#\/icon-button$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IconButton');

  await page.getByRole('link', { name: 'Previous component' }).click();
  await expect(page).toHaveURL(/#\/button-group$/);
});

test('resets content scroll when a sidebar component is selected', async ({ page }) => {
  await page.goto('/audit.html?scroll-reset#/button');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.locator('[data-family="ButtonGroup"]').click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ButtonGroup');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('opens and documents every Checkbox-family entry', async ({ page }) => {
  await page.goto('/audit.html?checkbox-family#/dialog');
  const family = page.locator('[data-component-family="Checkbox"]');
  await expect(family).toHaveAttribute('aria-expanded', 'false');
  await family.click();
  await expect(page).toHaveURL(/#\/checkbox$/);

  const pages = [
    ['checkbox', 'Checkbox'],
    ['checkbox-group', 'CheckboxGroup'],
    ['checkbox-list', 'CheckboxList'],
    ['checkbox-list-item', 'CheckboxListItem'],
  ] as const;
  for (const [slug, name] of pages) {
    await page.goto(`/audit.html?checkbox-reference#/${slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    await expect(page.locator('.component-reference > section > header h2')).toHaveText([
      'Usage',
      'Props',
      'Examples',
    ]);
    await expect(page.getByLabel(`${name} usage`)).toBeVisible();
  }
});

test('moves through Checkbox-family children in sidebar order', async ({ page }) => {
  await page.goto('/audit.html?checkbox-stepper#/checkbox-group');
  await page.getByRole('link', { name: 'Next component' }).click();
  await expect(page).toHaveURL(/#\/checkbox-list$/);
  await page.getByRole('link', { name: 'Next component' }).click();
  await expect(page).toHaveURL(/#\/checkbox-list-item$/);
  await page.getByRole('link', { name: 'Previous component' }).click();
  await expect(page).toHaveURL(/#\/checkbox-list$/);
});

test('switches the focused preview between light, dark, and custom themes', async ({ page }) => {
  const preview = page.getByTestId('audit-preview');
  await expect(preview).toHaveAttribute('data-theme', 'light');

  await page.getByTestId('audit-theme-dark').click();
  await expect(preview).toHaveAttribute('data-theme', 'dark');

  await page.getByTestId('audit-theme-custom').click();
  await expect(preview).toHaveAttribute('data-theme', 'light');
  await expect(preview).toHaveClass(/component-audit__preview--custom/);
  await expect(preview.getByTestId('focus-button')).toHaveCSS('border-radius', '9999px');
});

test('contains demo actions and reports them without blocking component state', async ({ page }) => {
  const preview = page.getByTestId('audit-preview');

  await preview.getByTestId('focus-button').click();
  await expect(page.getByTestId('demo-snackbar')).toHaveText('primary triggered.');
  await expect(page.getByTestId('demo-snackbar')).toHaveClass(/wheel-Toast-Root/);

  const urlBeforeLink = page.url();
  await preview.getByTestId('button-link').click();
  await expect(page).toHaveURL(urlBeforeLink);
  await expect(page.getByTestId('demo-snackbar')).toHaveText('Link triggered.');

  await page.goto('/audit.html?feedback#/toggle');
  const toggle = page.getByTestId('audit-preview').getByRole('button', {
    name: 'Favorite',
    exact: true,
  });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('demo-snackbar')).toHaveText('Favorite — pressed: true');
});

test('reports Checkbox labels and resulting checked state', async ({ page }) => {
  await page.goto('/audit.html?checkbox-feedback#/checkbox');
  const checkbox = page.getByTestId('audit-preview').getByRole('checkbox', {
    name: 'Unchecked',
  });

  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('demo-snackbar')).toHaveText('Unchecked — checked: true');

  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('demo-snackbar')).toHaveText('Unchecked — checked: false');
});
