/**
 * Editor behaviors (specs/editor.md), recorded, against both hosts.
 *
 * Three rules this file follows (the kanban exemplar's, plus one the editor
 * forces):
 *  1. One behavior() call per spec row, instrumented actions only.
 *  2. BEHAVIORS OWN THEIR FIXTURES: the standalone engine is reset before each
 *     behavior, so the seeded seven blocks are the starting point — but every
 *     text this file types carries a per-run unique suffix, and block ids are
 *     always read from the DOM, never assumed.
 *  3. THE CARET IS A FIXTURE TOO. There is no instrumented "put the caret at
 *     offset N" action, and Home/End mean different things per platform, so
 *     every behavior walks the caret to a known place with keys that behave
 *     identically everywhere: `caretToDocStart` clicks the first block and
 *     presses ArrowLeft once more than that block is long (ArrowLeft at the
 *     document start is a no-op), and `emptyFirstParagraph` forward-deletes
 *     from there. Both assert their own postcondition, so a fixture that
 *     drifts fails where it broke instead of one assertion later.
 *
 * Typing goes through `typeText`, one instrumented `pressGlobal` per
 * character: `fill()` on a contenteditable would replace the WHOLE document,
 * and every keystroke should show up in the recorded timeline anyway.
 */
import type { Locator, Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

// A behavior here is 20-40 recorded keystrokes of fixture before its first
// assertion, and EDITOR-40 deletes a seven-block document through the context
// menu. The 30s default is too tight for that; this ceiling is per test.
test.describe.configure({ timeout: 120_000 });

/** The seeded document's block count (EDITOR_SCHEMA.seed, editor.server.ts). */
const SEED_BLOCKS = 7;

/** The ten kinds the slash menu offers, in menu order. */
const SLASH_KINDS = [
  'Text',
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Bulleted list',
  'Numbered list',
  'To-do',
  'Quote',
  'Code',
  'Divider'
] as const;

/** The eight kinds the block context menu's "Turn into" list offers. */
const TURN_INTO_KINDS = [
  'Text',
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Bulleted list',
  'To-do',
  'Quote',
  'Code'
] as const;

/** The document's top-level blocks — one node per synced row, in order. */
const blocks = (page: Page): Locator => page.locator('.tiptap > [data-block-id]');
/** One block by row id (the join key between the doc and the rows). */
const blockById = (page: Page, blockId: string): Locator => page.locator(`[data-block-id="${blockId}"]`);
const menu = (page: Page): Locator => page.getByTestId('wheel-context-menu');
const dialog = (page: Page): Locator => page.getByTestId('wheel-dialog-overlay');
const undoButton = (page: Page): Locator => page.locator('button[title="Undo (mod+z)"]');
const redoButton = (page: Page): Locator => page.locator('button[title="Redo (mod+shift+z)"]');
/** A slash-menu entry. Its labels are unique on the page while no menu is open. */
const slashItem = (page: Page, label: string): Locator => page.getByRole('button', { name: label, exact: true });
/** A block context-menu entry — the kit stamps `role="menuitem"` on menu items (scoped, because "Turn into" labels repeat the slash menu's). */
const menuItem = (page: Page, label: string): Locator =>
  menu(page).getByRole('menuitem', { name: label, exact: true });

/** A per-invocation unique string, safe to type key-by-key. */
const unique = (): string => Math.random().toString(36).slice(2, 7);

/** Open the document and wait for the whole seed (the embedded host boots WASM on load). */
async function openEditor(b: BehaviorContext): Promise<void> {
  await b.goto('/editor');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS, { timeout: 20_000 });
}

/** Let the server confirm land before opening menus or reading history state. */
async function settled(b: BehaviorContext): Promise<void> {
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible({ timeout: 10_000 });
}

/** Type `text` one instrumented keystroke at a time (see the module doc). */
async function typeText(b: BehaviorContext, text: string): Promise<void> {
  for (const character of text) {
    await b.pressGlobal(character === ' ' ? 'Space' : character);
  }
}

