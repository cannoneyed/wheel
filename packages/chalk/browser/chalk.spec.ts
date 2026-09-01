import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';
import { wheelDriver } from 'wheel/testing';
import { openWheelClients, type WheelBrowserClient } from 'wheel/testing/playwright';

const blocks = (page: Page) => page.locator('.tiptap > [data-block-id]');
const undo = (page: Page) => page.locator('button[title="Undo (mod+z)"]');
const redo = (page: Page) => page.locator('button[title="Redo (mod+shift+z)"]');

async function openChalk(page: Page, origin = ''): Promise<void> {
  await page.goto(origin || '/');
  await expect(page.getByTestId('connection-state')).toHaveText('connected');
  await expect(page.getByTestId('docs-status')).toHaveText('documents: live');
  await expect(page.getByTestId('blocks-status')).toHaveText('blocks: live');
}

async function createDocument(page: Page): Promise<string> {
  const prior = await page.getByTestId('active-doc-id').textContent();
  await page.getByTestId('new-document').click();
  await expect(page.getByTestId('active-doc-id')).not.toHaveText(prior ?? '');
  const docId = (await page.getByTestId('active-doc-id').textContent()) ?? '';
  expect(docId).toMatch(/^doc_/);
  await expect(blocks(page)).toHaveCount(1);
  await wheelDriver(page).settle();
  const title = `Proof ${docId.slice(-8)}`;
  await page.getByTestId('document-title').fill(title);
  await page.getByTestId('document-title').press('Tab');
  await expect(page.getByTestId(`doc-${docId}`)).toContainText(title);
  await wheelDriver(page).settle();
  return docId;
}

async function selectDocument(page: Page, docId: string): Promise<void> {
  await page.getByTestId(`doc-${docId}`).click();
  await expect(page.getByTestId('active-doc-id')).toHaveText(docId);
  await expect(page.getByTestId('blocks-status')).toHaveText('blocks: live');
}

async function typeAtEnd(page: Page, text: string, settle = true): Promise<void> {
  const block = blocks(page).first();
  await block.click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await expect(block).toContainText(text);
  await expect(undo(page)).toBeEnabled({ timeout: 5_000 });
  if (settle) await wheelDriver(page).settle();
}

function isMutation(message: string | Buffer): boolean {
  if (typeof message !== 'string') return false;
  try {
    return (JSON.parse(message) as { type?: unknown }).type === 'mutateGroup';
  } catch {
    return false;
  }
}

async function mutationGate(page: Page): Promise<{
  arm(): Promise<void>;
  release(): void;
}> {
  let armed = false;
  let heldMessage: string | Buffer | null = null;
  let serverRoute: WebSocketRoute | null = null;
  let resolveHeld = (): void => {};
  await page.routeWebSocket('**/sync/websocket**', (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      if (armed && heldMessage === null && isMutation(message)) {
        armed = false;
        heldMessage = message;
        serverRoute = server;
        resolveHeld();
        return;
      }
      server.send(message);
    });
    server.onMessage((message) => socket.send(message));
  });
  return {
    arm() {
      armed = true;
      return new Promise<void>((resolve) => {
        resolveHeld = resolve;
      });
    },
    release() {
      if (heldMessage === null || serverRoute === null) throw new Error('No mutation is held.');
      serverRoute.send(heldMessage);
      heldMessage = null;
      serverRoute = null;
    }
  };
}

function causeOf(write: Record<string, unknown>): Record<string, unknown> {
  return write.cause as Record<string, unknown>;
}

