/**
 * Reading the notes the annotator writes to disk.
 *
 * Shared by the two annotate suites, which are two files only because the
 * screen-recording one needs chromium launch flags — and Playwright will not
 * take `launchOptions` from a describe block, because it forces a new worker.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { expect } from '@playwright/test';

/** `vite preview` roots at the tracker package, so notes land under it. */
export const notesDir = resolve(fileURLToPath(new URL('..', import.meta.url)), '.wheel/notes');

/** Note directories that exist right now, newest last. */
export function noteIds(): string[] {
  return existsSync(notesDir) ? readdirSync(notesDir).sort() : [];
}

/** Wait for a note directory that was not there before, and return its files. */
export async function savedNote(
  before: string[]
): Promise<{ id: string; markdown: string; payload: unknown }> {
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

/**
 * Throw away what a suite wrote.
 *
 * These are test output, not somebody's work. `WHEEL_KEEP_NOTES_TESTONLY=1`
 * keeps them, for reading what the suite actually produced.
 */
export function clearNotes(): void {
  if (process.env['WHEEL_KEEP_NOTES_TESTONLY']) return;
  rmSync(notesDir, { recursive: true, force: true });
}
