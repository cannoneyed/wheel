/**
 * The annotation loop end to end, against the real production build.
 *
 * Everything else about this feature is tested in isolation: the recorder with
 * a fake clock, the endpoints with a fake server, the chrome in jsdom. This is
 * the one test that runs the WHOLE path — a browser arms annotation mode, a
 * human-shaped drag draws a rectangle, the real recorder supplies the
 * timeline, the page POSTs to the real dev-server endpoint, and the assertions
 * are made against the FILES that land on disk.
 *
 * If this passes, "leave a note and hand it to an agent" works.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

import { SEED } from '../seed/seed';

import { clearNotes, hasNoteSink, noteIds, notesDir, savedNote } from './notes';

// The whole suite is about what a note leaves ON DISK, which needs the dev
// server's note endpoint. The Durable Object run is served by a worker and has
// none — see `hasNoteSink`. The annotator itself is covered there by the
// debug-tree suite and by the unit tests; nothing about it is backend-specific.
test.skip(!hasNoteSink, 'the note sink is a vite dev-server route; this run is served by a worker');

const actorId = SEED.users[0].id;
const team = SEED.teams[0];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((id) => {
    sessionStorage.setItem('axle.actorId', id);
  }, actorId);
  await page.goto(`/teams/${team.id}/issues`);
  await expect(page.getByTestId('sync-badge')).toContainText('connected');
});

test.afterAll(() => clearNotes());

test('a dragged rectangle lands on disk with the components under it', async ({ page }) => {
  const before = noteIds();

  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  const shield = page.getByTestId('wheel-annotate-shield');
  await expect(shield).toBeVisible();

  // Drag a rectangle around the row. This is the primary interaction: the
  // shield is over the app on purpose, so the marquee owns the pointer and
  // resolves what is underneath by hit-testing.
  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  expect(target).not.toBeNull();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();

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
    anchor: { instanceId: string | null; rect: { width: number } };
    nearby: Array<{ instanceId: string; state: Record<string, unknown> }>;
    environment: { url: string };
    attachments: string[];
  };

  expect(payload.label).toBe('bug');
  expect(payload.text).toBe('this row renders the wrong assignee');
  expect(payload.environment.url).toContain(`/teams/${team.id}/issues`);

  // The point of the whole feature: the note carries the components under the
  // rectangle and what they held, not just the rectangle.
  expect(payload.anchor.rect.width).toBeGreaterThan(0);
  expect(payload.anchor.instanceId).toBeTruthy();
  expect(payload.nearby.length).toBeGreaterThan(0);
  expect(Object.keys(payload.nearby[0]!.state).length).toBeGreaterThan(0);

  // Pixels, with nobody pressing anything and no share prompt. This is the
  // one attachment every note should have, so it must not depend on a
  // permission a headless browser (or a hurried human) never grants.
  expect(payload.attachments).toContain('shot.png');
  expect(existsSync(join(notesDir, note.id, 'shot.png'))).toBe(true);

  // Saving says so. The composer is gone by now, so a confirmation drawn
  // inside it would have been invisible — this is the page telling you the
  // note landed.
  await expect(page.getByTestId('wheel-annotate-toast')).toContainText('saved');

  // And note.md is readable on its own, which is what an agent is handed.
  expect(note.markdown).toContain('# this row renders the wrong assignee');
  expect(note.markdown).toContain('## What it is attached to');
  expect(note.markdown).toContain('## Also under the selection');
  expect(note.markdown).toContain(payload.nearby[0]!.instanceId);
});

test('a note carries the real actions and state changes behind what happened', async ({ page }) => {
  const before = noteIds();

  const issueTitle = page.locator('[data-testid^="issue-title-"]').first();
  const original = (await issueTitle.textContent())?.trim() ?? '';

  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();
  const target = await issueTitle.boundingBox();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();

  // Press record, then reproduce it. Nothing is tapped until this point:
  // recording is asked for, not always running.
  await page.getByTestId('wheel-annotate-film').click();
  await expect(page.getByTestId('wheel-annotate-timeline')).toBeVisible();

  await issueTitle.dblclick();
  const editInput = page.locator('[data-testid^="issue-title-input-"]').first();
  await expect(editInput).toBeFocused();
  await editInput.fill(`${original} [annotated]`);
  await editInput.press('Enter');
  await expect(page.getByText(`${original} [annotated]`, { exact: true })).toBeVisible();

  await page.getByTestId('wheel-annotate-text').fill('renaming an issue felt slow');
  await page.getByTestId('wheel-annotate-text').blur();
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    startedAt: number;
    endedAt: number;
    startState: Record<string, Record<string, unknown>>;
    timeline: Array<{ kind: string; at: number; service?: string; action?: string; type?: string }>;
  };

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

  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();
  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('no server here');

  const save = page.getByTestId('wheel-annotate-save');
  await expect(save).toContainText('download note');

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

  // The page says which way it went, so "downloaded" is never mistaken for
  // "saved into the repo".
  await expect(page.getByTestId('wheel-annotate-toast')).toContainText('downloaded');
});

test('the pane returns to armed after a save, and lists what it wrote', async ({ page }) => {
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('this row is wrong');
  await page.getByTestId('wheel-annotate-save').click();

  // The pane goes back to armed. It used to track "is the chrome loaded",
  // which never becomes false, so after saving it still read "drag a
  // rectangle over the app" with no composer in sight.
  await expect(page.getByTestId('wheel-annotate-composer')).toHaveCount(0);
  await expect(page.getByTestId('wheel-annotate-armed')).toBeVisible();

  // And the note is listed, so saving leaves something to point at rather
  // than a clipboard you have to trust.
  const saved = page.getByTestId('wheel-annotate-saved');
  await expect(saved).toHaveCount(1);
  await expect(saved.first()).toContainText('this row is wrong');
});

test('a note can be rewritten, and lands on the note it came from', async ({ page }) => {
  const before = noteIds();

  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('the assignee is wrong');
  await page.getByTestId('wheel-annotate-save').click();

  const first = await savedNote(before);
  expect(existsSync(join(notesDir, first.id, 'shot.png'))).toBe(true);

  // Reopen it from the list. The first draft of a bug report is written in a
  // hurry; the second one is the useful one.
  await page.getByTestId('wheel-annotate-edit').first().click();
  const text = page.getByTestId('wheel-annotate-text');
  await expect(text).toHaveValue('the assignee is wrong');
  await expect(page.getByTestId('wheel-annotate-rewriting')).toBeVisible();
  await text.fill('the assignee is the reporter after a reload');
  await page.getByTestId('wheel-annotate-save').click();

  // It replaced the note on disk rather than writing a second one beside it,
  // and the picture it was saved with is still there — a rewrite changes the
  // words, never the evidence.
  await expect
    .poll(() => readFileSync(join(notesDir, first.id, 'note.md'), 'utf8'))
    .toContain('# the assignee is the reporter after a reload');
  expect(noteIds().filter((name) => !before.includes(name))).toHaveLength(1);
  expect(existsSync(join(notesDir, first.id, 'shot.png'))).toBe(true);

  // And the pane lists one note, showing what it now says.
  const saved = page.getByTestId('wheel-annotate-saved');
  await expect(saved).toHaveCount(1);
  await expect(saved.first()).toContainText('the assignee is the reporter after a reload');
});

test('the keys printed on the controls are the keys that work', async ({ page }) => {
  const before = noteIds();
  await page.getByTestId('wheel-debug-toggle').click();

  // The chord is on the button, and the button's chord arms it.
  await expect(page.getByTestId('wheel-annotate-arm')).toContainText(/⇧⌘A|Ctrl\+Shift\+A/);
  await page.keyboard.press('Meta+Shift+KeyA');
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();

  const text = page.getByTestId('wheel-annotate-text');
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await expect(page.getByTestId('wheel-annotate-save')).toContainText('s');
  await expect(page.getByTestId('wheel-annotate-discard')).toContainText('d');
  await expect(page.getByTestId('wheel-annotate-film')).toContainText('r');

  // Typing the note must never fire them. "s" here is a letter, not save.
  await text.fill('the status');
  await page.keyboard.press('s');
  await expect(text).toHaveValue('the statuss');
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();

  // r records, and Escape ends the recording without ending the note — the
  // whole point of writing the note is to describe what was just recorded.
  await text.blur();
  await page.keyboard.press('r');
  await expect(page.getByTestId('wheel-annotate-timeline')).toBeVisible();
  await expect(page.getByTestId('wheel-annotate-filming')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wheel-annotate-timeline')).toHaveCount(0);
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();

  // Out of the box, the same key saves.
  await text.blur();
  await page.keyboard.press('s');
  const note = await savedNote(before);
  expect((note.payload as { text: string }).text).toBe('the statuss');

  // And "d" throws a draft away. Saving leaves the shield up, so the next
  // rectangle needs no second arming.
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();
  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.keyboard.press('d');
  await expect(page.getByTestId('wheel-annotate-composer')).toHaveCount(0);

  // The composer's keys leave with the composer: "d" is just a letter again.
  await page.keyboard.press('d');
  await expect(page.getByTestId('wheel-annotate-armed')).toBeVisible();
  expect(noteIds().filter((name) => !before.includes(name))).toHaveLength(1);
});

test('the rectangle can be resized and moved, and the note follows it', async ({ page }) => {
  const before = noteIds();
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  // Draw a small box on the FIRST row, then aim it at the second. A rectangle
  // drawn in one gesture is rarely the one you meant, and the only fix used to
  // be discarding the note and starting again.
  const rows = page.locator('[data-testid^="issue-title-"]');
  const first = (await rows.nth(0).boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(first.x + 4, first.y + 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 40, first.y + first.height - 2, { steps: 6 });
  await page.mouse.up();

  const outline = page.getByTestId('wheel-annotate-target');
  await expect(outline).toBeVisible();
  const drawn = (await outline.boundingBox())!;
  const drawnSubject = await page.getByTestId('wheel-annotate-subject').textContent();

  // The handles are shy: eight squares and a triangle parked over the app are
  // noise to look at, so they wait until the pointer is at the frame.
  await page.mouse.move(drawn.x + drawn.width + 400, drawn.y + drawn.height + 400);
  await expect(page.getByTestId('wheel-annotate-grip-se')).toHaveCount(0);

  // Grow it from the south-east corner.
  await page.mouse.move(drawn.x + drawn.width, drawn.y + drawn.height);
  await expect(page.getByTestId('wheel-annotate-grip-se')).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(drawn.x + drawn.width + 60, drawn.y + drawn.height + 30, { steps: 6 });
  await page.mouse.up();
  const grown = (await outline.boundingBox())!;
  expect(grown.width).toBeGreaterThan(drawn.width + 40);
  expect(grown.height).toBeGreaterThan(drawn.height + 20);

  // Then move it whole, by the triangle outside the top-left corner, until it
  // is over the second row.
  await expect(page.getByTestId('wheel-annotate-move')).toBeVisible();
  const move = (await page.getByTestId('wheel-annotate-move').boundingBox())!;
  const dy = second.y - first.y;
  await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2);
  await page.mouse.down();
  await page.mouse.move(move.x + move.width / 2, move.y + move.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  const moved = (await outline.boundingBox())!;
  expect(Math.round(moved.y - grown.y)).toBeGreaterThan(dy - 4);

  // The composer's subject is what the note is ABOUT, and it changed: moving
  // the box re-resolves the component underneath rather than keeping the one
  // the first gesture happened to land on.
  await expect(page.getByTestId('wheel-annotate-subject')).not.toHaveText(drawnSubject ?? '');

  await page.getByTestId('wheel-annotate-text').fill('this row, not the one above it');
  await page.getByTestId('wheel-annotate-text').blur();
  await page.getByTestId('wheel-annotate-save').click();

  // The point of the whole thing: the note is about where the box ENDED UP.
  // The anchor, the components underneath and the picture are all re-taken on
  // release, so a moved box does not describe what it used to cover.
  const note = await savedNote(before);
  const payload = note.payload as {
    anchor: { rect: { y: number; width: number }; instanceId: string | null };
    nearby: Array<{ instanceId: string }>;
  };
  expect(payload.anchor.rect.width).toBeGreaterThan(drawn.width + 40);
  expect(Math.round(payload.anchor.rect.y)).toBeGreaterThan(Math.round(drawn.y));
  expect(payload.nearby.length).toBeGreaterThan(0);
  expect(existsSync(join(notesDir, note.id, 'shot.png'))).toBe(true);
});

test('a stray click annotates nothing, and video is never a toll on drawing', async ({ page }) => {
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  const shield = page.getByTestId('wheel-annotate-shield');
  await expect(shield).toBeVisible();

  // A press that never really moved used to take whatever component was under
  // it, so a misclick opened a composer nobody asked for.
  const target = await page.locator('[data-testid^="issue-title-"]').first().boundingBox();
  await page.mouse.click(target!.x + target!.width / 2, target!.y + target!.height / 2);
  await expect(page.getByTestId('wheel-annotate-composer')).toHaveCount(0);

  await page.mouse.move(target!.x - 6, target!.y - 6);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 6, target!.y + target!.height + 6, { steps: 8 });
  await page.mouse.up();

  // Drawing the box opened no permission prompt and started no recording:
  // both are one switch inside the composer, offered rather than charged.
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await expect(page.getByTestId('wheel-annotate-film')).toContainText('record');
  await expect(page.getByTestId('wheel-annotate-timeline')).toHaveCount(0);
});
