/**
 * Kanban behaviors (specs/kanban.md), recorded, against both hosts.
 *
 * The exemplar for the 016 behavior-test pattern. Two rules every behavior
 * file follows:
 *  1. One behavior() call per spec row, instrumented actions only.
 *  2. BEHAVIORS OWN THEIR FIXTURES: the standalone host's server accumulates
 *     mutations across runs, so a behavior creates the uniquely-named cards
 *     it needs and never depends on seed rows or run order.
 */
import type { Locator, Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

const cards = (page: Page) => page.locator('article');
const menu = (page: Page) => page.getByTestId('wheel-context-menu');
const dialog = (page: Page) => page.getByTestId('wheel-dialog-overlay');
const bulkDelete = (page: Page) => page.locator('button[title^="Delete selected cards"]');

/** A per-invocation unique card title, so runs never collide with leftovers. */
const uniqueTitle = (label: string) => `${label} ${Math.random().toString(36).slice(2, 8)}`;

/** Open the board and wait for hydration (the embedded host boots WASM on load). */
async function openBoard(b: BehaviorContext): Promise<void> {
  await b.goto('/kanban');
  await expect(b.page.getByPlaceholder('Add a card…').first()).toBeVisible({ timeout: 20_000 });
}

/** Create a card in the FIRST column (To do) via the add form; returns its locator. */
async function addCard(b: BehaviorContext, title: string, tag?: string): Promise<Locator> {
  const input = b.page.getByPlaceholder('Add a card…').first();
  if (tag) {
    await b.fill('set card tag', b.page.getByPlaceholder('tag').first(), tag);
  }
  await b.fill(`type card "${title}"`, input, title);
  await b.press('submit card', input, 'Enter');
  const card = cards(b.page).filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  // Let the server confirm settle before interacting further: a confirm delta
  // replaces the row identity mid-flight, which re-creates dependent DOM (e.g.
  // an open context menu's items) under playwright's actionability checks.
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible({ timeout: 10_000 });
  return card;
}

// behavior: KANBAN-01
behavior(
  'KANBAN-01',
  'the board renders three columns with add forms and cards',
  async (b) => {
    await openBoard(b);
    for (const column of ['To do', 'Doing', 'Done']) {
      await expect(b.page.getByText(column, { exact: false }).first()).toBeVisible();
    }
    expect(await b.page.getByPlaceholder('Add a card…').count()).toBe(3);
  },
  { smoke: true }
);

// behavior: KANBAN-02
behavior('KANBAN-02', 'the add form appends a card to its column', async (b) => {
  await openBoard(b);
  const title = uniqueTitle('added card');
  await addCard(b, title);
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(1);
});

// behavior: KANBAN-03
behavior('KANBAN-03', 'the arrow buttons move a card to the neighboring column', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('mover'));
  // In the first column the card can only move right (one arrow)...
  await expect(card.locator('button[title^="Move to"]')).toHaveCount(1);
  await b.click('move card right', card.locator('button[title^="Move to"]').first());
  // ...in the middle column it moves in BOTH directions.
  await expect(card.locator('button[title^="Move to"]')).toHaveCount(2);
});

// behavior: KANBAN-04
behavior('KANBAN-04', 'right-click opens the card menu with delete and move entries', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('menu card'));
  await b.rightClick('open card menu', card);
  await expect(menu(b.page)).toBeVisible();
  await expect(menu(b.page).getByText('Delete card')).toBeVisible();
  // Three columns → two "Move to" targets for any card.
  await expect(menu(b.page).locator('button', { hasText: 'Move to' })).toHaveCount(2);
});

// behavior: KANBAN-05
behavior('KANBAN-05', 'a moved card keeps rendering and its context menu still opens', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('regression card'));
  // This exact move crashed the page before context-menu id supersession.
  await b.click('move card right', card.locator('button[title^="Move to"]').first());
  await expect(b.page.getByText('This page failed to render')).not.toBeVisible();
  await b.rightClick('open moved card menu', card);
  await expect(menu(b.page)).toBeVisible();
  await expect(menu(b.page).getByText('Delete card')).toBeVisible();
});

// behavior: KANBAN-06
behavior('KANBAN-06', 'the context menu deletes the card', async (b) => {
  await openBoard(b);
  const title = uniqueTitle('doomed card');
  const card = await addCard(b, title);
  await b.rightClick('open card menu', card);
  await b.click('delete card', menu(b.page).getByText('Delete card'));
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(0);
});

// behavior: KANBAN-07
behavior('KANBAN-07', 'clicking toggles selection and enables bulk delete with a count', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('selectable'));
  await expect(bulkDelete(b.page)).toBeDisabled();
  await b.click('select the card', card);
  await expect(bulkDelete(b.page)).toBeEnabled();
  await expect(bulkDelete(b.page)).toContainText('1');
  await b.click('deselect the card', card);
  await expect(bulkDelete(b.page)).toBeDisabled();
});

