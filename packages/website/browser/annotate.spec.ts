/**
 * Annotating wheel.dev itself — the landing scroll and the docs.
 *
 * These pages are plain Solid, not wheel apps: no `connect()`, no components
 * in the registry, nothing to pick by instance id. So the annotator falls to
 * ELEMENT anchors — a DOM path plus a quote of the text, which is what prose
 * has instead of components. This suite is the proof that a note on a docs
 * paragraph still lands on disk with enough to find that paragraph again.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/** The website roots at its own package, so notes land under it. */
const notesDir = resolve(fileURLToPath(new URL('..', import.meta.url)), '.wheel/notes');

function noteIds(): string[] {
  return existsSync(notesDir) ? readdirSync(notesDir).sort() : [];
}

/** Wait for a note directory that was not there before, and read it back. */
async function savedNote(before: string[]): Promise<{ markdown: string; payload: unknown }> {
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
    markdown: readFileSync(join(notesDir, id, 'note.md'), 'utf8'),
    payload: JSON.parse(readFileSync(join(notesDir, id, 'note.json'), 'utf8'))
  };
}

test.afterAll(() => {
  if (process.env.WHEEL_KEEP_NOTES) return;
  rmSync(notesDir, { recursive: true, force: true });
});

test('a docs paragraph can be annotated, and the note can find it again', async ({ page }) => {
  await page.goto('/docs/');
  const paragraph = page.locator('main.content p').first();
  await expect(paragraph).toBeVisible();
  const prose = (await paragraph.innerText()).trim();

  const before = noteIds();
  await page.getByTestId('wheel-annotate-chip').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const box = await paragraph.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();

  await page.getByTestId('wheel-annotate-text').fill('this paragraph buries the point');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    anchor: { kind: string; element: string | null; domPath: string | null; text: string | null };
    environment: { url: string };
  };

  // No component owns a docs paragraph, so the anchor has to carry what prose
  // does have: which element, where, and what it says.
  expect(payload.anchor.kind).toBe('element');
  expect(payload.anchor.element).toBe('p');
  expect(payload.anchor.domPath).toBeTruthy();
  expect(prose.startsWith(payload.anchor.text!)).toBe(true);
  expect(payload.environment.url).toContain('/docs/');

  expect(note.markdown).toContain('# this paragraph buries the point');
  expect(note.markdown).toContain(payload.anchor.text!);
});

test('the landing page is annotatable too', async ({ page }) => {
  await page.goto('/');
  const headline = page.getByTestId('hero').locator('h1');
  await expect(headline).toBeVisible();

  const before = noteIds();
  await page.getByTestId('wheel-annotate-chip').click();
  const box = await headline.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('the headline oversells it');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as { anchor: { kind: string; element: string | null } };
  expect(payload.anchor.kind).toBe('element');
  expect(payload.anchor.element).toBe('h1');
});
