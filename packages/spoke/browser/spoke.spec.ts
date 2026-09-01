import { expect, test, type Page } from '@playwright/test';
import { wheelDriver } from 'wheel/testing';
import { openWheelClients, type WheelBrowserClient } from 'wheel/testing/playwright';

interface SpokeIdentity {
  readonly workspace: 'acme' | 'orbit';
  readonly actor: 'user:ada' | 'user:lin' | 'user:max';
  readonly channel?: string;
}

async function openSpoke(page: Page, baseURL: string, identity: SpokeIdentity): Promise<void> {
  const url = new URL(baseURL);
  url.searchParams.set('workspace', identity.workspace);
  url.searchParams.set('actor', identity.actor);
  if (identity.channel) url.searchParams.set('channel', identity.channel);
  await page.goto(url.toString());
  await expect(page.getByTestId('connection-state')).toHaveText('connected');
  await expect(page.getByTestId('channels-status')).toHaveText('channels: live');
  await expect(page.getByTestId('messages-status')).toHaveText('messages: live');
  await expect(page.getByTestId('unread-status')).toHaveText('unread: live');
}

async function rows(page: Page, collection: string): Promise<readonly Record<string, unknown>[]> {
  return (await wheelDriver(page).collections()).find((entry) => entry.collection === collection)?.rows ?? [];
}

test.describe.configure({ timeout: 45_000 });

test('private rows and presence stay principal-scoped @behavior:auth-visibility @behavior:auth-grouping', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [member, outsider] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([
      openSpoke(member.page, baseURL, { workspace: 'acme', actor: 'user:ada', channel: 'channel_leads' }),
      openSpoke(outsider.page, baseURL, { workspace: 'acme', actor: 'user:lin', channel: 'channel_leads' })
    ]);

    await expect(member.page.getByTestId('channel-channel_leads')).toBeVisible();
    await expect(member.page.getByText('Acme launch is private')).toBeVisible();
    await expect(outsider.page.getByTestId('channel-channel_leads')).toHaveCount(0);
    await expect(outsider.page.getByTestId('empty-messages')).toBeVisible();
    expect(await rows(outsider.page, 'channels')).not.toContainEqual(expect.objectContaining({ id: 'channel_leads' }));
    expect(await rows(outsider.page, 'messages')).not.toContainEqual(expect.objectContaining({ id: 'message_acme_private' }));
    expect(await rows(outsider.page, 'channel_members')).toEqual([]);

    const memberSub = (await member.wheel.subscriptions()).find((sub) => sub.key.startsWith('messages.byChannel|'));
    const outsiderSub = (await outsider.wheel.subscriptions()).find((sub) => sub.key.startsWith('messages.byChannel|'));
    expect(memberSub?.key).toEqual(outsiderSub?.key);
    expect(memberSub?.rows).toBe(1);
    expect(outsiderSub?.rows).toBe(0);

    await member.page.getByTestId('message-composer').fill('private typing');
    await expect(outsider.page.getByTestId('typing-state')).toHaveText('typing: none');
    await expect(outsider.page.getByTestId('online-members')).toHaveText('online: none');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('peer messages update and clear unread aggregates @behavior:conv-aggregate', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [sender, reader] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([
      openSpoke(sender.page, baseURL, { workspace: 'acme', actor: 'user:ada' }),
      openSpoke(reader.page, baseURL, { workspace: 'acme', actor: 'user:lin' })
    ]);
    await expect(reader.page.getByTestId('unread-channel_general')).toHaveText('1');
    await reader.page.getByTestId('mark-read').click();
    await expect(reader.page.getByTestId('unread-channel_general')).toHaveText('0');
    await reader.wheel.settle();

    const body = `Peer update ${crypto.randomUUID().slice(0, 8)}`;
    await sender.page.getByTestId('message-composer').fill(body);
    await sender.page.getByTestId('send-message').click();
    await expect(reader.page.getByText(body)).toBeVisible();
    await expect(reader.page.getByTestId('unread-channel_general')).toHaveText('1');
    await reader.page.getByTestId('mark-read').click();
    await expect(reader.page.getByTestId('unread-channel_general')).toHaveText('0');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('the bot external writer converges on every SQLite client', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [first, second] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([
      openSpoke(first.page, baseURL, { workspace: 'acme', actor: 'user:ada' }),
      openSpoke(second.page, baseURL, { workspace: 'acme', actor: 'user:lin' })
    ]);
    const body = `Bot update ${crypto.randomUUID().slice(0, 8)}`;
    const response = await first.page.request.post('/bot/message?workspace=acme', {
      data: { channelId: 'channel_general', body }
    });
    expect(response.status()).toBe(201);
    await expect(first.page.getByText(body)).toBeVisible();
    await expect(second.page.getByText(body)).toBeVisible();
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('typing presence appears, updates, and clears on leave @behavior:presence-live', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [writer, peer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([
      openSpoke(writer.page, baseURL, { workspace: 'acme', actor: 'user:ada' }),
      openSpoke(peer.page, baseURL, { workspace: 'acme', actor: 'user:lin' })
    ]);
    await writer.page.getByTestId('message-composer').fill('draft');
    await expect(peer.page.getByTestId('online-members')).toContainText('user:ada');
    await expect(peer.page.getByTestId('typing-state')).toContainText('user:ada');
    await writer.page.getByTestId('message-composer').fill('updated draft');
    await expect(peer.page.getByTestId('typing-state')).toContainText('user:ada');
    await writer.page.getByTestId('message-composer').blur();
    await expect(peer.page.getByTestId('typing-state')).toHaveText('typing: none');
    await expect(peer.page.getByTestId('online-members')).toContainText('user:ada');
    await writer.page.getByTestId('channel-channel_leads').click();
    await expect(peer.page.getByTestId('online-members')).toHaveText('online: none');
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('workspace rows and presence stay isolated on SQLite', async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error('Spoke browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [acme, orbit] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all([
      openSpoke(acme.page, baseURL, { workspace: 'acme', actor: 'user:ada' }),
      openSpoke(orbit.page, baseURL, { workspace: 'orbit', actor: 'user:max' })
    ]);
    await expect(acme.page.getByText('Welcome to Acme')).toBeVisible();
    await expect(orbit.page.getByText('Welcome to Orbit')).toBeVisible();
    await expect(orbit.page.getByText('Welcome to Acme')).toHaveCount(0);

    const body = `Acme only ${crypto.randomUUID().slice(0, 8)}`;
    await acme.page.getByTestId('message-composer').fill(body);
    await expect(orbit.page.getByTestId('typing-state')).toHaveText('typing: none');
    await acme.page.getByTestId('send-message').click();
    await expect(acme.page.getByText(body)).toBeVisible();
    await expect(orbit.page.getByText(body)).toHaveCount(0);
    expect(await rows(orbit.page, 'messages')).not.toContainEqual(expect.objectContaining({ body }));
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});