/** Press one key `count` times. */
async function pressTimes(b: BehaviorContext, key: string, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await b.pressGlobal(key);
  }
}

/** The blocks' row ids, in document order. */
async function blockIds(page: Page): Promise<string[]> {
  return blocks(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-block-id') ?? ''));
}

/**
 * Caret at offset 0 of the FIRST block. Clicking lands it somewhere inside
 * that block; one ArrowLeft more than the block is long then walks it to the
 * document start, where further ArrowLefts do nothing. Machine-speed key
 * presses can race the editor's async DOM-selection sync and lose a step, so
 * the walk tops itself up until the DOM caret actually reads offset 0 — the
 * fixture asserts its own postcondition instead of failing one step later.
 */
async function caretToDocStart(b: BehaviorContext): Promise<void> {
  const first = blocks(b.page).first();
  await b.click('put the caret in the first block', first);
  const text = (await first.textContent()) ?? '';
  await pressTimes(b, 'ArrowLeft', text.length + 1);
  const domCaretOffset = (): Promise<number> =>
    b.page.evaluate(() => document.getSelection()?.anchorOffset ?? -1);
  for (let topUp = 0; topUp < text.length && (await domCaretOffset()) !== 0; topUp += 1) {
    await b.pressGlobal('ArrowLeft');
  }
  expect(await domCaretOffset()).toBe(0);
}

/**
 * Fixture: the first block emptied and turned into a paragraph, caret inside
 * it. Forward-delete never crosses the block (we press exactly as many Deletes
 * as there are characters), and Enter on an empty non-paragraph escapes to a
 * paragraph — so the block count never changes. Returns the block's row id.
 */
async function emptyFirstParagraph(b: BehaviorContext): Promise<string> {
  const first = blocks(b.page).first();
  const text = (await first.textContent()) ?? '';
  await caretToDocStart(b);
  await pressTimes(b, 'Delete', text.length);
  await expect(first).toHaveText('');
  await b.pressGlobal('Enter');
  await expect(first).toHaveJSProperty('tagName', 'P');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
  return (await first.getAttribute('data-block-id')) ?? '';
}

/** Fixture: a fresh EMPTY bullet after the first seeded bullet, caret in it. */
async function emptyBulletAfterFirst(b: BehaviorContext): Promise<string> {
  const before = await blockIds(b.page);
  await b.click('put the caret in a bullet', b.page.locator('.tiptap > [data-kind="bullet"]').first());
  await b.pressGlobal('Enter');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  const created = (await blockIds(b.page)).find((id) => !before.includes(id)) ?? '';
  expect(created).not.toBe('');
  const block = blockById(b.page, created);
  // Enter split the bullet at the caret: the new bullet holds whatever text
  // came after it, and the caret sits at its offset 0.
  await pressTimes(b, 'Delete', ((await block.textContent()) ?? '').length);
  await expect(block).toHaveText('');
  return created;
}

// behavior: EDITOR-01
behavior(
  'EDITOR-01',
  'the seeded document renders one node per synced row',
  async (b) => {
    await openEditor(b);
    await expect(b.page.locator('.tiptap > h1')).toHaveText('The wheel editor');
    await expect(b.page.locator('.tiptap > p').first()).toContainText('One tiptap editor, many blocks');
    await expect(b.page.locator('.tiptap > [data-kind="bullet"]')).toHaveCount(2);
    const todo = b.page.locator('.tiptap > [data-kind="todo"]');
    await expect(todo).toHaveCount(1);
    await expect(todo.locator('.todo-checkbox')).toHaveText('☐');
    await expect(b.page.locator('.tiptap > blockquote')).toHaveCount(1);
    await expect(b.page.locator('.tiptap > pre code')).toContainText('connectEditor');
    // The join key for the whole design: every node carries its row id.
    const ids = await blockIds(b.page);
    expect(ids).toHaveLength(SEED_BLOCKS);
    expect(ids.every((id) => id.startsWith('block_'))).toBe(true);
  },
  { smoke: true }
);

// behavior: EDITOR-02
behavior('EDITOR-02', 'inline markdown in a row renders as marks', async (b) => {
  await openEditor(b);
  const paragraph = b.page.locator('.tiptap > p').first();
  await expect(paragraph.locator('strong')).toHaveText('tiptap');
  await expect(paragraph.locator('em')).toHaveText('projection');
  await expect(b.page.locator('.tiptap > [data-kind="todo"] code')).toHaveText('cmd+z');
  // A code block is literal text: no inline parsing, no marks.
  const code = b.page.locator('.tiptap > pre');
  expect(await code.textContent()).toBe('const state = connectEditor(props);');
  await expect(code.locator('strong')).toHaveCount(0);
});

// behavior: EDITOR-03
behavior('EDITOR-03', 'a lone client renders no peer chrome', async (b) => {
  await openEditor(b);
  await caretToDocStart(b);
  await typeText(b, unique());
  // Presence is published for THIS client; it must never come back as a peer.
  await expect(undoButton(b.page)).toBeEnabled();
  await expect(b.page.locator('.peer-dot')).toHaveCount(0);
  await expect(b.page.locator('.peer-caret')).toHaveCount(0);
  await expect(b.page.locator('.peer-preview')).toHaveCount(0);
  await expect(b.page.locator('.has-peers')).toHaveCount(0);
});

// behavior: EDITOR-04
behavior('EDITOR-04', 'typing shows at once and commits after the pause', async (b) => {
  await openEditor(b);
  await expect(undoButton(b.page)).toBeDisabled();
  const typed = unique();
  await caretToDocStart(b);
  await typeText(b, typed);
  const title = blocks(b.page).first();
  await expect(title).toHaveText(`${typed}The wheel editor`);
  // The commit is what makes the keystrokes undoable.
  await expect(undoButton(b.page)).toBeEnabled();
  await settled(b);
});

// behavior: EDITOR-05
behavior('EDITOR-05', 'leaving a block commits it, so two blocks undo separately', async (b) => {
  await openEditor(b);
  const inTitle = unique();
  const inParagraph = unique();
  await caretToDocStart(b);
  await typeText(b, inTitle);
  await b.pressGlobal('ArrowDown'); // leaving the block commits it
  await typeText(b, inParagraph);
  const title = blocks(b.page).first();
  const paragraph = blocks(b.page).nth(1);
  await expect(title).toContainText(inTitle);
  await expect(paragraph).toContainText(inParagraph);
  await expect(undoButton(b.page)).toBeEnabled();
  await b.pressGlobal('ControlOrMeta+z');
  await expect(paragraph).not.toContainText(inParagraph);
  await expect(title).toContainText(inTitle);
  await b.pressGlobal('ControlOrMeta+z');
  await expect(title).toHaveText('The wheel editor');
});

// behavior: EDITOR-06
behavior('EDITOR-06', 'mod+z straight after typing still undoes it', async (b) => {
  await openEditor(b);
  const typed = unique();
  await caretToDocStart(b);
  await typeText(b, typed);
  const title = blocks(b.page).first();
  await expect(title).toContainText(typed);
  // No pause: undo flushes the uncommitted keystrokes into a mutation, then
  // undoes that mutation (D1).
  await b.pressGlobal('ControlOrMeta+z');
  await expect(title).toHaveText('The wheel editor');
});

// behavior: EDITOR-07
behavior('EDITOR-07', 'mod+shift+z redoes the undone edit', async (b) => {
  await openEditor(b);
  await expect(redoButton(b.page)).toBeDisabled();
  const typed = unique();
  await caretToDocStart(b);
  await typeText(b, typed);
  const title = blocks(b.page).first();
  await expect(undoButton(b.page)).toBeEnabled();
  await b.pressGlobal('ControlOrMeta+z');
  await expect(title).toHaveText('The wheel editor');
  await expect(redoButton(b.page)).toBeEnabled();
  await b.pressGlobal('ControlOrMeta+Shift+z');
  await expect(title).toHaveText(`${typed}The wheel editor`);
});

// behavior: EDITOR-08
behavior('EDITOR-08', 'the toolbar undo/redo buttons drive the same history', async (b) => {
  await openEditor(b);
  await expect(undoButton(b.page)).toBeDisabled();
  await expect(redoButton(b.page)).toBeDisabled();
  const typed = unique();
  await caretToDocStart(b);
  await typeText(b, typed);
  const title = blocks(b.page).first();
  await expect(undoButton(b.page)).toBeEnabled();
  await settled(b);
  await b.click('undo from the toolbar', undoButton(b.page));
  await expect(title).toHaveText('The wheel editor');
  await b.click('redo from the toolbar', redoButton(b.page));
  await expect(title).toHaveText(`${typed}The wheel editor`);
});

// behavior: EDITOR-09
behavior('EDITOR-09', 'Enter mid-block splits it and carries the caret along', async (b) => {
  await openEditor(b);
  await caretToDocStart(b);
  await pressTimes(b, 'ArrowRight', 3); // caret after "The"
  await b.pressGlobal('Enter');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  await expect(blocks(b.page).first()).toHaveText('The');
  const typed = unique();
  await typeText(b, typed); // lands in the NEW block, at its start
  await expect(blocks(b.page).nth(1)).toHaveText(`${typed} wheel editor`);
  // Prose resets: the continuation of a heading is a paragraph.
  await expect(blocks(b.page).nth(1)).toHaveJSProperty('tagName', 'P');
});

// behavior: EDITOR-10
behavior('EDITOR-10', 'Enter in a bullet creates another bullet', async (b) => {
  await openEditor(b);
  const before = await blockIds(b.page);
  await b.click('put the caret in a bullet', b.page.locator('.tiptap > [data-kind="bullet"]').first());
  await b.pressGlobal('Enter');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  const created = (await blockIds(b.page)).find((id) => !before.includes(id)) ?? '';
  expect(created).not.toBe('');
  await expect(blockById(b.page, created)).toHaveAttribute('data-kind', 'bullet');
  await expect(b.page.locator('.tiptap > [data-kind="bullet"]')).toHaveCount(3);
});

// behavior: EDITOR-11
behavior('EDITOR-11', 'Enter in an empty bullet escapes to a paragraph', async (b) => {
  await openEditor(b);
  const created = await emptyBulletAfterFirst(b);
  const block = blockById(b.page, created);
  await b.pressGlobal('Enter');
  await expect(block).toHaveJSProperty('tagName', 'P');
  // No empty list item stacked up: the same block changed kind.
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  await expect(b.page.locator('.tiptap > [data-kind="bullet"]')).toHaveCount(2);
});

// behavior: EDITOR-12
behavior('EDITOR-12', 'Backspace at a paragraph start merges it into the block above', async (b) => {
  await openEditor(b);
  await caretToDocStart(b);
  await b.pressGlobal('Enter'); // split at offset 0: the title's text moves down
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  await expect(blocks(b.page).first()).toHaveText('');
  await b.pressGlobal('Backspace'); // caret at the new block's start: merge back
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
  await expect(blocks(b.page).first()).toHaveText('The wheel editor');
  await expect(blocks(b.page).first()).toHaveJSProperty('tagName', 'H1');
});

// behavior: EDITOR-13
behavior('EDITOR-13', 'Backspace at a styled block start demotes it to a paragraph', async (b) => {
  await openEditor(b);
  await caretToDocStart(b);
  await b.pressGlobal('Backspace');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS); // nothing merged
  await expect(blocks(b.page).first()).toHaveJSProperty('tagName', 'P');
  await expect(blocks(b.page).first()).toHaveText('The wheel editor');
});

