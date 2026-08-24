/**
 * Sheet behaviors (specs/sheet.md), recorded, against both hosts.
 *
 * Two rules every behavior file follows:
 *  1. One behavior() call per spec row, instrumented actions only.
 *  2. BEHAVIORS OWN THEIR FIXTURES: each behavior writes its own cells (with
 *     values nothing else uses), reads sums dynamically instead of hardcoding
 *     seed arithmetic, and never depends on another behavior having run.
 *
 * Cell addressing is positional because that is what the user sees: the grid
 * is one table, `tbody tr` are rows 1..12 and each row's `td` are columns
 * A..H (the row-number `th` is not a `td`). Selection is the only state with
 * no text of its own — it shows as the CSS-module `cellSelected` class on the
 * `td`, which survives the production hash as a substring.
 */
import type { Locator, Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

/** The sheet's table — the only one on the page (the debug panel is divs). */
const grid = (page: Page) => page.locator('table').first();
/** The cell at a 1-based (row, col), the way the grid renders it. */
const cellAt = (page: Page, row: number, col: number) =>
  grid(page).locator('tbody tr').nth(row - 1).locator('td').nth(col - 1);
/** The Σ-footer cell for a 1-based column. */
const sumAt = (page: Page, col: number) => grid(page).locator('tfoot td').nth(col - 1);
/** Every currently selected cell (should always be exactly one). */
const selectedCells = (page: Page) => grid(page).locator('td[class*="cellSelected"]');
/** Every open cell editor in the grid (should be at most one). */
const editors = (page: Page) => grid(page).locator('input');
/** The open editor inside one cell. */
const editorIn = (cell: Locator) => cell.locator('input');
const chip = (page: Page) => page.getByTestId('inflight-chip');
const menu = (page: Page) => page.getByTestId('wheel-context-menu');
const dialog = (page: Page) => page.getByTestId('wheel-dialog-overlay');

/** Spreadsheet address for a coordinate, for readable step labels. */
const addr = (row: number, col: number) => `${String.fromCharCode(64 + col)}${row}`;

/** A per-invocation unique cell value, so runs never collide with leftovers. */
const uniqueValue = (label: string) => `${label}-${Math.random().toString(36).slice(2, 8)}`;

/** The exact rendered text of a cell (untrimmed — trimming is under test). */
const textOf = async (cell: Locator): Promise<string> => (await cell.textContent()) ?? '';

/** The Σ value of a column as a number. */
const readSum = async (page: Page, col: number): Promise<number> =>
  Number((await sumAt(page, col).textContent())?.trim());

/** Open the sheet and wait for the seeded snapshot (the embedded host boots WASM on load). */
async function openSheet(b: BehaviorContext): Promise<void> {
  await b.goto('/sheet');
  // A1's seeded value proves the engine booted, the subscription landed, and
  // the snapshot reached the cells — not merely that the table shell rendered.
  await expect(cellAt(b.page, 1, 1)).toHaveText('Item', { timeout: 20_000 });
}

/** Wait for the outbox to drain, so the next interaction isn't racing a confirm. */
async function settle(b: BehaviorContext): Promise<void> {
  await expect(chip(b.page)).not.toBeVisible({ timeout: 10_000 });
}

/** Click a cell, type a value, commit with Enter, and wait for the confirm. */
async function editCell(b: BehaviorContext, row: number, col: number, value: string): Promise<void> {
  const cell = cellAt(b.page, row, col);
  await b.click(`open ${addr(row, col)}`, cell);
  const input = editorIn(cell);
  await expect(input).toBeVisible();
  await b.fill(`type "${value}" into ${addr(row, col)}`, input, value);
  await b.press(`commit ${addr(row, col)}`, input, 'Enter');
  await expect(input).toHaveCount(0);
  await settle(b);
}

/**
 * Put the cursor on a cell and hand focus back to the grid WITHOUT editing it:
 * click (which opens the editor), then Escape (which cancels and refocuses the
 * grid's focus scope). The scoped arrow bindings only fire from there.
 */
async function selectOnly(b: BehaviorContext, row: number, col: number): Promise<void> {
  const cell = cellAt(b.page, row, col);
  await b.click(`select ${addr(row, col)}`, cell);
  const input = editorIn(cell);
  await expect(input).toBeVisible();
  await b.press(`leave ${addr(row, col)} unedited`, input, 'Escape');
  await expect(input).toHaveCount(0);
  await expect(cell).toHaveClass(/cellSelected/);
}

/** Assert the cursor is on exactly this cell. */
async function expectSelected(b: BehaviorContext, row: number, col: number): Promise<void> {
  await expect(cellAt(b.page, row, col)).toHaveClass(/cellSelected/);
  await expect(selectedCells(b.page)).toHaveCount(1);
}

/** Right-click a cell and wait for its menu. */
async function openCellMenu(b: BehaviorContext, row: number, col: number): Promise<void> {
  await b.rightClick(`open ${addr(row, col)} menu`, cellAt(b.page, row, col));
  await expect(menu(b.page)).toBeVisible();
}

// behavior: SHEET-01
behavior(
  'SHEET-01',
  'the grid renders 12 rows, columns A–H, the Σ footer, and the seeded cells',
  async (b) => {
    await openSheet(b);
    await expect(b.page.getByTestId('sync-badge')).toContainText('connected');
    // Blank corner + A..H.
    await expect(grid(b.page).locator('thead th')).toHaveCount(9);
    await expect(grid(b.page).locator('thead th').nth(1)).toHaveText('A');
    await expect(grid(b.page).locator('thead th').nth(8)).toHaveText('H');
    await expect(grid(b.page).locator('tbody tr')).toHaveCount(12);
    await expect(grid(b.page).locator('tbody td')).toHaveCount(96);
    await expect(grid(b.page).locator('tfoot td')).toHaveCount(8);
    // Seeded header row and first item, straight from the engine's snapshot.
    await expect(cellAt(b.page, 1, 2)).toHaveText('Qty');
    await expect(cellAt(b.page, 1, 3)).toHaveText('Price');
    await expect(cellAt(b.page, 2, 1)).toHaveText('Widget');
    await expect(
      b.page.getByText('Arrow keys move the selection while the grid has focus')
    ).toBeVisible();
  },
  { smoke: true }
);

// behavior: SHEET-02
behavior('SHEET-02', 'A1 is selected on load and the cursor is always exactly one cell', async (b) => {
  await openSheet(b);
  await expectSelected(b, 1, 1);
  await b.click('select D4', cellAt(b.page, 4, 4));
  await expectSelected(b, 4, 4);
  await expect(cellAt(b.page, 1, 1)).not.toHaveClass(/cellSelected/);
});

// behavior: SHEET-03
behavior('SHEET-03', 'clicking a cell selects it and opens its editor', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 3, 4);
  await b.click('open D3', cell);
  await expect(editorIn(cell)).toBeVisible();
  await expectSelected(b, 3, 4);
  // One editor at a time: clicking elsewhere moves it, never duplicates it.
  await expect(editors(b.page)).toHaveCount(1);
  await b.click('open E3', cellAt(b.page, 3, 5));
  await expect(editors(b.page)).toHaveCount(1);
  await expect(editorIn(cellAt(b.page, 3, 5))).toBeVisible();
});

