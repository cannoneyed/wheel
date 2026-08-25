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
  // A DIRECT child, which is what MDX prose emits — the alpha banner above
  // every docs page keeps its paragraph nested inside an <aside>, and the
  // subject here is documentation prose.
  const paragraph = page.locator('main.content > p').first();
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
  // does have: which element, where, and what it says. The exact tag is not
  // asserted — a click lands on the innermost element, which may be an inline
  // <code> or <a> inside the paragraph, and that is a correct anchor too.
  expect(payload.anchor.kind).toBe('element');
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
  await page.getByTestId('wheel-annotate-chip').click();
  // The chrome arrives through a dynamic import, so the picker's shield is
  // what says it is ready. Clicking before it lands hits the page instead.
  await expect(page.getByTestId('wheel-annotate-shield')).toBeVisible();
  const box = await headline.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

  await expect(page.getByTestId('wheel-annotate-composer')).toBeVisible();
  await page.getByTestId('wheel-annotate-text').fill('the headline oversells it');
  await page.getByTestId('wheel-annotate-save').click();

  const note = await savedNote(before);
  const payload = note.payload as {
    anchor: { kind: string; instanceId: string | null; domPath: string | null; text: string | null };
  };

  // The landing sections carry `use:viewRoot`, so in a dev build they register
  // and the picker gets the STRONGER anchor — a component instance. A
  // production build does not register view components, and the same click
  // falls to an element anchor. Either is fine; what must hold is that the
  // note carries something that can find the target again.
  expect(['instance', 'element']).toContain(payload.anchor.kind);
  expect(payload.anchor.instanceId ?? payload.anchor.domPath).toBeTruthy();
});
