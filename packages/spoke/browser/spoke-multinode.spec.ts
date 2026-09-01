import { expect, test, type Browser, type Page } from '@playwright/test';
import { openWheelClients, type WheelBrowserClient } from 'wheel/testing/playwright';

const nodeOne = process.env.SPOKE_NODE_ONE_ORIGIN;
const nodeTwo = process.env.SPOKE_NODE_TWO_ORIGIN;

async function openOn(
  page: Page,
  baseURL: string,
  syncOrigin: string,
  actor: 'user:ada' | 'user:lin'
): Promise<void> {
  const url = new URL(baseURL);
  url.searchParams.set('workspace', 'acme');
  url.searchParams.set('actor', actor);
  url.searchParams.set('syncOrigin', syncOrigin);
  await page.goto(url.toString());
  await expect(page.getByTestId('connection-state')).toHaveText('connected');
  await expect(page.getByTestId('messages-status')).toHaveText('messages: live');
}

async function clientsOnBothNodes(
  browser: Browser,
  baseURL: string
): Promise<[WheelBrowserClient<Page>, WheelBrowserClient<Page>]> {
  if (!nodeOne || !nodeTwo) throw new Error('Spoke multi-node origins are required.');
  const clients = await openWheelClients(browser, 2);
  const pair = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  await Promise.all([
    openOn(pair[0].page, baseURL, nodeOne, 'user:ada'),
    openOn(pair[1].page, baseURL, nodeTwo, 'user:lin')
  ]);
  return pair;
}

test.describe.configure({ timeout: 45_000 });

test('a notified message reaches a browser on the other node @behavior:node-delivery', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await clientsOnBothNodes(browser, baseURL);
  try {
    const body = `Node delivery ${crypto.randomUUID().slice(0, 8)}`;
    await clients[0].page.getByTestId('message-composer').fill(body);
    await clients[0].page.getByTestId('send-message').click();
    await expect(clients[1].page.getByText(body)).toBeVisible();
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('a missed notification catches up once @behavior:node-recovery', async ({ browser, baseURL, request }) => {
  if (!baseURL || !nodeOne || !nodeTwo) throw new Error('Spoke multi-node origins are required.');
  const clients = await clientsOnBothNodes(browser, baseURL);
  try {
    const body = `Node recovery ${crypto.randomUUID().slice(0, 8)}`;
    const missed = await request.post(`${nodeOne}/__test/missed-message?workspace=acme`, {
      data: { channelId: 'channel_general', body }
    });
    expect(missed.status()).toBe(201);
    await expect(clients[1].page.getByText(body)).toHaveCount(0);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const catchUp = await request.post(`${nodeTwo}/__test/catch-up?workspace=acme`);
      expect(catchUp.status()).toBe(200);
    }
    await expect(clients[1].page.getByText(body)).toHaveCount(1);
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});