// behavior: SHEET-04
behavior('SHEET-04', 'typing and pressing Enter commits the value through the round trip', async (b) => {
  await openSheet(b);
  const value = uniqueValue('committed');
  await editCell(b, 5, 4, value);
  await expect(cellAt(b.page, 5, 4)).toHaveText(value);
  await expect(editors(b.page)).toHaveCount(0);
  // settle() already waited for the confirm: a rollback would have wiped it.
  await expect(cellAt(b.page, 5, 4)).toHaveText(value);
});

// behavior: SHEET-05
behavior('SHEET-05', 'Escape cancels the edit and keeps the previous value', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 2, 1);
  const original = await textOf(cell);
  await b.click('open A2', cell);
  const input = editorIn(cell);
  await expect(input).toBeVisible();
  await b.fill('type a value that is thrown away', input, uniqueValue('discarded'));
  await b.press('cancel the edit', input, 'Escape');
  await expect(input).toHaveCount(0);
  expect(await textOf(cell)).toBe(original);
  // A cancel sends nothing, so the outbox never lights up.
  await expect(chip(b.page)).not.toBeVisible();
});

// behavior: SHEET-06
behavior('SHEET-06', 'clicking another cell commits the draft and starts editing that cell', async (b) => {
  await openSheet(b);
  const source = cellAt(b.page, 6, 2);
  const target = cellAt(b.page, 6, 3);
  const value = uniqueValue('blur-commit');
  await b.click('open B6', source);
  await expect(editorIn(source)).toBeVisible();
  await b.fill('type into B6', editorIn(source), value);
  await b.click('click C6, blurring B6', target);
  await expect(source).toHaveText(value);
  await expect(editorIn(target)).toBeVisible();
  await expect(editors(b.page)).toHaveCount(1);
  await settle(b);
  await expect(source).toHaveText(value);
});

// behavior: SHEET-07
behavior('SHEET-07', 'committing an empty value clears the cell', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 7, 5);
  await editCell(b, 7, 5, uniqueValue('to-be-cleared'));
  await editCell(b, 7, 5, '');
  expect(await textOf(cell)).toBe('');
  await expect(editors(b.page)).toHaveCount(0);
});

