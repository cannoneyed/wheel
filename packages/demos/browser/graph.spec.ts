/**
 * Graph behaviors (specs/graph.md), recorded, against both hosts.
 *
 * Driving a WebGL canvas from Playwright, honestly:
 *
 *  1. Everything the canvas KNOWS is mirrored into the sidebar, so most
 *     behaviors are ordinary DOM assertions on counts, labels and pin state.
 *  2. Everything the canvas DRAWS that a test still has to reach — where a
 *     node currently is — comes from the label overlay: real `<span>`s the
 *     renderer positions each frame, carrying `data-graph-label`. Read a
 *     span's box, offset upward by the label's own gap, and you have the
 *     node's centre in page coordinates.
 *  3. A running force simulation moves nodes between "read the box" and
 *     "click there", so any behavior that touches the canvas waits for
 *     `data-settled="true"` first. Every row change reheats the layout, so
 *     the wait goes immediately after load, before any mutation.
 *
 * As in the sheet suite, BEHAVIORS OWN THEIR FIXTURES: each one adds the
 * packages it needs with names nothing else uses, and reads counts
 * dynamically rather than hardcoding seed arithmetic.
 */
import type { Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

/** The gap the renderer leaves between a node's centre and its label's top. */
const LABEL_GAP = 10;

const stage = (page: Page) => page.getByTestId('graph-stage');
const counts = (page: Page) => page.getByTestId('graph-counts');
const nodeList = (page: Page) => page.getByTestId('graph-node-list');
const nodeButton = (page: Page, label: string) => nodeList(page).getByRole('button', { name: label, exact: true });
const selection = (page: Page) => page.getByTestId('graph-selection');
const selectedLabel = (page: Page) => page.getByTestId('graph-selected-label');
const pinState = (page: Page) => page.getByTestId('graph-pin-state');
const simState = (page: Page) => page.getByTestId('graph-sim-state');
const edgeList = (page: Page) => page.getByTestId('graph-edge-list');
const canvasLabel = (page: Page, label: string) => page.locator(`[data-graph-label="${label}"]`);
const chip = (page: Page) => page.getByTestId('inflight-chip');

/** A per-invocation unique package name, so runs never collide with leftovers. */
const uniqueName = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

/** Open the demo and wait for the seeded graph to arrive (the embedded host boots WASM first). */
async function openGraph(b: BehaviorContext): Promise<void> {
  await b.goto('/graph');
  // A seeded package proves the engine booted, both subscriptions landed, and
  // the rows reached the sidebar — not merely that the shell rendered.
  await expect(nodeButton(b.page, 'kernel')).toBeVisible({ timeout: 25_000 });
}

/** Wait for the force simulation to cool, so node positions stop moving. */
async function waitSettled(b: BehaviorContext): Promise<void> {
  await expect(stage(b.page)).toHaveAttribute('data-settled', 'true', { timeout: 30_000 });
}

/** Wait for the outbox to drain, so the next interaction isn't racing a confirm. */
async function settleSync(b: BehaviorContext): Promise<void> {
  await expect(chip(b.page)).not.toBeVisible({ timeout: 15_000 });
}

/** The page-coordinate centre of a node, derived from its label overlay span. */
async function nodeCentre(page: Page, label: string): Promise<{ x: number; y: number }> {
  const box = await canvasLabel(page, label).boundingBox();
  if (!box) {
    throw new Error(`no canvas label for "${label}" — the renderer never drew it`);
  }
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y - LABEL_GAP) };
}

/** Read "N nodes · M edges" as numbers. */
async function readCounts(page: Page): Promise<{ nodes: number; edges: number }> {
  const text = (await counts(page).textContent()) ?? '';
  const numbers = [...text.matchAll(/(\d+)/g)].map((match) => Number(match[1]));
  return { nodes: numbers[0] ?? -1, edges: numbers[1] ?? -1 };
}

/** Select a package through the sidebar list (never through the canvas). */
async function selectPackage(b: BehaviorContext, label: string): Promise<void> {
  await b.click(`select ${label}`, nodeButton(b.page, label));
  await expect(selectedLabel(b.page)).toHaveText(label);
}

