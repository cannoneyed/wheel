import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/audit.html');
  await expect(page.getByTestId('component-audit')).toBeVisible();
});

test('provides a focused audit path for all 38 families', async ({ page }) => {
  await expect(page.locator('[data-family]')).toHaveCount(38);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button');
  await expect(page.getByTestId('audit-preview').getByTestId('focus-button')).toBeVisible();

  await page.getByTestId('audit-search').fill('drawer');
  await expect(page.getByTestId('audit-filter-count')).toHaveText('1 of 38 families');
  await page.locator('[data-family="Drawer"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Drawer');
  await expect(page.getByText("wheel/components/drawer", { exact: false })).toBeVisible();
  await expect(page.getByText('Pointer swipe dismissal')).toBeVisible();
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