// behavior: EDITOR-14
behavior('EDITOR-14', 'Backspace at the document start changes nothing', async (b) => {
  await openEditor(b);
  const ids = await blockIds(b.page);
  await caretToDocStart(b);
  await b.pressGlobal('Backspace'); // h1 → paragraph (EDITOR-13)
  await expect(blocks(b.page).first()).toHaveJSProperty('tagName', 'P');
  await b.pressGlobal('Backspace'); // first block, nowhere to merge
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
  await expect(blocks(b.page).first()).toHaveText('The wheel editor');
  expect(await blockIds(b.page)).toEqual(ids);
});

// behavior: EDITOR-15
behavior('EDITOR-15', 'undo of a split rejoins the blocks in one step', async (b) => {
  await openEditor(b);
  await caretToDocStart(b);
  await pressTimes(b, 'ArrowRight', 3);
  await b.pressGlobal('Enter');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  await settled(b);
  await b.pressGlobal('ControlOrMeta+z');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
  await expect(blocks(b.page).first()).toHaveText('The wheel editor');
  await expect(blocks(b.page).first()).toHaveJSProperty('tagName', 'H1');
});

// behavior: EDITOR-16
behavior('EDITOR-16', 'heading prefixes turn a block into h1/h2/h3', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '# ');
  await expect(block).toHaveJSProperty('tagName', 'H1');
  await typeText(b, '## ');
  await expect(block).toHaveJSProperty('tagName', 'H2');
  await typeText(b, '### ');
  await expect(block).toHaveJSProperty('tagName', 'H3');
  // The prefix (and the space that fired it) never land in the row's text.
  await expect(block).toHaveText('');
});