// behavior: KANBAN-08
behavior('KANBAN-08', 'escape clears the selection', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('escapee'));
  await b.click('select the card', card);
  await expect(bulkDelete(b.page)).toBeEnabled();
  await b.pressGlobal('Escape');
  await expect(bulkDelete(b.page)).toBeDisabled();
});

// behavior: KANBAN-09
behavior('KANBAN-09', 'backspace bulk-deletes the selection behind a confirm', async (b) => {
  await openBoard(b);
  const first = uniqueTitle('bulk one');
  const second = uniqueTitle('bulk two');
  await b.click('select first card', await addCard(b, first));
  await b.click('select second card', await addCard(b, second));
  await expect(bulkDelete(b.page)).toContainText('2');
  await b.pressGlobal('Backspace');
  await expect(dialog(b.page)).toBeVisible();
  await b.click('confirm delete', dialog(b.page).locator('button', { hasText: 'Delete' }).first());
  await expect(cards(b.page).filter({ hasText: first })).toHaveCount(0);
  await expect(cards(b.page).filter({ hasText: second })).toHaveCount(0);
  await expect(bulkDelete(b.page)).toBeDisabled();
});

// behavior: KANBAN-10
behavior('KANBAN-10', 'cancelling the bulk-delete confirm keeps the cards', async (b) => {
  await openBoard(b);
  const title = uniqueTitle('survivor');
  const card = await addCard(b, title);
  await b.click('select the card', card);
  await b.pressGlobal('Backspace');
  await expect(dialog(b.page)).toBeVisible();
  await b.click('cancel delete', dialog(b.page).locator('button', { hasText: 'Cancel' }).first());
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(1);
  // The selection survives a cancel.
  await expect(bulkDelete(b.page)).toBeEnabled();
});

// behavior: KANBAN-11
behavior('KANBAN-11', 'the tag filter narrows the board and clear restores it', async (b) => {
  await openBoard(b);
  const tag = `tag${Math.random().toString(36).slice(2, 7)}`;
  const first = uniqueTitle('tagged one');
  const second = uniqueTitle('tagged two');
  await addCard(b, first, tag);
  await addCard(b, second, tag);
  const before = await cards(b.page).count();
  await b.click(`filter by "${tag}"`, b.page.locator('button', { hasText: new RegExp(`^${tag}$`) }).first());
  // The unique tag matches exactly the two cards this behavior created.
  await expect(cards(b.page)).toHaveCount(2);
  await b.click('clear the filter', b.page.locator('button', { hasText: /^clear$/ }));
  await expect(cards(b.page)).toHaveCount(before);
});

// behavior: KANBAN-12
behavior('KANBAN-12', 'the context menu moves a card to a named column', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('destined for Done'));
  await b.rightClick('open card menu', card);
  await b.click('move to Done', menu(b.page).locator('button', { hasText: 'Move to Done' }));
  await expect(menu(b.page)).not.toBeVisible();
  // Done is the last column: the card can only move left now.
  await expect(card.locator('button[title^="Move to"]')).toHaveCount(1);
  await expect(card.locator('button[title="Move to Doing"]')).toHaveCount(1);
});

// behavior: KANBAN-13
behavior('KANBAN-13', 'the palette runs bulk delete into the same confirm flow', async (b) => {
  await openBoard(b);
  const title = uniqueTitle('palette victim');
  await b.click('select the card', await addCard(b, title));
  await b.pressGlobal('ControlOrMeta+k');
  await expect(b.page.getByTestId('wheel-palette')).toBeVisible();
  await b.click('run delete command', b.page.getByTestId('wheel-palette-item-board.deleteSelection'));
  await expect(dialog(b.page)).toBeVisible();
  await b.click('confirm delete', dialog(b.page).locator('button', { hasText: 'Delete' }).first());
  await expect(cards(b.page).filter({ hasText: title })).toHaveCount(0);
});

// behavior: KANBAN-14
behavior('KANBAN-14', 'selection-gated palette commands only appear with a selection', async (b) => {
  await openBoard(b);
  const card = await addCard(b, uniqueTitle('gate check'));
  await b.pressGlobal('ControlOrMeta+k');
  await expect(b.page.getByTestId('wheel-palette')).toBeVisible();
  await expect(b.page.getByTestId('wheel-palette-item-board.clearSelection')).not.toBeVisible();
  await b.pressGlobal('Escape');
  await expect(b.page.getByTestId('wheel-palette')).not.toBeVisible();
  await b.click('select the card', card);
  await b.pressGlobal('ControlOrMeta+k');
  await expect(b.page.getByTestId('wheel-palette-item-board.clearSelection')).toBeVisible();
});
