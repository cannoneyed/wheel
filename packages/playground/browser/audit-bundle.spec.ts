import { expect, test } from '@playwright/test';

const auditUrl = new URL('../dist-audit/audit.html', import.meta.url).href;

test('runs the frozen component audit bundle', async ({ page }) => {
  await page.goto(auditUrl);

  await expect(page.getByTestId('component-audit')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Button');
  await expect(page.locator('[data-family]')).toHaveCount(156);

  await page.locator('[data-component-family="Dialog"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dialog');
  await expect(page.getByLabel('Dialog usage')).toContainText('wheel/components');
});