async function blockRows(page: Page, docId: string): Promise<readonly Record<string, unknown>[]> {
  const collections = await wheelDriver(page).collections();
  return (collections.find((entry) => entry.collection === 'blocks')?.rows ?? [])
    .filter((row) => row.docId === docId)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function docRow(page: Page, docId: string): Promise<Record<string, unknown> | undefined> {
  const collections = await wheelDriver(page).collections();
  return collections.find((entry) => entry.collection === 'docs')?.rows.find((row) => row.id === docId);
}

test.describe.configure({ timeout: 60_000 });

test('a commented split publishes once and undoes as one command @behavior:cmd-group-atomic @behavior:cmd-group-undo', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Chalk browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [author, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([openChalk(author.page, baseURL), openChalk(peer.page, baseURL)]);
    const docId = await createDocument(author.page);
    await expect(peer.page.getByTestId(`doc-${docId}`)).toBeVisible();
    await selectDocument(peer.page, docId);
    await typeAtEnd(author.page, 'commented text');
    await expect(blocks(peer.page).first()).toHaveText('commented text');

    await author.page.getByTestId('comment-body').fill('Keep this anchor');
    await author.page.getByTestId('add-comment').click();
    await expect(author.page.getByText('Keep this anchor')).toBeVisible();
    await expect(peer.page.getByText('Keep this anchor')).toBeVisible();
    await Promise.all([author.wheel.settle(), peer.wheel.settle()]);

    const metadataBefore = await docRow(author.page, docId);
    const authorBefore = (await author.wheel.writes(200)).length;
    const peerBefore = (await peer.wheel.writes(200)).length;
    await author.page.getByTestId('split-commented').click();
    await expect(blocks(author.page)).toHaveCount(2);
    await expect(blocks(peer.page)).toHaveCount(2);
    await expect(author.page.getByTestId('summary-blocks')).toHaveText('2 blocks');
    expect((await docRow(peer.page, docId))?.version).toBe(Number(metadataBefore?.version) + 1);

    const local = (await author.wheel.writes(200)).slice(authorBefore)
      .filter((write) => causeOf(write).kind === 'optimistic');
    expect(local.length).toBeGreaterThanOrEqual(4);
    expect(new Set(local.map((write) => causeOf(write).mutationId)).size).toBe(1);
    expect(causeOf(local[0]).mutations).toEqual([
      'blocks.edit',
      'blocks.add',
      'comments.reanchor',
      'docs.edit'
    ]);

    const remote = (await peer.wheel.writes(200)).slice(peerBefore)
      .filter((write) => causeOf(write).kind === 'sync-apply');
    expect(remote.length).toBeGreaterThanOrEqual(4);
    expect(new Set(remote.map((write) => causeOf(write).seq)).size).toBe(1);

    await undo(author.page).click();
    await expect(blocks(author.page)).toHaveCount(1);
    await expect(blocks(peer.page)).toHaveCount(1);
    await expect(blocks(peer.page).first()).toHaveText('commented text');
    await expect(peer.page.getByTestId('summary-blocks')).toHaveText('1 blocks');
    await expect(peer.page.getByText('Keep this anchor')).toBeVisible();
    expect(await docRow(peer.page, docId)).toEqual(metadataBefore);
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('a pending edit rebases over a peer edit @behavior:cmd-rebase', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Chalk browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [pending, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    const gate = await mutationGate(pending.page);
    await Promise.all([openChalk(pending.page, baseURL), openChalk(peer.page, baseURL)]);
    const docId = await createDocument(pending.page);
    await expect(peer.page.getByTestId(`doc-${docId}`)).toBeVisible();
    await selectDocument(peer.page, docId);

    const held = gate.arm();
    await typeAtEnd(pending.page, 'pending edit', false);
    await held;
    await typeAtEnd(peer.page, 'peer edit');
    await expect(blocks(pending.page).first()).toHaveText('pending edit');
    gate.release();

    await expect(blocks(peer.page).first()).toHaveText('pending edit');
    await expect(pending.page.getByTestId('edit-state')).toHaveText('confirmed');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('undo and redo survive a pending peer edit @behavior:cmd-undo-redo', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Chalk browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [author, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    const gate = await mutationGate(peer.page);
    await Promise.all([openChalk(author.page, baseURL), openChalk(peer.page, baseURL)]);
    const docId = await createDocument(author.page);
    await expect(peer.page.getByTestId(`doc-${docId}`)).toBeVisible();
    await selectDocument(peer.page, docId);
    await typeAtEnd(author.page, 'A');
    await expect(blocks(peer.page).first()).toHaveText('A');

    const held = gate.arm();
    await typeAtEnd(peer.page, 'B', false);
    await held;
    await undo(author.page).click();
    await expect(blocks(author.page).first()).toHaveText('');
    await author.wheel.settle();
    gate.release();
    await expect(blocks(author.page).first()).toHaveText('AB');
    await expect(redo(author.page)).toBeEnabled();
    await redo(author.page).click();
    await expect(blocks(author.page).first()).toHaveText('A');
    await expect(blocks(peer.page).first()).toHaveText('A');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('a peer-deleted block orphans a held Chalk edit', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Chalk browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [pending, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    const gate = await mutationGate(pending.page);
    await Promise.all([openChalk(pending.page, baseURL), openChalk(peer.page, baseURL)]);
    const docId = await createDocument(pending.page);
    await expect(peer.page.getByTestId(`doc-${docId}`)).toBeVisible();
    await selectDocument(peer.page, docId);

    const held = gate.arm();
    await typeAtEnd(pending.page, 'orphan me', false);
    await held;
    await blocks(peer.page).first().click({ button: 'right' });
    await peer.page.getByTestId('wheel-context-menu').getByRole('menuitem', { name: 'Delete block' }).click();
    await peer.page.getByTestId('wheel-dialog-overlay').getByRole('button', { name: 'Confirm' }).click();
    await expect(blocks(pending.page)).toHaveCount(0);
    gate.release();
    await expect(pending.page.getByTestId('edit-state')).toHaveText('orphaned');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('a server-only order change reaches the editor without row changes @behavior:conv-order-only', async ({ page }) => {
  await openChalk(page);
  const docId = await createDocument(page);
  await page.getByTestId('add-block').click();
  await page.getByTestId('add-block').click();
  await expect(blocks(page)).toHaveCount(3);
  await wheelDriver(page).settle();

  const beforeOrder = await blocks(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')));
  const beforeRows = await blockRows(page, docId);
  const beforeWrites = (await wheelDriver(page).writes(200)).length;
  await page.getByTestId('reverse-order').click();
  await expect.poll(() => blocks(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id'))))
    .toEqual([...beforeOrder].reverse());
  expect(await blockRows(page, docId)).toEqual(beforeRows);
  expect((await wheelDriver(page).writes(200)).length).toBe(beforeWrites);
});

test('presence clears on reload and never becomes stored data @behavior:presence-ephemeral', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Chalk browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [writer, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([openChalk(writer.page, baseURL), openChalk(peer.page, baseURL)]);
    const docId = await createDocument(writer.page);
    await expect(peer.page.getByTestId(`doc-${docId}`)).toBeVisible();
    await selectDocument(peer.page, docId);
    await blocks(writer.page).first().click();
    await expect(peer.page.getByTestId('peer-count')).toHaveText('1 peers');

    const names = (await writer.wheel.collections()).map((entry) => entry.collection);
    expect(names).not.toContain('editor');
    await writer.page.reload();
    await expect(peer.page.getByTestId('peer-count')).toHaveText('0 peers');
    await openChalk(writer.page);
    await selectDocument(writer.page, docId);
    await expect(peer.page.getByTestId('peer-count')).toHaveText('0 peers');
    await blocks(writer.page).first().click();
    await expect(peer.page.getByTestId('peer-count')).toHaveText('1 peers');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('metadata, summaries, comments, indent, and block moves stay usable', async ({ page }) => {
  await openChalk(page);
  const docId = await createDocument(page);
  await page.getByTestId('document-icon').fill('🧪');
  await page.getByTestId('document-icon').press('Tab');
  await page.getByTestId('document-status').selectOption('review');
  await page.getByTestId('add-block').click();
  await page.getByTestId('add-block').click();
  await expect(blocks(page)).toHaveCount(3);

  await page.getByTestId('indent-blocks').click();
  await expect(blocks(page).nth(0)).toHaveAttribute('data-indent', '1');
  await expect(blocks(page).nth(1)).toHaveAttribute('data-indent', '1');
  const before = await blocks(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id')));
  await page.getByTestId('move-blocks-down').click();
  await expect.poll(() => blocks(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id'))))
    .toEqual([before[2], before[0], before[1]]);

  await page.getByTestId('comment-body').fill('Product comment');
  await page.getByTestId('add-comment').click();
  await expect(page.getByTestId('summary-comments')).toHaveText('1 comments');
  await page.getByTestId(`doc-${docId}`).click();
  await expect(page.getByTestId('document-icon')).toHaveValue('🧪');
  await expect(page.getByTestId('document-status')).toHaveValue('review');
});

test('save state distinguishes pending, local, and confirmed writes', async ({ page }) => {
  const gate = await mutationGate(page);
  await openChalk(page);
  await createDocument(page);

  const held = gate.arm();
  await typeAtEnd(page, 'pending', false);
  await held;
  await expect(page.getByTestId('save-state')).toHaveText('Saving');
  gate.release();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  await page.context().setOffline(true);
  await expect(page.getByTestId('save-state')).toHaveText('Saved locally');
  await blocks(page).first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' local');
  await expect(page.getByTestId('outbox-state')).toContainText('queued 1');
  await expect(page.getByTestId('save-state')).toHaveText('Saved locally');

  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByTestId('connection-state')).toHaveText('connected');
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
});
