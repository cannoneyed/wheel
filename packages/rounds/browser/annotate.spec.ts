/**
 * Annotating a real app, on the app that has the most worth capturing.
 *
 * The tracker suite proves the mechanism. This one proves the POINT: a note
 * drawn after a rejected mutation carries the rejection, the rollback, and the
 * mutation names behind both — the causes an agent would otherwise have to
 * reproduce.
 *
 * Rounds is the right subject because its interesting states are ones a
 * screenshot cannot show. "The field reverted and I do not know why" is
 * exactly the bug report this feature exists to replace.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { TEST_PORTS, testOrigin } from '../../../scripts/test-ports';

const controllerOrigin = testOrigin(TEST_PORTS.roundsController);

/** The vite root is the rounds package, so notes land under it. */
const notesDir = resolve(fileURLToPath(new URL('..', import.meta.url)), '.wheel/notes');

async function restart(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${controllerOrigin}/restart`, { data: { storage: 'reset' } });
  expect(response.ok()).toBe(true);
}

function noteIds(): string[] {
  return existsSync(notesDir) ? readdirSync(notesDir).sort() : [];
}

/** Wait for a note directory that was not there before, and read it back. */
async function savedNote(before: string[]): Promise<{ id: string; markdown: string; payload: unknown }> {
  let id = '';
  await expect
    .poll(
      () => {
        const fresh = noteIds().filter((name) => !before.includes(name));
        id = fresh[fresh.length - 1] ?? '';
        return id !== '' && existsSync(join(notesDir, id, 'note.md'));
      },
      { timeout: 15_000 }
    )
    .toBe(true);
  return {
    id,
    markdown: readFileSync(join(notesDir, id, 'note.md'), 'utf8'),
    payload: JSON.parse(readFileSync(join(notesDir, id, 'note.json'), 'utf8'))
  };
}

test.beforeEach(async ({ request }) => restart(request));

test.afterAll(() => {
  // Test output, not somebody's work. WHEEL_KEEP_NOTES_TESTONLY=1 keeps it.
  if (process.env.WHEEL_KEEP_NOTES_TESTONLY) return;
  rmSync(notesDir, { recursive: true, force: true });
});

test('a note on a rejected mutation carries why it was rejected', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('connection-state')).toContainText('connected');

  const before = noteIds();

  // Draw the box around the field first, then press record, then reproduce
  // it. Nothing is recorded until record is pressed.
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const target = await page.getByTestId('note-item_exit').boundingBox();
  await page.mouse.move(target!.x - 8, target!.y - 8);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width + 8, target!.y + target!.height + 8, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-film').click();
  await expect(page.getByTestId('wheel-annotate-timeline')).toBeVisible();

  // The state worth complaining about: an edit the server rejects, which rolls
  // the field back to its previous value. A screenshot of this shows a field
  // that looks fine and a message you have to trust.
  const note = 'This note exceeds the server-owned field limit by enough characters to force a business rejection.';
  await page.getByTestId('note-item_exit').fill(note);
  await page.getByTestId('save-item_exit').click();
  await expect(page.getByTestId('mutation-state')).toHaveText('rejected');

  await page.getByTestId('wheel-annotate-text').fill('my edit vanished and I do not know why');
  await page.getByTestId('wheel-annotate-text').blur();
  await page.getByTestId('wheel-annotate-save').click();

  const saved = await savedNote(before);
  const payload = saved.payload as {
    text: string;
    anchor: { rect: { width: number }; instanceId: string | null; element: string | null };
    environment: { url: string; sync: { pendingMutations: number } | null };
    timeline: Array<{ kind: string; collection?: string; cause?: string; action?: string }>;
    startState: Record<string, Record<string, unknown>>;
    attachments: string[];
  };

  expect(payload.text).toBe('my edit vanished and I do not know why');
  expect(payload.anchor.rect.width).toBeGreaterThan(0);

  // Pixels, with no permission prompt — the DOM rasterizer, not screen share.
  expect(payload.attachments).toContain('shot.png');
  expect(existsSync(join(notesDir, saved.id, 'shot.png'))).toBe(true);

  // The whole point: the note explains itself. The rejected write is in the
  // timeline with the mutation that caused it, which is the fact no
  // screenshot-and-selector tool can hand an agent.
  const writes = payload.timeline.filter((event) => event.kind === 'write');
  expect(writes.length).toBeGreaterThan(0);
  expect(writes.some((write) => (write.cause ?? '').includes(':'))).toBe(true);

  // And the app's own state as it stood, so the timeline is re-runnable.
  expect(Object.keys(payload.startState).length).toBeGreaterThan(0);
  expect(payload.environment.sync).not.toBeNull();

  // note.md is what an agent is handed, and it stands on its own.
  expect(saved.markdown).toContain('# my edit vanished and I do not know why');
  expect(saved.markdown).toContain('## Timeline');
});
