/**
 * Todos behaviors (specs/todos.md), recorded, against both hosts.
 *
 * Two rules every behavior file follows:
 *  1. One behavior() call per spec row, instrumented actions only.
 *  2. BEHAVIORS OWN THEIR FIXTURES: create uniquely-named todos, read counts
 *     dynamically, never assert on seed text or run order.
 *
 * One trap this demo has and kanban does not: the row checkbox is an
 * `<input>`, so clicking it leaves focus on an editable target and the
 * keyboard system (correctly) refuses to fire single-key and `mod+…`
 * bindings. Behaviors that check a box and then press a shortcut click the
 * page heading first to drop focus back to the body — the same thing a user's
 * next click does.
 */
import type { Locator, Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

const ADD_PLACEHOLDER = 'Add a todo… (press n)';

const addInput = (page: Page) => page.getByPlaceholder(ADD_PLACEHOLDER);
/** Todo rows. `/todos` renders the only `<li>` elements on the page. */
const rows = (page: Page) => page.locator('li');
const rowFor = (page: Page, text: string) => rows(page).filter({ hasText: text }).first();
const checkbox = (row: Locator) => row.locator('input[type="checkbox"]');
/** The row's text span — the element the done state strikes through. */
const rowText = (row: Locator) => row.locator('span').first();
const menu = (page: Page) => page.getByTestId('wheel-context-menu');
const dialog = (page: Page) => page.getByTestId('wheel-dialog-overlay');
const clearCompleted = (page: Page) => page.locator('button', { hasText: /^Clear completed \(\d+\)$/ });
/** The toolbar's "N remaining" span (no other span on the page reads that way). */
const remainingLabel = (page: Page) => page.locator('span').filter({ hasText: /^\d+ remaining$/ }).first();
/** Blur target: the header title, which is not focusable, so clicking it focuses the body. */
const heading = (page: Page) => page.getByRole('heading', { name: 'Todos' });

/** A per-invocation unique todo text, so runs never collide with leftovers. */
const uniqueText = (label: string) => `${label} ${Math.random().toString(36).slice(2, 8)}`;

/** Open the list and wait for hydration (the embedded host boots WASM on load). */
async function openTodos(b: BehaviorContext, search = ''): Promise<void> {
  await b.goto(`/todos${search}`);
  await expect(addInput(b.page)).toBeVisible({ timeout: 20_000 });
  // Hydration gate: the add input renders before the snapshot lands (the
  // embedded host is booting a WASM engine); reads like the remaining count
  // are only meaningful once the seeded rows are in. Both hosts always seed.
  await expect(rows(b.page).first()).toBeVisible({ timeout: 20_000 });
}

/** Wait for the server confirm to land — an in-flight row identity swap re-creates dependent DOM. */
async function settled(b: BehaviorContext): Promise<void> {
  await expect(b.page.getByTestId('inflight-chip')).not.toBeVisible({ timeout: 10_000 });
}

/** Add a todo through the input + Enter; returns its row once the write has settled. */
async function addTodo(b: BehaviorContext, text: string): Promise<Locator> {
  const input = addInput(b.page);
  await b.fill(`type "${text}"`, input, text);
  await b.press('submit todo', input, 'Enter');
  const row = rowFor(b.page, text);
  await expect(row).toBeVisible();
  await settled(b);
  return row;
}

/** Check a todo's box and settle, then drop focus so shortcuts can fire. */
async function markDone(b: BehaviorContext, row: Locator): Promise<void> {
  await b.click('check the todo', checkbox(row));
  await expect(checkbox(row)).toBeChecked();
  await settled(b);
}

/** The number the toolbar currently reports as remaining. */
async function readRemaining(page: Page): Promise<number> {
  const label = await remainingLabel(page).innerText();
  return Number(label.trim().split(' ')[0]);
}

// behavior: TODOS-01
behavior(
  'TODOS-01',
  'the list renders the add row, the remaining count and the synced todos',
  async (b) => {
    await openTodos(b);
    await expect(b.page.locator('button[title="Add todo"]')).toBeVisible();
    await expect(remainingLabel(b.page)).toBeVisible();
    // Seeded rows arrived through subscribe → cache → view.
    expect(await rows(b.page).count()).toBeGreaterThan(0);
  },
  { smoke: true }
);

// behavior: TODOS-02
behavior('TODOS-02', 'Enter in the add input appends a todo and clears the draft', async (b) => {
  await openTodos(b);
  const text = uniqueText('added todo');
  await addTodo(b, text);
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(1);
  await expect(addInput(b.page)).toHaveValue('');
});

// behavior: TODOS-03
behavior('TODOS-03', 'the add button submits the draft too', async (b) => {
  await openTodos(b);
  const text = uniqueText('button todo');
  await b.fill(`type "${text}"`, addInput(b.page), text);
  await b.click('press the add button', b.page.locator('button[title="Add todo"]'));
  await expect(rowFor(b.page, text)).toBeVisible();
  await expect(addInput(b.page)).toHaveValue('');
});

// behavior: TODOS-04
behavior('TODOS-04', 'a whitespace-only draft adds nothing', async (b) => {
  await openTodos(b);
  const before = await rows(b.page).count();
  const input = addInput(b.page);
  await b.fill('type only spaces', input, '   ');
  await b.press('try to submit', input, 'Enter');
  await expect(rows(b.page)).toHaveCount(before);
  // The draft is untouched: submit() bails before clearing it.
  await expect(input).toHaveValue('   ');
});

// behavior: TODOS-05
behavior('TODOS-05', 'the checkbox toggles done and strikes the text through', async (b) => {
  await openTodos(b);
  const text = uniqueText('toggle me');
  const row = await addTodo(b, text);
  await expect(checkbox(row)).not.toBeChecked();
  await b.click('check the todo', checkbox(row));
  await expect(checkbox(row)).toBeChecked();
  await expect(rowText(row)).toHaveCSS('text-decoration-line', 'line-through');
  await settled(b);
  await b.click('uncheck the todo', checkbox(row));
  await expect(checkbox(row)).not.toBeChecked();
  await expect(rowText(row)).not.toHaveCSS('text-decoration-line', 'line-through');
});

// behavior: TODOS-06
behavior('TODOS-06', 'the remaining count follows the open todos', async (b) => {
  await openTodos(b);
  const baseline = await readRemaining(b.page);
  const text = uniqueText('counted');
  const row = await addTodo(b, text);
  expect(await readRemaining(b.page)).toBe(baseline + 1);
  await markDone(b, row);
  expect(await readRemaining(b.page)).toBe(baseline);
  // Deleting an already-done todo cannot move the open count.
  await b.click('delete the done todo', row.locator('button[title="Delete todo"]'));
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(0);
  expect(await readRemaining(b.page)).toBe(baseline);
});

// behavior: TODOS-07
behavior('TODOS-07', 'the trash button deletes the todo', async (b) => {
  await openTodos(b);
  const text = uniqueText('doomed todo');
  const row = await addTodo(b, text);
  await b.click('delete the todo', row.locator('button[title="Delete todo"]'));
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(0);
});

// behavior: TODOS-08
behavior('TODOS-08', 'right-click opens the row menu with toggle and delete', async (b) => {
  await openTodos(b);
  const row = await addTodo(b, uniqueText('menu todo'));
  await b.rightClick('open the row menu', row);
  await expect(menu(b.page)).toBeVisible();
  await expect(menu(b.page).getByText('Mark as done')).toBeVisible();
  await expect(menu(b.page).getByText('Delete todo')).toBeVisible();
});

// behavior: TODOS-09
behavior('TODOS-09', 'a done row offers "Mark as not done"', async (b) => {
  await openTodos(b);
  const row = await addTodo(b, uniqueText('already done'));
  await markDone(b, row);
  await b.rightClick('open the done row menu', row);
  await expect(menu(b.page).getByText('Mark as not done')).toBeVisible();
});

// behavior: TODOS-10
behavior('TODOS-10', 'the menu toggle marks the todo done and closes', async (b) => {
  await openTodos(b);
  const row = await addTodo(b, uniqueText('menu toggle'));
  await b.rightClick('open the row menu', row);
  await b.click('mark as done', menu(b.page).getByText('Mark as done'));
  await expect(menu(b.page)).not.toBeVisible();
  await expect(checkbox(row)).toBeChecked();
});

// behavior: TODOS-11
behavior('TODOS-11', 'the menu deletes the todo and closes', async (b) => {
  await openTodos(b);
  const text = uniqueText('menu victim');
  const row = await addTodo(b, text);
  await b.rightClick('open the row menu', row);
  await b.click('delete the todo', menu(b.page).getByText('Delete todo'));
  await expect(menu(b.page)).not.toBeVisible();
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(0);
});

// behavior: TODOS-12
behavior('TODOS-12', 'escape closes the row menu and changes nothing', async (b) => {
  await openTodos(b);
  const text = uniqueText('escape menu');
  const row = await addTodo(b, text);
  await b.rightClick('open the row menu', row);
  await expect(menu(b.page)).toBeVisible();
  await b.pressGlobal('Escape');
  await expect(menu(b.page)).not.toBeVisible();
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(1);
  await expect(checkbox(row)).not.toBeChecked();
});

// behavior: TODOS-13
behavior('TODOS-13', 'clear completed appears only once something is done', async (b) => {
  await openTodos(b);
  // Both hosts start from a freshly seeded engine: nothing is done yet.
  await expect(b.page.locator('li input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(clearCompleted(b.page)).toHaveCount(0);
  const row = await addTodo(b, uniqueText('completer'));
  await markDone(b, row);
  await expect(clearCompleted(b.page)).toBeVisible();
  await expect(clearCompleted(b.page)).toHaveText('Clear completed (1)');
});

// behavior: TODOS-14
behavior('TODOS-14', 'clear completed confirms, then deletes every done todo', async (b) => {
  await openTodos(b);
  const doneOne = uniqueText('clear one');
  const doneTwo = uniqueText('clear two');
  const open = uniqueText('survivor');
  await markDone(b, await addTodo(b, doneOne));
  await markDone(b, await addTodo(b, doneTwo));
  await addTodo(b, open);
  await expect(clearCompleted(b.page)).toHaveText('Clear completed (2)');
  await b.click('clear completed', clearCompleted(b.page));
  await expect(dialog(b.page)).toBeVisible();
  await expect(dialog(b.page)).toContainText('Clear 2 completed todos?');
  await b.click('confirm the clear', dialog(b.page).locator('button', { hasText: 'Clear' }).first());
  await expect(rows(b.page).filter({ hasText: doneOne })).toHaveCount(0);
  await expect(rows(b.page).filter({ hasText: doneTwo })).toHaveCount(0);
  await expect(rows(b.page).filter({ hasText: open })).toHaveCount(1);
  await expect(clearCompleted(b.page)).toHaveCount(0);
});

// behavior: TODOS-15
behavior('TODOS-15', 'cancelling the clear-completed confirm keeps every todo', async (b) => {
  await openTodos(b);
  const text = uniqueText('kept todo');
  const row = await addTodo(b, text);
  await markDone(b, row);
  await b.click('clear completed', clearCompleted(b.page));
  await expect(dialog(b.page)).toBeVisible();
  await b.click('cancel the clear', dialog(b.page).locator('button', { hasText: 'Cancel' }).first());
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(1);
  await expect(checkbox(row)).toBeChecked();
  await expect(clearCompleted(b.page)).toBeVisible();
});

// behavior: TODOS-16
behavior('TODOS-16', 'mod+backspace runs the same confirm-then-clear flow', async (b) => {
  await openTodos(b);
  const text = uniqueText('shortcut clear');
  await markDone(b, await addTodo(b, text));
  // Focus sits on the checkbox after checking it, and shortcuts never fire
  // from editable targets — clicking the title hands focus back to the body.
  await b.click('drop focus to the page', heading(b.page));
  await b.pressGlobal('ControlOrMeta+Backspace');
  await expect(dialog(b.page)).toBeVisible();
  await expect(dialog(b.page)).toContainText('Clear 1 completed todo?');
  await b.click('confirm the clear', dialog(b.page).locator('button', { hasText: 'Clear' }).first());
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(0);
});

// behavior: TODOS-17
behavior('TODOS-17', 'mod+backspace is inert while nothing is done', async (b) => {
  await openTodos(b);
  const before = await rows(b.page).count();
  await expect(b.page.locator('li input[type="checkbox"]:checked')).toHaveCount(0);
  await b.pressGlobal('ControlOrMeta+Backspace');
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(rows(b.page)).toHaveCount(before);
});

// behavior: TODOS-18
behavior('TODOS-18', 'n focuses the add input without typing the letter', async (b) => {
  await openTodos(b);
  await b.click('drop focus to the page', heading(b.page));
  await expect(addInput(b.page)).not.toBeFocused();
  await b.pressGlobal('n');
  await expect(addInput(b.page)).toBeFocused();
  await expect(addInput(b.page)).toHaveValue('');
});

// behavior: TODOS-19
behavior('TODOS-19', 'n inside the add input types instead of firing the shortcut', async (b) => {
  await openTodos(b);
  const input = addInput(b.page);
  await b.click('focus the add input', input);
  await b.press('type the letter', input, 'n');
  await expect(input).toHaveValue('n');
  await b.fill('clear the draft', input, '');
});

// behavior: TODOS-20
behavior('TODOS-20', 'shortcuts are gated while the confirm dialog owns focus', async (b) => {
  await openTodos(b);
  const text = uniqueText('gated todo');
  const row = await addTodo(b, text);
  await markDone(b, row);
  await b.click('drop focus to the page', heading(b.page));
  await b.pressGlobal('ControlOrMeta+Backspace');
  await expect(dialog(b.page)).toBeVisible();
  // A second press cannot stack another dialog…
  await b.pressGlobal('ControlOrMeta+Backspace');
  await expect(dialog(b.page)).toHaveCount(1);
  // …and `n` cannot pull focus out of the overlay.
  await b.pressGlobal('n');
  await expect(addInput(b.page)).not.toBeFocused();
  await b.pressGlobal('Escape');
  await expect(dialog(b.page)).not.toBeVisible();
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(1);
  await expect(checkbox(row)).toBeChecked();
});

// behavior: TODOS-21
behavior('TODOS-21', 'a new todo renders before the server confirms it', async (b) => {
  await openTodos(b);
  const text = uniqueText('optimistic todo');
  const input = addInput(b.page);
  await b.fill(`type "${text}"`, input, text);
  await b.press('submit todo', input, 'Enter');
  // Optimistic write: the row is on screen while the mutation is still in flight.
  await expect(rowFor(b.page, text)).toBeVisible();
  await expect(b.page.getByTestId('inflight-chip')).toBeVisible();
  await settled(b);
  await expect(b.page.getByTestId('sync-badge')).toContainText('connected');
  await expect(rowFor(b.page, text)).toBeVisible();
});

// behavior: TODOS-22
behavior('TODOS-22', 'the in-browser engine (?sync=local) boots and round-trips an add', async (b) => {
  await openTodos(b, '?sync=local');
  // The badge reports the WASM worker engine accepted the connection.
  await expect(b.page.getByTestId('sync-badge')).toContainText('connected', { timeout: 20_000 });
  expect(await rows(b.page).count()).toBeGreaterThan(0);
  const text = uniqueText('serverless todo');
  await addTodo(b, text);
  await expect(rows(b.page).filter({ hasText: text })).toHaveCount(1);
  await expect(b.page.getByTestId('sync-badge')).toContainText('connected');
});