// behavior: EDITOR-17
behavior('EDITOR-17', 'list and quote prefixes turn a block into that kind', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '- ');
  await expect(block).toHaveAttribute('data-kind', 'bullet');
  await typeText(b, '1. ');
  await expect(block).toHaveAttribute('data-kind', 'number');
  await typeText(b, '[] ');
  await expect(block).toHaveAttribute('data-kind', 'todo');
  await expect(block).toHaveAttribute('data-checked', 'false');
  await expect(block.locator('.todo-checkbox')).toHaveText('☐');
  await typeText(b, '> ');
  await expect(block).toHaveJSProperty('tagName', 'BLOCKQUOTE');
  await typeText(b, '* ');
  await expect(block).toHaveAttribute('data-kind', 'bullet');
  await expect(block).toHaveText('');
});

// behavior: EDITOR-18
behavior('EDITOR-18', 'the code prefix makes a code block where Enter is a newline', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '``` ');
  await expect(block).toHaveJSProperty('tagName', 'PRE');
  await typeText(b, 'x');
  await b.pressGlobal('Enter');
  // Enter inside code did NOT split the block.
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
  expect((await block.textContent()) ?? '').toContain('\n');
});

// behavior: EDITOR-19
behavior('EDITOR-19', 'Enter on a code block trailing blank line exits to a paragraph', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '``` ');
  await typeText(b, 'x');
  await b.pressGlobal('Enter'); // literal newline
  await b.pressGlobal('Enter'); // on the trailing blank line: exit
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  expect((await block.textContent()) ?? '').toBe('x'); // the blank line is dropped
  const typed = unique();
  await typeText(b, typed);
  await expect(block.locator('xpath=following-sibling::*[1]')).toHaveText(typed);
});

