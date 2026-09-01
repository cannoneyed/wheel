import { expect, test, type APIRequestContext, type Page, type WebSocketRoute } from '@playwright/test';
import { openWheelClients, type WheelBrowserClient } from 'wheel/testing/playwright';

import { TEST_PORTS, testOrigin } from '../../../scripts/test-ports';

const controllerOrigin = testOrigin(TEST_PORTS.roundsController);

async function restart(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${controllerOrigin}/restart`, { data: { storage: 'reset' } });
  expect(response.ok()).toBe(true);
}

async function failQuery(request: APIRequestContext, name: string): Promise<void> {
  const response = await request.post(`${controllerOrigin}/fail-query`, { data: { name } });
  expect(response.ok()).toBe(true);
}

async function openRounds(page: Page, origin = ''): Promise<void> {
  await page.goto(origin || '/');
  await expect(page.getByTestId('connection-state')).toHaveText('connected');
  await expect(page.getByTestId('items-status')).toHaveText('items: live');
}

function isMutation(message: string | Buffer): boolean {
  if (typeof message !== 'string') return false;
  try {
    return (JSON.parse(message) as { type?: unknown }).type === 'mutateGroup';
  } catch {
    return false;
  }
}

function isCheckpoint(message: string | Buffer): boolean {
  if (typeof message !== 'string') return false;
  try {
    const parsed = JSON.parse(message) as { type?: unknown; event?: { type?: unknown } };
    return parsed.type === 'event' && parsed.event?.type === 'checkpoint';
  } catch {
    return false;
  }
}

async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('wheel:rounds');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction('outbox', 'readonly');
          const count = transaction.objectStore('outbox').count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => resolve(count.result);
        };
      })
  );
}

async function routeOfflineControl(page: Page): Promise<{ disconnect(): Promise<void>; reconnect(): Promise<void> }> {
  let online = true;
  let active: { socket: WebSocketRoute; server: WebSocketRoute } | null = null;
  await page.routeWebSocket('**/sync/websocket**', async (socket) => {
    if (!online) {
      await socket.close({ code: 1001, reason: 'test_offline' });
      return;
    }
    const server = socket.connectToServer();
    active = { socket, server };
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => socket.send(message));
  });
  return {
    async disconnect() {
      online = false;
      await active?.socket.close({ code: 1001, reason: 'test_offline' });
      active = null;
    },
    async reconnect() {
      online = true;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
    }
  };
}

async function checkpointGate(page: Page): Promise<{
  arm(): Promise<void>;
  release(): void;
  disconnect(): Promise<void>;
}> {
  let armed = false;
  let resolveHeld = (): void => {};
  let held: { socket: WebSocketRoute; server: WebSocketRoute; message: string | Buffer } | null = null;
  await page.routeWebSocket('**/sync/websocket**', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (armed && isCheckpoint(message)) {
        armed = false;
        held = { socket, server, message };
        resolveHeld();
        return;
      }
      socket.send(message);
    });
  });
  return {
    arm() {
      armed = true;
      return new Promise<void>((resolve) => {
        resolveHeld = resolve;
      });
    },
    release() {
      if (!held) throw new Error('No checkpoint is held.');
      held.socket.send(held.message);
      held = null;
    },
    async disconnect() {
      if (!held) throw new Error('No checkpoint is held.');
      const current = held;
      held = null;
      await current.socket.close({ code: 1001, reason: 'checkpoint_disconnect' });
    }
  };
}

async function holdNextMutation(page: Page): Promise<{ held: Promise<void>; release(): void }> {
  let release = (): void => {};
  let resolveHeld!: () => void;
  const held = new Promise<void>((resolve) => {
    resolveHeld = resolve;
  });
  let captured = false;
  await page.routeWebSocket('**/sync/websocket**', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (!captured && isMutation(message)) {
        captured = true;
        release = () => server.send(message);
        resolveHeld();
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => socket.send(message));
  });
  return { held, release: () => release() };
}

test.beforeEach(async ({ request }) => restart(request));

test('an empty query stays live @behavior:conv-empty', async ({ page }) => {
  await openRounds(page);
  await page.getByTestId('checklist-checklist_empty').click();
  await expect(page.getByTestId('items-status')).toHaveText('items: live');
  await expect(page.getByTestId('empty-items')).toBeVisible();
});

test('an optimistic note rolls back on rejection @behavior:cmd-optimistic @behavior:cmd-reject', async ({ page }) => {
  const fault = await holdNextMutation(page);
  await openRounds(page);
  const note = 'This note exceeds the server-owned field limit by enough characters to force a business rejection.';
  await page.getByTestId('note-item_exit').fill(note);
  await page.getByTestId('save-item_exit').click();
  await fault.held;
  await expect(page.getByTestId('note-item_exit')).toHaveValue(note);
  await expect(page.getByTestId('outbox-state')).toContainText('pending 1');
  fault.release();
  await expect(page.getByTestId('mutation-state')).toHaveText('rejected');
  await expect(page.getByTestId('note-item_exit')).toHaveValue('Clear');
  await expect(page.getByTestId('mutation-message')).toContainText('80 characters or fewer');
});

test('a peer archive orphans a held edit @behavior:cmd-orphan', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Rounds browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [field, manager] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    const fault = await holdNextMutation(field.page);
    await Promise.all([openRounds(field.page, baseURL), openRounds(manager.page, baseURL)]);
    await field.page.getByTestId('note-item_exit').fill('Pending field edit');
    await field.page.getByTestId('save-item_exit').click();
    await fault.held;

    await manager.page.getByTestId('archive-site').click();
    await expect(field.page.getByTestId('item-item_exit')).toHaveCount(0);
    fault.release();
    await expect(field.page.getByTestId('mutation-state')).toHaveText('orphaned');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('an initial query failure surfaces and reload recovers @behavior:status-error', async ({ page, request }) => {
  await failQuery(request, 'items.byChecklist');
  await page.goto('/');
  await expect(page.getByTestId('items-status')).toHaveText('items: error');
  await expect(page.getByTestId('item-item_exit')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('items-status')).toHaveText('items: live');
  await expect(page.getByTestId('item-item_exit')).toBeVisible();
});

test('a stale query keeps rows and later returns live @behavior:status-stale @behavior:status-live', async ({
  browser,
  baseURL,
  request,
  page
}) => {
  if (!baseURL) throw new Error('Rounds browser tests need a base URL.');
  const [peer] = await openWheelClients(browser, 1);
  try {
    await openRounds(page);
    await openRounds(peer.page, baseURL);
    await failQuery(request, 'items.byChecklist');

    await peer.page.getByTestId('note-item_exit').fill('Peer update one');
    await peer.page.getByTestId('save-item_exit').click();
    await expect(page.getByTestId('items-status')).toHaveText('items: stale');
    await expect(page.getByTestId('note-item_exit')).toHaveValue('Clear');

    await peer.page.getByTestId('note-item_exit').fill('Peer update two');
    await peer.page.getByTestId('save-item_exit').click();
    await expect(page.getByTestId('items-status')).toHaveText('items: live');
    await expect(page.getByTestId('note-item_exit')).toHaveValue('Peer update two');
  } finally {
    await peer.context.close();
  }
});

test('the controller restarts the child and preserves storage', async ({ page, request }) => {
  await openRounds(page);
  await page.getByTestId('note-item_exit').fill('Stored across restart');
  await page.getByTestId('save-item_exit').click();
  await expect(page.getByTestId('mutation-state')).toHaveText('confirmed');
  const response = await request.post(`${controllerOrigin}/restart`, { data: { storage: 'preserve' } });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId('items-status')).toHaveText('items: live');
  await expect(page.getByTestId('note-item_exit')).toHaveValue('Stored across restart');
});

test('an offline preview survives reload and delivers once @behavior:dur-preview @behavior:dur-outbox', async ({
  browser,
  page,
  baseURL
}) => {
  if (!baseURL) throw new Error('Rounds browser tests need a base URL.');
  const network = await routeOfflineControl(page);
  const [observer] = await openWheelClients(browser, 1);
  try {
    await openRounds(page);
    await openRounds(observer.page, baseURL);
    await network.disconnect();
    await expect(page.getByTestId('connection-state')).not.toHaveText('connected');

    await page.getByTestId('note-item_exit').fill('Offline inspection');
    await page.getByTestId('save-item_exit').click();
    await expect.poll(() => outboxCount(page)).toBe(1);
    await page.reload();
    await expect(page.getByTestId('note-item_exit')).toHaveValue('Offline inspection');
    await expect(page.getByTestId('save-state')).toHaveText('Saved locally');

    await network.reconnect();
    await expect(page.getByTestId('connection-state')).toHaveText('connected');
    await expect.poll(() => outboxCount(page)).toBe(0);
    await expect(observer.page.getByTestId('note-item_exit')).toHaveValue('Offline inspection');
    await expect(observer.page.getByTestId('revision-item_exit')).toHaveText('revision 1');
  } finally {
    await observer.context.close();
  }
});

test('an unchanged mutation clears only after checkpoint @behavior:dur-checkpoint', async ({ page }) => {
  const gate = await checkpointGate(page);
  await openRounds(page);
  await page.getByTestId('pass-item_exit').click();
  await expect(page.getByTestId('status-item_exit')).toHaveText('passed');
  await expect.poll(() => outboxCount(page)).toBe(0);

  const held = gate.arm();
  await page.getByTestId('pass-item_exit').click();
  await held;
  await expect.poll(() => outboxCount(page)).toBe(1);
  gate.release();
  await expect.poll(() => outboxCount(page)).toBe(0);
  await expect(page.getByTestId('status-item_exit')).toHaveText('passed');
});

test('an acknowledged command survives a pre-checkpoint disconnect @behavior:dur-generation', async ({
  browser,
  page,
  baseURL
}) => {
  if (!baseURL) throw new Error('Rounds browser tests need a base URL.');
  const gate = await checkpointGate(page);
  const [observer] = await openWheelClients(browser, 1);
  try {
    await openRounds(page);
    await openRounds(observer.page, baseURL);
    const held = gate.arm();
    await page.getByTestId('note-item_exit').fill('Ack before checkpoint');
    await page.getByTestId('save-item_exit').click();
    await held;
    await expect(page.getByTestId('mutation-state')).toHaveText('confirmed');
    await expect.poll(() => outboxCount(page)).toBe(1);
    await gate.disconnect();

    await expect(page.getByTestId('connection-state')).not.toHaveText('connected');
    await expect(page.getByTestId('connection-state')).toHaveText('connected');
    await expect(page.getByTestId('mutation-state')).toHaveText('confirmed');
    await page.getByTestId('pass-item_alarm').click();
    await expect.poll(() => outboxCount(page)).toBe(0);
    await expect(observer.page.getByTestId('note-item_exit')).toHaveValue('Ack before checkpoint');
    await expect(observer.page.getByTestId('revision-item_exit')).toHaveText('revision 1');
  } finally {
    await observer.context.close();
  }
});