/** Add a package with the sidebar form; returns the name used. */
async function addPackage(b: BehaviorContext, prefix: string): Promise<string> {
  const name = uniqueName(prefix);
  await b.fill(`type "${name}"`, b.page.getByTestId('graph-new-label'), name);
  await b.click('add the package', b.page.getByTestId('graph-add-node'));
  await expect(selectedLabel(b.page)).toHaveText(name);
  return name;
}

// behavior: GRAPH-01
behavior(
  'GRAPH-01',
  'the seeded package graph renders, syncs, and the simulation settles',
  async (b) => {
    await openGraph(b);
    await expect(b.page.getByTestId('sync-badge')).toContainText('connected');
    await expect(counts(b.page)).toContainText('40 nodes');
    await expect(counts(b.page)).toContainText('54 edges');
    await expect(nodeList(b.page).getByRole('button')).toHaveCount(40);
    await expect(stage(b.page)).toBeVisible();
    // The canvas is really drawing: the label overlay carries a span per node.
    await expect(canvasLabel(b.page, 'kernel')).toBeVisible({ timeout: 20_000 });
    // …and the force layout cools to a stop rather than jittering forever.
    await expect(simState(b.page)).toHaveText('simulating');
    await waitSettled(b);
    await expect(simState(b.page)).toHaveText('settled');
  },
  { smoke: true }
);

// behavior: GRAPH-02
behavior('GRAPH-02', 'clicking a package in the sidebar selects it and shows its details', async (b) => {
  await openGraph(b);
  await expect(b.page.getByTestId('graph-no-selection')).toBeVisible();
  await selectPackage(b, 'scheduler');
  await expect(selection(b.page)).toContainText('core');
  await expect(pinState(b.page)).toHaveText('unpinned');
  await selectPackage(b, 'bundler');
  await expect(selection(b.page)).toContainText('tools');
});

// behavior: GRAPH-03
behavior('GRAPH-03', 'clicking the canvas on a node selects it; clicking empty canvas clears', async (b) => {
  await openGraph(b);
  await waitSettled(b);
  const centre = await nodeCentre(b.page, 'kernel');
  await b.page.mouse.click(centre.x, centre.y);
  await expect(selectedLabel(b.page)).toHaveText('kernel');
  // A corner of the stage is far from every node — the hit test returns null.
  const box = (await stage(b.page).boundingBox())!;
  await b.page.mouse.click(Math.round(box.x + 8), Math.round(box.y + 8));
  await expect(b.page.getByTestId('graph-no-selection')).toBeVisible();
});

// behavior: GRAPH-04
behavior('GRAPH-04', 'adding a package appends it, selects it, and raises the node count', async (b) => {
  await openGraph(b);
  const before = await readCounts(b.page);
  const name = await addPackage(b, 'added');
  await expect(nodeButton(b.page, name)).toBeVisible();
  await expect(counts(b.page)).toContainText(`${before.nodes + 1} nodes`);
  await settleSync(b);
  // The confirm landed without a rollback.
  await expect(nodeButton(b.page, name)).toBeVisible();
});

// behavior: GRAPH-05
behavior('GRAPH-05', 'renaming updates the panel, the list and the canvas label', async (b) => {
  await openGraph(b);
  const name = await addPackage(b, 'before');
  const renamed = uniqueName('after');
  await b.fill('type the new name', b.page.getByTestId('graph-rename-input'), renamed);
  await b.click('rename it', b.page.getByTestId('graph-rename'));
  await expect(selectedLabel(b.page)).toHaveText(renamed);
  await expect(nodeButton(b.page, renamed)).toBeVisible();
  await expect(nodeButton(b.page, name)).toHaveCount(0);
  // The renderer repaints the label overlay from the row, not from a cache.
  await expect(canvasLabel(b.page, renamed)).toBeVisible({ timeout: 15_000 });
});

