import { expect, test, type Page } from '@playwright/test';
import { openWheelClients, type WheelBrowserClient } from 'wheel/testing/playwright';

import { SEED, SEED_PROJECTS, seedIssues } from '../seed/seed';

const actorId = SEED.users[0].id;
const team = SEED.teams[0];
const basicIssue = seedIssues().find(
  (issue) => issue.teamId === team.id && issue.projectId === null && issue.archivedAt === null
)!;
const project = SEED_PROJECTS[0];
const overlapIssue = seedIssues().find(
  (issue) => issue.teamId === team.id && issue.projectId === project.id && issue.archivedAt === null
)!;

async function openAxle(client: WheelBrowserClient<Page>, origin: string, path: string): Promise<void> {
  await client.page.addInitScript((id) => sessionStorage.setItem('axle.actorId', id), actorId);
  await client.page.goto(`${origin}${path}`);
  await expect(client.page.getByTestId('sync-badge')).toContainText('connected');
}

test('a mutation reaches a separate client without reload @behavior:conv-basic', async ({
  browser,
  baseURL
}) => {
  if (!baseURL) throw new Error('Tracker browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [clientA, clientB] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  try {
    await Promise.all(clients.map((client) => openAxle(client, baseURL, `/teams/${team.id}/issues`)));

    const edited = `${basicIssue.title} [peer convergence]`;
    await clientA.page.getByTestId(`issue-title-${basicIssue.id}`).dblclick();
    const input = clientA.page.getByTestId(`issue-title-input-${basicIssue.id}`);
    await input.fill(edited);
    await input.press('Enter');

    await expect(clientB.page.getByText(edited, { exact: true })).toBeVisible();
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});

test('releasing an overlapping query keeps the shared row @behavior:conv-overlap', async ({
  browser,
  baseURL
}) => {
  if (!baseURL) throw new Error('Tracker browser tests need a base URL.');
  const clients = await openWheelClients(browser, 2);
  const [, observer] = clients as [WheelBrowserClient<Page>, WheelBrowserClient<Page>];
  const projectQuery = `issues.byProject|{"projectId":"${project.id}"}`;
  try {
    await Promise.all(clients.map((client) => openAxle(client, baseURL, `/teams/${team.id}/issues`)));
    await observer.page.goto(`${baseURL}/projects/${project.id}`);
    await expect(observer.page.getByText(overlapIssue.title, { exact: true })).toBeVisible();
    await expect.poll(() => observer.page.evaluate(() => '__wheel' in window)).toBe(true);
    await expect.poll(async () => (await observer.wheel.subscriptions()).some((entry) => entry.key === projectQuery)).toBe(true);

    await observer.page.goto(`${baseURL}/teams/${team.id}/issues`);
    await expect.poll(() => observer.page.evaluate(() => '__wheel' in window)).toBe(true);
    await expect.poll(async () => (await observer.wheel.subscriptions()).some((entry) => entry.key === projectQuery)).toBe(false);
    await expect(observer.page.getByTestId(`issue-title-${overlapIssue.id}`)).toHaveText(overlapIssue.title);
  } finally {
    await Promise.all(clients.map((client) => client.context.close()));
  }
});
