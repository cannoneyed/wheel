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
  await expect(page.getByRole('heading', { name: team.name })).toBeVisible();
});

test('boot, navigation, issue edit, keyboard, dialog focus, and offline state', async ({
  page,
  context
}) => {
  const issueTitle = page.locator('[data-testid^="issue-title-"]').first();
  await expect(issueTitle).toBeVisible();

  await page.getByRole('button', { name: 'Board', exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/board$`));
  await page.getByRole('button', { name: new RegExp(team.name) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/teams/${team.id}/issues$`));

  const original = (await issueTitle.textContent())?.trim() ?? '';
  const edited = `${original} [browser smoke]`;
  await issueTitle.dblclick();
  const editInput = page.locator('[data-testid^="issue-title-input-"]').first();
  await expect(editInput).toBeFocused();
  await editInput.fill(edited);
  await editInput.press('Enter');
  await expect(page.getByText(edited, { exact: true })).toBeVisible();

  await page.keyboard.press('j');
  await page.keyboard.press('e');
  await expect(
    page.locator('[data-testid^="issue-title-input-"]').first()
  ).toBeFocused();
  await page.keyboard.press('Escape');

  await page.keyboard.press('c');
  const overlay = page.getByTestId('wheel-dialog-overlay');
  await expect(overlay).toBeVisible();
  const composerTitle = overlay.getByPlaceholder('Issue title');
  await expect(composerTitle).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(
    overlay.getByRole('button', { name: 'Cancel' })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(composerTitle).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  await context.setOffline(true);
  await expect(page.getByTestId('sync-badge')).toContainText('offline', {
    timeout: 15_000
  });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('sync-badge')).toContainText('connected', {
    timeout: 15_000
  });
});

test('framing resizes, restores, responds to its container, and accepts touch input', async ({
  page
}) => {
  const sidebar = page.locator('[data-wheel-frame="tracker-sidebar"]');
  const shellHandle = page.locator(
    '[data-wheel-frame-handle="tracker-sidebar"]'
  );
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('data-frame-visible', 'true');
  await expect(shellHandle).toHaveAttribute('role', 'separator');
  await expect(shellHandle).toHaveAttribute('aria-orientation', 'vertical');

  const secondary = page.locator('[data-wheel-frame="tracker-secondary"]');
  await page.getByRole('button', { name: '◫ Split' }).click();
  await expect(secondary).toBeVisible();
  await page.getByRole('button', { name: '◫ Close split' }).click();
  await expect(secondary).toHaveCount(0);

  const initialWidth = (await sidebar.boundingBox())!.width;
  const handleBox = (await shellHandle.boundingBox())!;
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 60,
    handleBox.y + handleBox.height / 2
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeGreaterThan(initialWidth + 40);
  const resizedWidth = (await sidebar.boundingBox())!.width;

  // Geometry is persisted per frame id, not per app snapshot.
  const stored = await page.evaluate(() =>
    localStorage.getItem('wheel.layout:frames')
  );
  expect(stored).toContain('tracker-sidebar');

  await page.reload();
  await expect(page.getByTestId('sync-badge')).toContainText('connected');
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeCloseTo(resizedWidth, 0);

  // collapseBelow hides the frame without touching the user's open choice.
  await page.setViewportSize({ width: 700, height: 720 });
  await expect(sidebar).toBeHidden();
  await expect(sidebar).toHaveAttribute('data-frame-visible', 'false');
  await expect(sidebar).toHaveAttribute('data-frame-open', 'true');
  await page.setViewportSize({ width: 1100, height: 720 });
  await expect(sidebar).toBeVisible();
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeCloseTo(resizedWidth, 0);

  const widthBeforeKeyboard = (await sidebar.boundingBox())!.width;
  await shellHandle.focus();
  await shellHandle.press('ArrowRight');
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeGreaterThan(widthBeforeKeyboard + 5);

  const widthBeforeTouch = (await sidebar.boundingBox())!.width;
  const currentHandle = (await shellHandle.boundingBox())!;
  const touchX = currentHandle.x + currentHandle.width / 2;
  const touchY = currentHandle.y + currentHandle.height / 2;
  await shellHandle.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: touchX,
    clientY: touchY
  });
  await shellHandle.dispatchEvent('pointermove', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    buttons: 1,
    clientX: touchX + 30,
    clientY: touchY
  });
  await shellHandle.dispatchEvent('pointerup', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: touchX + 30,
    clientY: touchY
  });
  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeGreaterThan(widthBeforeTouch + 20);
});