// behavior: EDITOR-20
behavior('EDITOR-20', 'the divider prefix makes a divider and parks the caret after it', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '--- ');
  await expect(block).toHaveAttribute('data-kind', 'divider');
  await expect(block.locator('hr')).toHaveCount(1);
  // An atom can't hold the caret, so a fresh paragraph came with it.
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 1);
  const typed = unique();
  await typeText(b, typed);
  await expect(block.locator('xpath=following-sibling::*[1]')).toHaveText(typed);
});

// behavior: EDITOR-21
behavior('EDITOR-21', 'markdown prefixes stay literal inside a code block', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '``` ');
  await expect(block).toHaveJSProperty('tagName', 'PRE');
  await typeText(b, '# heading');
  await expect(block).toHaveJSProperty('tagName', 'PRE');
  expect((await block.textContent()) ?? '').toBe('# heading');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
});

// behavior: EDITOR-22
behavior('EDITOR-22', 'slash in an empty block opens the menu of all ten kinds', async (b) => {
  await openEditor(b);
  await emptyFirstParagraph(b);
  await typeText(b, '/');
  for (const label of SLASH_KINDS) {
    await expect(slashItem(b.page, label)).toBeVisible();
  }
});

// behavior: EDITOR-23
behavior('EDITOR-23', 'the slash query filters the menu and reports no match', async (b) => {
  await openEditor(b);
  await emptyFirstParagraph(b);
  await typeText(b, '/head');
  await expect(slashItem(b.page, 'Heading 1')).toBeVisible();
  await expect(slashItem(b.page, 'Heading 2')).toBeVisible();
  await expect(slashItem(b.page, 'Heading 3')).toBeVisible();
  await expect(slashItem(b.page, 'Bulleted list')).toHaveCount(0);
  await typeText(b, 'zz');
  await expect(b.page.getByText('no match')).toBeVisible();
  await expect(slashItem(b.page, 'Heading 1')).toHaveCount(0);
});