// behavior: GRAPH-06
behavior('GRAPH-06', 'deleting a node cascades every edge touching it', async (b) => {
  await openGraph(b);
  // Own the fixture: two fresh packages joined by one edge, then delete one.
  const left = await addPackage(b, 'cascade-a');
  const right = await addPackage(b, 'cascade-b');
  await b.page.getByTestId('graph-edge-target').selectOption({ label: left });
  await b.click('connect them', b.page.getByTestId('graph-add-edge'));
  await expect(edgeList(b.page).locator('li')).toHaveCount(1);
  const before = await readCounts(b.page);
  await b.click('delete the package', b.page.getByTestId('graph-delete-node'));
  await expect(nodeButton(b.page, right)).toHaveCount(0);
  const after = await readCounts(b.page);
  expect(after.nodes).toBe(before.nodes - 1);
  expect(after.edges).toBe(before.edges - 1);
  await settleSync(b);
  expect((await readCounts(b.page)).edges).toBe(before.edges - 1);
});

// behavior: GRAPH-07
behavior('GRAPH-07', 'connect adds an edge; connecting the same pair twice adds nothing', async (b) => {
  await openGraph(b);
  const target = await addPackage(b, 'dep');
  const source = await addPackage(b, 'app');
  const before = await readCounts(b.page);
  await b.page.getByTestId('graph-edge-target').selectOption({ label: target });
  await b.click('connect', b.page.getByTestId('graph-add-edge'));
  await expect(counts(b.page)).toContainText(`${before.edges + 1} edges`);
  await expect(edgeList(b.page)).toContainText(`${source} → ${target}`);
  await settleSync(b);
  // The duplicate is refused before it becomes a mutation.
  await b.page.getByTestId('graph-edge-target').selectOption({ label: target });
  await b.click('try the same pair again', b.page.getByTestId('graph-add-edge'));
  await expect(counts(b.page)).toContainText(`${before.edges + 1} edges`);
  await expect(chip(b.page)).not.toBeVisible();
});

// behavior: GRAPH-08
behavior('GRAPH-08', 'removing an edge from the selection list drops just that edge', async (b) => {
  await openGraph(b);
  const target = await addPackage(b, 'lib');
  const source = await addPackage(b, 'consumer');
  await b.page.getByTestId('graph-edge-target').selectOption({ label: target });
  await b.click('connect', b.page.getByTestId('graph-add-edge'));
  await expect(edgeList(b.page).locator('li')).toHaveCount(1);
  const before = await readCounts(b.page);
  await b.click('remove the edge', edgeList(b.page).getByRole('button', { name: 'remove' }));
  await expect(edgeList(b.page).locator('li')).toHaveCount(0);
  expect((await readCounts(b.page)).edges).toBe(before.edges - 1);
  // The nodes themselves are untouched.
  await expect(nodeButton(b.page, source)).toBeVisible();
  await expect(nodeButton(b.page, target)).toBeVisible();
});

// behavior: GRAPH-09
behavior('GRAPH-09', 'Pin here pins the selected node where the simulation has it', async (b) => {
  await openGraph(b);
  await selectPackage(b, 'wire');
  await expect(pinState(b.page)).toHaveText('unpinned');
  await b.click('pin it', b.page.getByTestId('graph-pin-here'));
  await expect(pinState(b.page)).toHaveText('pinned');
  await settleSync(b);
  await expect(pinState(b.page)).toHaveText('pinned');
});

// behavior: GRAPH-10
behavior('GRAPH-10', 'Release pin hands the node back to the simulation', async (b) => {
  await openGraph(b);
  await selectPackage(b, 'codec');
  await expect(b.page.getByTestId('graph-release-pin')).toBeDisabled();
  await b.click('pin it', b.page.getByTestId('graph-pin-here'));
  await expect(pinState(b.page)).toHaveText('pinned');
  await b.click('release the pin', b.page.getByTestId('graph-release-pin'));
  await expect(pinState(b.page)).toHaveText('unpinned');
  await expect(b.page.getByTestId('graph-release-pin')).toBeDisabled();
  // A row change reheats the layout — the graph is moving again.
  await expect(simState(b.page)).toHaveText('simulating');
});

