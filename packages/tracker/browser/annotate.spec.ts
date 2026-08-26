/**
 * The annotation loop end to end, against the real production build.
 *
 * Everything else about this feature is tested in isolation: the recorder with
 * a fake clock, the endpoints with a fake server, the chrome in jsdom. This is
 * the one test that runs the WHOLE path — a browser arms annotation mode, a
 * human-shaped click picks a component, a clip records real interactions, the
 * page POSTs to the real dev-server endpoint, and the assertions are made
 * against the FILES that land on disk.
 *
 * If this passes, "leave a note and hand it to an agent" works.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

import { SEED } from '../seed/seed';

/** `vite preview` roots at the tracker package, so notes land under it. */
const notesDir = resolve(fileURLToPath(new URL('..', import.meta.url)), '.wheel/notes');

const actorId = SEED.users[0].id;
const team = SEED.teams[0];

/** Note directories that exist right now, newest last. */
function noteIds(): string[] {
  return existsSync(notesDir) ? readdirSync(notesDir).sort() : [];
}

/** Wait for a note directory that was not there before, and return its files. */
async function savedNote(before: string[]): Promise<{ id: string; markdown: string; payload: unknown }> {
  let id = '';
  await expect
    .poll(() => {
      const fresh = noteIds().filter((name) => !before.includes(name));
      id = fresh[fresh.length - 1] ?? '';
      return id !== '' && existsSync(join(notesDir, id, 'note.md'));
    }, { timeout: 15_000 })
    .toBe(true);
  return {
    id,
    markdown: readFileSync(join(notesDir, id, 'note.md'), 'utf8'),
    payload: JSON.parse(readFileSync(join(notesDir, id, 'note.json'), 'utf8'))
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('axle.actorId', id);
  }, actorId);
  await page.goto(`/teams/${team.id}/issues`);
  await expect(page.getByTestId('sync-badge')).toContainText('connected');
});

test.afterAll(() => {
  // The notes this suite writes are test output, not somebody's work. Set
  // WHEEL_KEEP_NOTES_TESTONLY=1 to read what it actually produced.
  if (process.env.WHEEL_KEEP_NOTES_TESTONLY) return;
  rmSync(notesDir, { recursive: true, force: true });
});

test('a note on a picked component lands on disk with that component state', async ({ page }) => {
  const before = noteIds();

  await page.getByTestId('wheel-annotate-chip').click();
  const shield = page.getByTestId('wheel-annotate-shield');
  await expect(shield).toBeVisible();

  // A real click at a real position — the shield is over the app on purpose,
  // so the picker resolves what is underneath by hit-testing.
  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  expect(target).not.toBeNull();
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('this row renders the wrong assignee');
  const save = page.getByTestId('wheel-annotate-save');
  await expect(save).toBeEnabled();
  await save.click();

  const note = await savedNote(before);
  const payload = note.payload as {
    kind: string;
    label: string;
    text: string;
    anchor: { instanceId: string | null; kind: string };
    target: { instanceId: string; state: Record<string, unknown> } | null;
    environment: { url: string };
  };

  expect(payload.kind).toBe('note');
  expect(payload.label).toBe('bug');
  expect(payload.text).toBe('this row renders the wrong assignee');
  expect(payload.environment.url).toContain(`/teams/${team.id}/issues`);

  // The point of the whole feature: the note carries the component and what it
  // held, not just a rectangle.
  expect(payload.anchor.instanceId).toBeTruthy();
  expect(payload.target).not.toBeNull();
  expect(Object.keys(payload.target!.state).length).toBeGreaterThan(0);

  // And note.md is readable on its own, which is what an agent is handed.
  expect(note.markdown).toContain('# this row renders the wrong assignee');
  expect(note.markdown).toContain('## What it is attached to');
  expect(note.markdown).toContain(payload.anchor.instanceId!);
  expect(note.markdown).toContain('## State at capture');
});

test('a clip records the real actions and state changes behind an interaction', async ({ page }) => {
  const before = noteIds();

  await page.getByTestId('wheel-annotate-chip').click();
  await page.getByTestId('wheel-annotate-record').click();

  // The picker steps aside while recording, so the app is usable — that is how
  // a clip gets any content at all.
  await expect(page.getByTestId('wheel-annotate-shield')).toHaveCount(0);

  const issueTitle = page.locator('[data-testid^="issue-title-"]').first();
  const original = (await issueTitle.textContent())?.trim() ?? '';
  await issueTitle.dblclick();
  const editInput = page.locator('[data-testid^="issue-title-input-"]').first();
  await expect(editInput).toBeFocused();
  await editInput.fill(`${original} [annotated]`);
  await editInput.press('Enter');
  await expect(page.getByText(`${original} [annotated]`, { exact: true })).toBeVisible();

  await page.getByTestId('wheel-annotate-stop').click();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('renaming an issue felt slow');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    kind: string;
    startedAt: number;
    endedAt: number;
    startState: Record<string, Record<string, unknown>>;
    timeline: Array<{ kind: string; at: number; service?: string; action?: string; type?: string }>;
  };

  expect(payload.kind).toBe('clip');
  expect(payload.endedAt).toBeGreaterThan(payload.startedAt);

  const kinds = new Set(payload.timeline.map((event) => event.kind));
  // Real input, a NAMED action, and the state it moved — the three things a
  // screenshot-and-selector tool cannot give an agent.
  expect(kinds).toContain('input');
  expect(kinds).toContain('action');
  expect(kinds).toContain('state');

  // Causes before effects: every action precedes the writes it produced.
  const firstAction = payload.timeline.findIndex((event) => event.kind === 'action');
  const firstState = payload.timeline.findIndex((event) => event.kind === 'state');
  expect(firstAction).toBeGreaterThanOrEqual(0);
  expect(firstAction).toBeLessThan(firstState);

  // The starting state is what makes the timeline re-runnable later.
  expect(Object.keys(payload.startState).length).toBeGreaterThan(0);

  expect(note.markdown).toContain('## Timeline');
  expect(note.markdown).toMatch(/\| \+\d+ms \| action \| \w+\.\w+/);
});

test('falls back to one downloaded file when the app has no dev server', async ({ page }) => {
  // A deployed app has no /__wheel/note. Killing the endpoint is the honest
  // way to test what production actually does.
  await page.route('**/__wheel/note', (route) => route.abort());

  await page.getByTestId('wheel-annotate-chip').click();
  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('no server here');

  const save = page.getByTestId('wheel-annotate-save');
  await expect(save).toHaveText('download note');

  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  expect(download.suggestedFilename()).toMatch(/^\d+-no-server-here\.md$/);

  const file = await download.path();
  const text = readFileSync(file, 'utf8');

  // One file has to carry what a whole directory would have.
  expect(text).toContain('# no server here');
  expect(text).toContain('## What it is attached to');
  expect(text).toContain('## State at capture');
  expect(text).toContain('## Payload');
  const payload = JSON.parse(text.split('```json').pop()!.split('```')[0]!) as {
    text: string;
    anchor: { instanceId: string | null };
  };
  expect(payload.text).toBe('no server here');
  expect(payload.anchor.instanceId).toBeTruthy();
});