// behavior: EDITOR-24
behavior('EDITOR-24', 'the slash arrows move the highlight and Enter applies it', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '/');
  await b.pressGlobal('ArrowDown'); // Text → Heading 1
  await b.pressGlobal('Enter');
  await expect(block).toHaveJSProperty('tagName', 'H1');
  await expect(block).toHaveText(''); // the "/query" text is gone
  await settled(b);
  await typeText(b, '/');
  await b.pressGlobal('ArrowUp'); // wraps to the last kind, Divider
  await b.pressGlobal('Enter');
  await expect(block).toHaveAttribute('data-kind', 'divider');
});

// behavior: EDITOR-25
behavior('EDITOR-25', 'clicking a slash item applies that kind', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '/quo');
  await b.click('choose Quote', slashItem(b.page, 'Quote'));
  await expect(block).toHaveJSProperty('tagName', 'BLOCKQUOTE');
  await expect(block).toHaveText(''); // the "/quo" text is removed with it
  await expect(slashItem(b.page, 'Quote')).toHaveCount(0);
});

// behavior: EDITOR-26
behavior('EDITOR-26', 'Escape closes the slash menu and keeps the text', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '/quo');
  await expect(slashItem(b.page, 'Quote')).toBeVisible();
  await b.pressGlobal('Escape');
  await expect(slashItem(b.page, 'Quote')).toHaveCount(0);
  await expect(block).toHaveText('/quo');
  await expect(block).toHaveJSProperty('tagName', 'P');
});

// behavior: EDITOR-27
behavior('EDITOR-27', 'the to-do checkbox toggles as one undoable mutation', async (b) => {
  await openEditor(b);
  const todo = b.page.locator('.tiptap > [data-kind="todo"]');
  await expect(todo).toHaveAttribute('data-checked', 'false');
  await b.click('tick the to-do', todo.locator('.todo-checkbox'));
  await expect(todo).toHaveAttribute('data-checked', 'true');
  await expect(todo.locator('.todo-checkbox')).toHaveText('☑');
  await settled(b);
  await b.pressGlobal('ControlOrMeta+z');
  await expect(todo).toHaveAttribute('data-checked', 'false');
  await expect(todo.locator('.todo-checkbox')).toHaveText('☐');
});

// behavior: EDITOR-28
behavior('EDITOR-28', 'mod+b bolds the selection', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  const typed = unique();
  await typeText(b, typed);
  await pressTimes(b, 'Shift+ArrowLeft', typed.length);
  await b.pressGlobal('ControlOrMeta+b');
  await expect(block.locator('strong')).toHaveText(typed);
});

// behavior: EDITOR-29
behavior('EDITOR-29', 'mod+i and mod+shift+x stack italic and strike', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  const typed = unique();
  await typeText(b, typed);
  await pressTimes(b, 'Shift+ArrowLeft', typed.length);
  await b.pressGlobal('ControlOrMeta+i');
  await expect(block.locator('em')).toHaveText(typed);
  await b.pressGlobal('ControlOrMeta+Shift+x');
  await expect(block.locator('s')).toHaveText(typed);
  await expect(block.locator('em')).toHaveCount(1); // both marks survive
});