// behavior: GRAPH-11
behavior('GRAPH-11', 'undo after a delete restores the node and its cascaded edges', async (b) => {
  await openGraph(b);
  const target = await addPackage(b, 'restore-dep');
  const doomed = await addPackage(b, 'restore-me');
  await b.page.getByTestId('graph-edge-target').selectOption({ label: target });
  await b.click('connect', b.page.getByTestId('graph-add-edge'));
  await expect(edgeList(b.page).locator('li')).toHaveCount(1);
  await settleSync(b);
  const before = await readCounts(b.page);
  await b.click('delete it', b.page.getByTestId('graph-delete-node'));
  await expect(nodeButton(b.page, doomed)).toHaveCount(0);
  await settleSync(b);
  await b.click('undo the delete', b.page.getByTestId('graph-undo'));
  await expect(nodeButton(b.page, doomed)).toBeVisible();
  const after = await readCounts(b.page);
  expect(after.nodes).toBe(before.nodes);
  // The edge came back in the SAME undo step, not a second one.
  expect(after.edges).toBe(before.edges);
});

// behavior: GRAPH-12
behavior('GRAPH-12', 'undo and redo round-trip a pin', async (b) => {
  await openGraph(b);
  await selectPackage(b, 'outbox');
  await b.click('pin it', b.page.getByTestId('graph-pin-here'));
  await expect(pinState(b.page)).toHaveText('pinned');
  await settleSync(b);
  await b.click('undo the pin', b.page.getByTestId('graph-undo'));
  await expect(pinState(b.page)).toHaveText('unpinned');
  await settleSync(b);
  await b.click('redo the pin', b.page.getByTestId('graph-redo'));
  await expect(pinState(b.page)).toHaveText('pinned');
});

// behavior: GRAPH-13
behavior('GRAPH-13', 'the undo and redo buttons track the history stacks', async (b) => {
  await openGraph(b);
  await expect(b.page.getByTestId('graph-undo')).toBeDisabled();
  await expect(b.page.getByTestId('graph-redo')).toBeDisabled();
  await addPackage(b, 'history');
  await expect(b.page.getByTestId('graph-undo')).toBeEnabled();
  await settleSync(b);
  await b.click('undo the add', b.page.getByTestId('graph-undo'));
  await expect(b.page.getByTestId('graph-redo')).toBeEnabled();
});

// behavior: GRAPH-14
behavior('GRAPH-14', 'dragging a node on the canvas commits exactly one pin, undone in one step', async (b) => {
  await openGraph(b);
  await waitSettled(b);
  const centre = await nodeCentre(b.page, 'devtools');
  await b.page.mouse.move(centre.x, centre.y);
  await b.page.mouse.down();
  // Many intermediate positions — every one of them rides presence only.
  for (let step = 1; step <= 8; step += 1) {
    await b.page.mouse.move(centre.x + step * 9, centre.y - step * 5);
  }
  await expect(selectedLabel(b.page)).toHaveText('devtools');
  await expect(pinState(b.page)).toHaveText('unpinned');
  await b.page.mouse.up();
  // ONE mutation, on release.
  await expect(pinState(b.page)).toHaveText('pinned');
  await settleSync(b);
  await b.click('undo the drag', b.page.getByTestId('graph-undo'));
  await expect(pinState(b.page)).toHaveText('unpinned');
  await expect(b.page.getByTestId('graph-undo')).toBeDisabled();
});

// behavior: GRAPH-15
behavior('GRAPH-15', 'a second window shows up as a peer, and its edits sync across', async (b) => {
  await openGraph(b);
  await expect(b.page.getByTestId('graph-peer-count')).toHaveAttribute('data-count', '0');

  const second = await b.page.context().newPage();
  await second.goto(`${b.host.origin}${b.host.prefix}/graph`);
  await expect(nodeButton(second, 'kernel')).toBeVisible({ timeout: 25_000 });

  // Presence: moving the pointer over the other window's stage publishes a
  // world-coordinate cursor, and this window counts it as a peer.
  const box = (await stage(second).boundingBox())!;
  for (let step = 0; step < 4; step += 1) {
    await second.mouse.move(box.x + box.width / 2 + step * 12, box.y + box.height / 2 + step * 8);
  }
  await expect(b.page.getByTestId('graph-peer-count')).toHaveAttribute('data-count', '1', { timeout: 20_000 });

  // Sync: a node added over there is a row over here.
  const name = uniqueName('remote');
  await second.getByTestId('graph-new-label').fill(name);
  await second.getByTestId('graph-add-node').click();
  await expect(nodeButton(b.page, name)).toBeVisible({ timeout: 20_000 });

  await second.close();
});
