/**
 * Annotating wheel.dev itself — the landing scroll and the docs.
 *
 * These pages are largely plain prose, not app screens: a docs paragraph has
 * no `connect()` and nothing in the component registry. The anchor still has
 * to describe it — a DOM path plus a quote of the text is what prose has
 * instead of components. This suite is the proof that a note drawn on a docs
 * paragraph lands on disk with enough to know what it was about.
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
  if (process.env.WHEEL_KEEP_NOTES_TESTONLY) return;
  rmSync(notesDir, { recursive: true, force: true });
});

test('a docs paragraph can be annotated, and the note can find it again', async ({ page }) => {
  await page.goto('/docs/');
  // A DIRECT child, which is what MDX prose emits — the alpha banner above
  // every docs page keeps its paragraph nested inside an <aside>, and the
  // subject here is documentation prose.
  const paragraph = page.locator('main.content > p').first();
  await expect(paragraph).toBeVisible();
  const prose = (await paragraph.innerText()).trim();

  const before = noteIds();
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();

  const box = await paragraph.boundingBox();
  await page.mouse.move(box!.x - 6, box!.y - 6);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 6, box!.y + box!.height + 6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();

  await page.getByTestId('wheel-annotate-text').fill('this paragraph buries the point');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    anchor: { element: string | null; domPath: string | null; text: string | null };
    environment: { url: string };
  };

  // No component owns a docs paragraph, so the anchor has to carry what prose
  // does have: which element, where, and what it says. The exact tag is not
  // asserted — the hit-test lands on the innermost element, which may be an
  // inline <code> or <a> inside the paragraph, and that is correct too.
  expect(payload.anchor.element).toBeTruthy();
  expect(payload.anchor.domPath).toBeTruthy();
  expect(payload.anchor.text).toBeTruthy();
  expect(prose.replace(/\s+/g, ' ').trim()).toContain(payload.anchor.text!);
  expect(payload.environment.url).toContain('/docs/');

  expect(note.markdown).toContain('# this paragraph buries the point');
  expect(note.markdown).toContain(payload.anchor.text!);
});

test('the landing page is annotatable too', async ({ page }) => {
  await page.goto('/');
  const headline = page.getByTestId('hero').locator('h1');
  await expect(headline).toBeVisible();

  const before = noteIds();
  await page.getByTestId('wheel-debug-toggle').click();
  await page.getByTestId('wheel-annotate-arm').click();
  // The chrome arrives through a dynamic import, so the picker's shield is
  // what says it is ready. Clicking before it lands hits the page instead.
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();
  const box = await headline.boundingBox();
  await page.mouse.move(box!.x - 6, box!.y - 6);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width + 6, box!.y + box!.height + 6, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('the headline oversells it');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    anchor: { instanceId: string | null; domPath: string | null; text: string | null };
  };

  // The suite serves the site with `bun run website` — a dev server, so
  // `use:viewRoot` registers and the landing sections are real components.
  // The anchor therefore carries BOTH halves here, and this asserts the
  // component half rather than settling for the DOM one: a landing page that
  // silently stopped registering its sections would be a regression worth
  // failing on.
  expect(payload.anchor.instanceId).toBeTruthy();
  expect(payload.anchor.domPath).toBeTruthy();
});