// behavior: EDITOR-30
behavior('EDITOR-30', 'mod+e wraps the selection in an inline code span', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  const typed = unique();
  await typeText(b, typed);
  await pressTimes(b, 'Shift+ArrowLeft', typed.length);
  await b.pressGlobal('ControlOrMeta+e');
  await expect(block.locator('code')).toHaveText(typed);
});

// behavior: EDITOR-31
behavior('EDITOR-31', 'clicking a divider selects it and Backspace deletes it', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '--- ');
  await expect(block).toHaveAttribute('data-kind', 'divider');
  await settled(b);
  await b.click('select the divider', block);
  await b.pressGlobal('Backspace');
  await expect(block).toHaveCount(0);
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS); // divider gone, its paragraph stays
});

// behavior: EDITOR-32
behavior('EDITOR-32', 'Enter on a selected divider inserts a paragraph after it', async (b) => {
  await openEditor(b);
  const block = blockById(b.page, await emptyFirstParagraph(b));
  await typeText(b, '--- ');
  await expect(block).toHaveAttribute('data-kind', 'divider');
  await settled(b);
  await b.click('select the divider', block);
  await b.pressGlobal('Enter');
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS + 2);
  const typed = unique();
  await typeText(b, typed);
  await expect(block.locator('xpath=following-sibling::*[1]')).toHaveText(typed);
});

// behavior: EDITOR-33
behavior('EDITOR-33', 'right-clicking a block opens its menu', async (b) => {
  await openEditor(b);
  await b.rightClick('open the bullet menu', b.page.locator('.tiptap > [data-kind="bullet"]').first());
  await expect(menu(b.page)).toBeVisible();
  await expect(menu(b.page).getByText('Turn into')).toBeVisible();
  for (const label of TURN_INTO_KINDS) {
    await expect(menuItem(b.page, label)).toBeVisible();
  }
  await expect(menuItem(b.page, 'Move up')).toBeVisible();
  await expect(menuItem(b.page, 'Move down')).toBeVisible();
  await expect(menuItem(b.page, 'Delete block')).toBeVisible();
  await expect(menu(b.page).locator('button')).toHaveCount(TURN_INTO_KINDS.length + 3);
  // Numbered list and Divider are slash-menu-only kinds.
  await expect(menuItem(b.page, 'Numbered list')).toHaveCount(0);
  await expect(menuItem(b.page, 'Divider')).toHaveCount(0);
});

// behavior: EDITOR-34
behavior('EDITOR-34', 'turn into changes the block kind and keeps its text', async (b) => {
  await openEditor(b);
  const bullet = b.page.locator('.tiptap > [data-kind="bullet"]').first();
  const blockId = (await bullet.getAttribute('data-block-id')) ?? '';
  const text = (await bullet.textContent()) ?? '';
  await b.rightClick('open the bullet menu', bullet);
  await b.click('turn it into Heading 2', menuItem(b.page, 'Heading 2'));
  await expect(menu(b.page)).not.toBeVisible();
  const block = blockById(b.page, blockId);
  await expect(block).toHaveJSProperty('tagName', 'H2');
  await expect(block).toHaveText(text);
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
});

// behavior: EDITOR-35
behavior('EDITOR-35', 'move up and move down reorder the block', async (b) => {
  await openEditor(b);
  const before = await blockIds(b.page);
  await b.rightClick('open the second block menu', blocks(b.page).nth(1));
  await b.click('move it up', menuItem(b.page, 'Move up'));
  await expect
    .poll(() => blockIds(b.page))
    .toEqual([before[1], before[0], ...before.slice(2)]);
  await settled(b);
  await b.rightClick('open its menu again', blockById(b.page, before[1]));
  await b.click('move it down', menuItem(b.page, 'Move down'));
  await expect.poll(() => blockIds(b.page)).toEqual(before);
});

// behavior: EDITOR-36
behavior('EDITOR-36', 'moving past either end of the document does nothing', async (b) => {
  await openEditor(b);
  const before = await blockIds(b.page);
  await b.rightClick('open the first block menu', blocks(b.page).first());
  await b.click('try to move it up', menuItem(b.page, 'Move up'));
  await expect(menu(b.page)).not.toBeVisible();
  expect(await blockIds(b.page)).toEqual(before);
  await settled(b);
  await b.rightClick('open the last block menu', blocks(b.page).last());
  await b.click('try to move it down', menuItem(b.page, 'Move down'));
  await expect(menu(b.page)).not.toBeVisible();
  expect(await blockIds(b.page)).toEqual(before);
});