// behavior: SHEET-08
behavior('SHEET-08', 'committed values are trimmed', async (b) => {
  await openSheet(b);
  const value = uniqueValue('trimmed');
  await editCell(b, 8, 2, `   ${value}   `);
  // textContent, not toHaveText: playwright normalizes whitespace, so only the
  // raw text proves the padding is gone rather than merely invisible.
  expect(await textOf(cellAt(b.page, 8, 2))).toBe(value);
});

// behavior: SHEET-09
behavior('SHEET-09', 're-committing the value a cell already has sends nothing', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 1, 2);
  const existing = await textOf(cell);
  await b.click('open B1', cell);
  const input = editorIn(cell);
  await expect(input).toBeVisible();
  await b.fill('retype the same value', input, existing);
  await b.press('commit B1', input, 'Enter');
  await expect(input).toHaveCount(0);
  expect(await textOf(cell)).toBe(existing);
  // This behavior has mutated nothing, so any in-flight chip would be the
  // no-op write the equality guard is supposed to prevent.
  await expect(chip(b.page)).not.toBeVisible();
});

// behavior: SHEET-10
behavior('SHEET-10', 'arrow keys move the selection one cell in each direction', async (b) => {
  await openSheet(b);
  await selectOnly(b, 3, 3);
  await b.pressGlobal('ArrowRight');
  await expectSelected(b, 3, 4);
  await b.pressGlobal('ArrowDown');
  await expectSelected(b, 4, 4);
  await b.pressGlobal('ArrowLeft');
  await expectSelected(b, 4, 3);
  await b.pressGlobal('ArrowUp');
  await expectSelected(b, 3, 3);
});

// behavior: SHEET-11
behavior('SHEET-11', 'arrow keys clamp at the grid edges', async (b) => {
  await openSheet(b);
  await selectOnly(b, 1, 1);
  await b.pressGlobal('ArrowUp');
  await expectSelected(b, 1, 1);
  await b.pressGlobal('ArrowLeft');
  await expectSelected(b, 1, 1);
  await selectOnly(b, 12, 8);
  await b.pressGlobal('ArrowDown');
  await expectSelected(b, 12, 8);
  await b.pressGlobal('ArrowRight');
  await expectSelected(b, 12, 8);
});

// behavior: SHEET-12
behavior('SHEET-12', 'Enter opens the selected cell for editing, mouse-free', async (b) => {
  await openSheet(b);
  await selectOnly(b, 4, 2);
  await b.pressGlobal('Enter');
  const input = editorIn(cellAt(b.page, 4, 2));
  await expect(input).toBeVisible();
  const value = uniqueValue('keyboard');
  await b.fill('type into B4', input, value);
  await b.press('commit B4', input, 'Enter');
  await expect(input).toHaveCount(0);
  await settle(b);
  await expect(cellAt(b.page, 4, 2)).toHaveText(value);
});

// behavior: SHEET-13
behavior('SHEET-13', 'arrow keys inside the editor never move the selection', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 5, 2);
  await b.click('open B5', cell);
  const input = editorIn(cell);
  await expect(input).toBeVisible();
  await b.fill('type into B5', input, uniqueValue('caret'));
  await b.press('move the caret right', input, 'ArrowRight');
  await b.press('move the caret left', input, 'ArrowLeft');
  // Still the same cell, still editing it: the keyboard system skipped the
  // grid's arrow bindings because the event came from an input.
  await expect(input).toBeVisible();
  await expectSelected(b, 5, 2);
  await b.press('cancel the edit', input, 'Escape');
  await expect(input).toHaveCount(0);
});

// behavior: SHEET-14
behavior('SHEET-14', 'an Enter commit hands focus back to the grid so arrows keep working', async (b) => {
  await openSheet(b);
  const value = uniqueValue('refocus');
  await editCell(b, 6, 6, value);
  await expect(cellAt(b.page, 6, 6)).toHaveText(value);
  await b.pressGlobal('ArrowDown');
  await expectSelected(b, 7, 6);
});

// behavior: SHEET-15
behavior('SHEET-15', 'the Σ footer sums a column and updates as cells commit and clear', async (b) => {
  await openSheet(b);
  const before = await readSum(b.page, 5);
  await editCell(b, 2, 5, '12');
  await expect(sumAt(b.page, 5)).toHaveText(String(before + 12));
  await editCell(b, 3, 5, '30');
  await expect(sumAt(b.page, 5)).toHaveText(String(before + 42));
  await editCell(b, 2, 5, '');
  await expect(sumAt(b.page, 5)).toHaveText(String(before + 30));
});

// behavior: SHEET-16
behavior('SHEET-16', 'non-numeric cells are ignored by the Σ sum', async (b) => {
  await openSheet(b);
  const before = await readSum(b.page, 6);
  await editCell(b, 1, 6, '7');
  await expect(sumAt(b.page, 6)).toHaveText(String(before + 7));
  await editCell(b, 2, 6, uniqueValue('not-a-number'));
  await expect(sumAt(b.page, 6)).toHaveText(String(before + 7));
});

