import { expect, test, type Page } from '@playwright/test';

import { SEED } from '../seed/seed';

const actorId = SEED.users[0].id;
const team = SEED.teams[0];

async function seedPreviousContractCache(
  page: Page,
  names: { readonly stale: string; readonly queued: string }
): Promise<{ readonly snapshotKey: string; readonly outboxKey: string }> {
  return page.evaluate(
    async ({ teamRow, staleName, queuedName }) => {
      const storeScope = localStorage.getItem('axle.storeId');
      if (!storeScope) throw new Error('Tracker did not create its cache scope.');
      const snapshotScope = `${storeScope}|snapshots:v1`;
      const outboxScope = `${storeScope}|outbox`;
      const snapshotKey = `${snapshotScope}|teams.all|{}`;
      const mutationId = 'm_0190b62e-0000-7000-8000-00000000beef';
      const outboxKey = `${outboxScope}|${mutationId}`;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('wheel:axle');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['subscriptions', 'outbox'], 'readwrite');
        transaction.objectStore('subscriptions').put({
          storageKey: snapshotKey,
          scope: snapshotScope,
          key: 'teams.all|{}',
          subscriptionId: 'old-contract-teams',
          seq: 99,
          rows: [{ ...teamRow, name: staleName }],
          order: [teamRow.id]
        });
        transaction.objectStore('outbox').put({
          storageKey: outboxKey,
          scope: outboxScope,
          mutationId,
          calls: [
            {
              mutation: 'teams.update',
              args: { teamId: teamRow.id, patch: { name: queuedName } },
              ids: []
            }
          ],
          preview: [
            {
              collection: 'teams',
              rowId: teamRow.id,
              value: { ...teamRow, name: queuedName }
            }
          ],
          enqueuedAt: Date.now()
        });
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      return { snapshotKey, outboxKey };
    },
    { teamRow: team, staleName: names.stale, queuedName: names.queued }
  );
}

async function cacheRowsExist(
  page: Page,
  keys: { readonly snapshotKey: string; readonly outboxKey: string }
): Promise<{ readonly snapshot: boolean; readonly outbox: boolean }> {
  return page.evaluate(async ({ snapshotKey, outboxKey }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wheel:axle');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (store: string, key: string) =>
      new Promise<boolean>((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).get(key);
        request.onsuccess = () => resolve(request.result !== undefined);
        request.onerror = () => reject(request.error);
      });
    const [snapshot, outbox] = await Promise.all([
      read('subscriptions', snapshotKey),
      read('outbox', outboxKey)
    ]);
    database.close();
    return { snapshot, outbox };
  }, keys);
}

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

test('a row-contract upgrade retires snapshots and replays the stable outbox', async ({ page }) => {
  const staleName = `${team.name} from an old row contract`;
  const queuedName = `${team.name} after queued replay`;
  const keys = await seedPreviousContractCache(page, { stale: staleName, queued: queuedName });

  let blockSockets = true;
  await page.routeWebSocket('**/sync/websocket**', (socket) => {
    if (blockSockets) return socket.close({ code: 1012, reason: 'contract-upgrade-test' });
    socket.connectToServer();
  });

  await page.reload();
  await expect.poll(() => cacheRowsExist(page, keys)).toEqual({ snapshot: false, outbox: true });
  await expect(page.getByText(staleName, { exact: true })).toHaveCount(0);

  blockSockets = false;
  await page.reload();
  await expect(page.getByTestId('sync-badge')).toContainText('connected');
  await expect(page.getByRole('heading', { name: queuedName })).toBeVisible();
  await expect.poll(() => cacheRowsExist(page, keys)).toEqual({ snapshot: false, outbox: false });
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