// behavior: EDITOR-37
behavior('EDITOR-37', 'cancelling the delete confirm keeps the block', async (b) => {
  await openEditor(b);
  const bullet = b.page.locator('.tiptap > [data-kind="bullet"]').first();
  const blockId = (await bullet.getAttribute('data-block-id')) ?? '';
  await b.rightClick('open the bullet menu', bullet);
  await b.click('delete the block', menuItem(b.page, 'Delete block'));
  // The menu closes first (restoring focus), then the dialog asks.
  await expect(menu(b.page)).not.toBeVisible();
  await expect(dialog(b.page)).toBeVisible();
  await expect(dialog(b.page).getByText('Delete this block?')).toBeVisible();
  await b.click('cancel', dialog(b.page).getByRole('button', { name: 'Cancel', exact: true }));
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(blockById(b.page, blockId)).toHaveCount(1);
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS);
});

// behavior: EDITOR-38
behavior('EDITOR-38', 'confirming the delete removes the block', async (b) => {
  await openEditor(b);
  const bullet = b.page.locator('.tiptap > [data-kind="bullet"]').first();
  const blockId = (await bullet.getAttribute('data-block-id')) ?? '';
  await b.rightClick('open the bullet menu', bullet);
  await b.click('delete the block', menuItem(b.page, 'Delete block'));
  await expect(dialog(b.page)).toBeVisible();
  await b.click('confirm', dialog(b.page).getByRole('button', { name: 'Confirm', exact: true }));
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(blockById(b.page, blockId)).toHaveCount(0);
  await expect(blocks(b.page)).toHaveCount(SEED_BLOCKS - 1);
});

// behavior: EDITOR-39
behavior('EDITOR-39', 'right-clicking a second block retargets the menu', async (b) => {
  await openEditor(b);
  const before = await blockIds(b.page);
  await b.rightClick('open the first bullet menu', blocks(b.page).nth(2));
  await expect(menu(b.page)).toBeVisible();
  // The open menu's dismiss scrim covers the page; `force` lets the real
  // pointerdown-dismiss → contextmenu-retarget sequence run (see rightClick).
  await b.rightClick('open the second bullet menu', blocks(b.page).nth(3), { force: true });
  await expect(menu(b.page)).toBeVisible();
  await b.click('move it up', menuItem(b.page, 'Move up'));
  // The block under the pointer moved — not the one the menu first opened on.
  await expect
    .poll(() => blockIds(b.page))
    .toEqual([before[0], before[1], before[3], before[2], ...before.slice(4)]);
});

// behavior: EDITOR-40
behavior('EDITOR-40', 'emptying the document tears the editor down and restarts it', async (b) => {
  await openEditor(b);
  for (let remaining = SEED_BLOCKS; remaining > 0; remaining -= 1) {
    await expect(blocks(b.page)).toHaveCount(remaining);
    await b.rightClick(`open the top block menu (${remaining} left)`, blocks(b.page).first());
    await b.click('delete the block', menuItem(b.page, 'Delete block'));
    await b.click('confirm', dialog(b.page).getByRole('button', { name: 'Confirm', exact: true }));
    await expect(dialog(b.page)).not.toBeVisible();
  }
  // No rows, no editor instance.
  await expect(b.page.locator('.tiptap')).toHaveCount(0);
  const addFirst = b.page.getByRole('button', { name: '+ add the first block' });
  await expect(addFirst).toBeVisible();
  await settled(b);
  await b.click('start a fresh document', addFirst);
  await expect(blocks(b.page)).toHaveCount(1);
  const typed = unique();
  await b.click('put the caret in the new block', blocks(b.page).first());
  await typeText(b, typed);
  await expect(blocks(b.page).first()).toHaveText(typed);
});