// behavior: SHEET-17
behavior('SHEET-17', 'the Σ sum rounds to two decimals', async (b) => {
  await openSheet(b);
  // Column G carries no seeded cells, so this behavior owns the whole sum.
  await expect(sumAt(b.page, 7)).toHaveText('0');
  await editCell(b, 1, 7, '0.1');
  await editCell(b, 2, 7, '0.2');
  // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
  await expect(sumAt(b.page, 7)).toHaveText('0.3');
});

// behavior: SHEET-18
behavior('SHEET-18', 'right-clicking a cell opens its clear menu, named for its column', async (b) => {
  await openSheet(b);
  await openCellMenu(b, 3, 2);
  await expect(menu(b.page).getByText('Clear cell')).toBeVisible();
  await expect(menu(b.page).getByText('Clear column B')).toBeVisible();
});

// behavior: SHEET-19
behavior('SHEET-19', 'Clear cell empties that one cell and closes the menu', async (b) => {
  await openSheet(b);
  const value = uniqueValue('menu-cleared');
  const neighbor = uniqueValue('untouched');
  await editCell(b, 8, 4, value);
  await editCell(b, 9, 4, neighbor);
  await openCellMenu(b, 8, 4);
  await b.click('clear D8', menu(b.page).getByText('Clear cell'));
  await expect(menu(b.page)).not.toBeVisible();
  expect(await textOf(cellAt(b.page, 8, 4))).toBe('');
  await expect(cellAt(b.page, 9, 4)).toHaveText(neighbor);
  await settle(b);
  expect(await textOf(cellAt(b.page, 8, 4))).toBe('');
});

// behavior: SHEET-20
behavior('SHEET-20', 'Clear column confirms with the letter and count, then clears the column', async (b) => {
  await openSheet(b);
  // Column H is unseeded, so this behavior owns its cell count exactly.
  await editCell(b, 5, 8, '3');
  await editCell(b, 6, 8, '4');
  await expect(sumAt(b.page, 8)).toHaveText('7');
  await openCellMenu(b, 5, 8);
  await b.click('clear column H', menu(b.page).getByText('Clear column H'));
  await expect(dialog(b.page)).toBeVisible();
  await expect(dialog(b.page)).toContainText('Clear column H?');
  await expect(dialog(b.page)).toContainText('(2 cells)');
  await b.click('confirm the clear', dialog(b.page).locator('button', { hasText: 'Clear' }).first());
  await expect(dialog(b.page)).not.toBeVisible();
  expect(await textOf(cellAt(b.page, 5, 8))).toBe('');
  expect(await textOf(cellAt(b.page, 6, 8))).toBe('');
  await expect(sumAt(b.page, 8)).toHaveText('0');
  await settle(b);
  await expect(sumAt(b.page, 8)).toHaveText('0');
});

// behavior: SHEET-21
behavior('SHEET-21', 'cancelling the clear-column confirm leaves the column intact', async (b) => {
  await openSheet(b);
  await editCell(b, 2, 8, '8');
  await expect(sumAt(b.page, 8)).toHaveText('8');
  await openCellMenu(b, 2, 8);
  await b.click('clear column H', menu(b.page).getByText('Clear column H'));
  await expect(dialog(b.page)).toBeVisible();
  await b.click('cancel the clear', dialog(b.page).locator('button', { hasText: 'Cancel' }).first());
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(cellAt(b.page, 2, 8)).toHaveText('8');
  await expect(sumAt(b.page, 8)).toHaveText('8');
});

// behavior: SHEET-22
behavior('SHEET-22', 'overwriting a populated cell survives the confirm without duplicating it', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 2, 2);
  const previous = Number((await textOf(cell)).trim());
  const before = await readSum(b.page, 2);
  await editCell(b, 2, 2, '9');
  await expect(cell).toHaveText('9');
  // The Σ is the observable duplicate detector: a second row at (2,2) would
  // count 9 twice, and a rollback would put the old value back.
  await expect(sumAt(b.page, 2)).toHaveText(String(before - previous + 9));
});

// behavior: SHEET-23
behavior('SHEET-23', 'Clear cell on an empty cell is a harmless no-op', async (b) => {
  await openSheet(b);
  const cell = cellAt(b.page, 9, 6);
  const before = await readSum(b.page, 6);
  expect(await textOf(cell)).toBe('');
  await openCellMenu(b, 9, 6);
  await b.click('clear the empty F9', menu(b.page).getByText('Clear cell'));
  await expect(menu(b.page)).not.toBeVisible();
  await settle(b);
  expect(await textOf(cell)).toBe('');
  await expect(sumAt(b.page, 6)).toHaveText(String(before));
  await expect(b.page.getByText('This page failed to render')).not.toBeVisible();
});
