/**
 * Sequencer behaviors (specs/sequencer.md), recorded, against both hosts.
 *
 * WHAT THIS FILE CANNOT DO, said once: it cannot hear anything. Playwright
 * has no ears and headless Chromium renders audio to a null device, so not
 * one assertion below proves a drum sounded. The timing claims are proven in
 * `src/sequencer/audio/scheduler.test.ts`, which runs the whole scheduler as
 * a pure function with no AudioContext at all. What this file proves is that
 * the app around the audio behaves: the pattern edits, syncs and undoes, and
 * the playhead — mirrored out of the engine into `data-step` — really moves
 * when you press play and really stops when you press stop.
 *
 * As in the graph and sheet suites, BEHAVIORS OWN THEIR FIXTURES: only
 * SEQ-01 asserts the seed, and everything else reads counts dynamically or
 * edits cells it has just set up itself.
 */
import type { Page } from '@playwright/test';
import { behavior, expect, test, type BehaviorContext } from './support/behaviors';

test.use({ video: 'on' });

const grid = (page: Page) => page.getByTestId('sequencer-grid');
const cell = (page: Page, voice: string, index: number) =>
  page.getByTestId(`sequencer-cell-${voice}-${index}`);
const laneLabel = (page: Page, voice: string) => page.getByTestId(`sequencer-lane-${voice}`);
const activeCount = (page: Page) => page.getByTestId('sequencer-active-count');
const bpmInput = (page: Page) => page.getByTestId('sequencer-bpm');
const playButton = (page: Page) => page.getByTestId('sequencer-play');
const chip = (page: Page) => page.getByTestId('inflight-chip');

/** Open the demo and wait for the seeded pattern to arrive (the embedded host boots WASM first). */
async function openSequencer(b: BehaviorContext): Promise<void> {
  await b.goto('/sequencer');
  // A seeded lit cell proves the engine booted, all three subscriptions
  // landed, and the rows reached the grid — not merely that the shell rendered.
  await expect(cell(b.page, 'kick', 0)).toHaveAttribute('data-on', 'true', { timeout: 25_000 });
}

/** Wait for the outbox to drain, so the next interaction isn't racing a confirm. */
async function settleSync(b: BehaviorContext): Promise<void> {
  await expect(chip(b.page)).not.toBeVisible({ timeout: 15_000 });
}

/** How many cells are currently lit, as a number. */
async function readActive(page: Page): Promise<number> {
  return Number((await activeCount(page).textContent()) ?? '-1');
}

/** The step index the DOM playhead is on (-1 when stopped). */
async function readStep(page: Page): Promise<number> {
  return Number((await grid(page).getAttribute('data-step')) ?? 'NaN');
}

// behavior: SEQ-01
behavior(
  'SEQ-01',
  'the seeded pattern renders, syncs, and starts stopped at 120bpm',
  async (b) => {
    await openSequencer(b);
    await expect(b.page.getByTestId('sync-badge')).toContainText('connected');

    // Four lanes × sixteen steps, every one a real button with a row behind it.
    await expect(b.page.getByTestId('sequencer-counts')).toContainText('4 tracks');
    await expect(grid(b.page).locator('button')).toHaveCount(64);
    for (const voice of ['kick', 'snare', 'hat', 'clave']) {
      await expect(laneLabel(b.page, voice)).toBeVisible();
    }

    // The seeded bar: kick on the downbeat, snare on the backbeat, and the
    // cell between them dark.
    await expect(cell(b.page, 'kick', 0)).toHaveAttribute('data-on', 'true');
    await expect(cell(b.page, 'kick', 1)).toHaveAttribute('data-on', 'false');
    await expect(cell(b.page, 'snare', 4)).toHaveAttribute('data-on', 'true');
    expect(await readActive(b.page)).toBe(21);

    // Shared tempo, local transport: stopped, with no playhead.
    await expect(bpmInput(b.page)).toHaveValue('120');
    expect(await readStep(b.page)).toBe(-1);
  },
  { smoke: true }
);

// behavior: SEQ-02
behavior('SEQ-02', 'clicking a cell toggles it, and the lit count follows', async (b) => {
  await openSequencer(b);
  const before = await readActive(b.page);

  await b.click('light a dark step', cell(b.page, 'kick', 1));
  await expect(cell(b.page, 'kick', 1)).toHaveAttribute('data-on', 'true');
  expect(await readActive(b.page)).toBe(before + 1);
  await settleSync(b);
  // The confirm landed without a rollback.
  await expect(cell(b.page, 'kick', 1)).toHaveAttribute('data-on', 'true');

  await b.click('turn it off again', cell(b.page, 'kick', 1));
  await expect(cell(b.page, 'kick', 1)).toHaveAttribute('data-on', 'false');
  expect(await readActive(b.page)).toBe(before);
});

// behavior: SEQ-03
behavior('SEQ-03', 'shift-click cycles velocity, and lights a dark cell quietly', async (b) => {
  await openSequencer(b);
  // An accented seeded cell walks round the three bands.
  await expect(cell(b.page, 'kick', 0)).toHaveAttribute('data-velocity', 'accent');
  await cell(b.page, 'kick', 0).click({ modifiers: ['Shift'] });
  await expect(cell(b.page, 'kick', 0)).toHaveAttribute('data-velocity', 'ghost');
  await cell(b.page, 'kick', 0).click({ modifiers: ['Shift'] });
  await expect(cell(b.page, 'kick', 0)).toHaveAttribute('data-velocity', 'normal');

  // A DARK cell comes on at the quietest level — one gesture, one mutation.
  const before = await readActive(b.page);
  await expect(cell(b.page, 'snare', 0)).toHaveAttribute('data-on', 'false');
  await cell(b.page, 'snare', 0).click({ modifiers: ['Shift'] });
  await expect(cell(b.page, 'snare', 0)).toHaveAttribute('data-on', 'true');
  await expect(cell(b.page, 'snare', 0)).toHaveAttribute('data-velocity', 'ghost');
  expect(await readActive(b.page)).toBe(before + 1);
  await settleSync(b);

  // …and ONE undo puts it back, because `on` travelled with the velocity.
  await b.click('undo the shift-click', b.page.getByTestId('sequencer-undo'));
  await expect(cell(b.page, 'snare', 0)).toHaveAttribute('data-on', 'false');
});

// behavior: SEQ-04
behavior('SEQ-04', 'clearing a lane empties it, and one undo restores the whole lane', async (b) => {
  await openSequencer(b);
  const before = await readActive(b.page);
  // The seeded hat lane is the busiest one, so the bulk inverse has work to do.
  const litHats = [0, 2, 4, 6, 8, 10, 12, 14];
  for (const index of litHats) {
    await expect(cell(b.page, 'hat', index)).toHaveAttribute('data-on', 'true');
  }

  await b.click('clear the hat lane', b.page.getByTestId('sequencer-clear-hat'));
  for (const index of litHats) {
    await expect(cell(b.page, 'hat', index)).toHaveAttribute('data-on', 'false');
  }
  expect(await readActive(b.page)).toBe(before - litHats.length);
  await settleSync(b);

  // ONE undo, the whole lane back — not eight presses.
  await b.click('undo the clear', b.page.getByTestId('sequencer-undo'));
  for (const index of litHats) {
    await expect(cell(b.page, 'hat', index)).toHaveAttribute('data-on', 'true');
  }
  expect(await readActive(b.page)).toBe(before);
  await expect(b.page.getByTestId('sequencer-undo')).toBeDisabled();
});

// behavior: SEQ-05
behavior('SEQ-05', 'the tempo commits on Enter, survives the confirm, and undoes', async (b) => {
  await openSequencer(b);
  await b.fill('type a new tempo', bpmInput(b.page), '96');
  await b.press('commit it', bpmInput(b.page), 'Enter');
  await expect(bpmInput(b.page)).toHaveValue('96');
  await settleSync(b);
  await expect(bpmInput(b.page)).toHaveValue('96');

  await b.click('undo the tempo change', b.page.getByTestId('sequencer-undo'));
  await expect(bpmInput(b.page)).toHaveValue('120');
});

// behavior: SEQ-06
behavior('SEQ-06', 'play advances the DOM playhead across the grid', async (b) => {
  await openSequencer(b);
  expect(await readStep(b.page)).toBe(-1);

  await b.click('press play', playButton(b.page));
  await expect(playButton(b.page)).toHaveAttribute('data-playing', 'true');

  // The audio clock reaches the first step. At 120bpm a step is 125ms, so a
  // few seconds is many bars' worth of slack for a busy CI machine.
  await expect
    .poll(() => readStep(b.page), { timeout: 15_000, message: 'the playhead never left -1' })
    .toBeGreaterThanOrEqual(0);

  // …and keeps moving: sample until the index differs from the first one seen.
  const first = await readStep(b.page);
  await expect
    .poll(() => readStep(b.page), { timeout: 15_000, message: 'the playhead stopped advancing' })
    .not.toBe(first);
});

// behavior: SEQ-07
behavior('SEQ-07', 'stop parks the playhead and it stays parked', async (b) => {
  await openSequencer(b);
  await b.click('press play', playButton(b.page));
  await expect.poll(() => readStep(b.page), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);

  await b.click('press stop', playButton(b.page));
  await expect(playButton(b.page)).toHaveAttribute('data-playing', 'false');
  await expect(grid(b.page)).toHaveAttribute('data-step', '-1');
  // Still parked a couple of bars later — the pump really is cancelled.
  await expect(grid(b.page)).toHaveAttribute('data-step', '-1', { timeout: 3_000 });
  expect(await readStep(b.page)).toBe(-1);
});

// behavior: SEQ-08
behavior('SEQ-08', 'renaming a lane updates the mixer and the grid label', async (b) => {
  await openSequencer(b);
  const renamed = `wood-${Math.random().toString(36).slice(2, 7)}`;
  await b.fill('type the new lane name', b.page.getByTestId('sequencer-name-clave'), renamed);
  await b.press('commit the name', b.page.getByTestId('sequencer-name-clave'), 'Enter');
  await expect(laneLabel(b.page, 'clave')).toHaveText(renamed);
  await settleSync(b);
  await expect(b.page.getByTestId('sequencer-name-clave')).toHaveValue(renamed);
});

// behavior: SEQ-09
behavior('SEQ-09', 'the undo and redo buttons track the history stacks', async (b) => {
  await openSequencer(b);
  await expect(b.page.getByTestId('sequencer-undo')).toBeDisabled();
  await expect(b.page.getByTestId('sequencer-redo')).toBeDisabled();

  await b.click('light a step', cell(b.page, 'clave', 1));
  await expect(b.page.getByTestId('sequencer-undo')).toBeEnabled();
  await settleSync(b);

  await b.click('undo it', b.page.getByTestId('sequencer-undo'));
  await expect(cell(b.page, 'clave', 1)).toHaveAttribute('data-on', 'false');
  await expect(b.page.getByTestId('sequencer-redo')).toBeEnabled();
  await settleSync(b);

  await b.click('redo it', b.page.getByTestId('sequencer-redo'));
  await expect(cell(b.page, 'clave', 1)).toHaveAttribute('data-on', 'true');
});

// behavior: SEQ-10
behavior('SEQ-10', 'a second window is a peer: its touched cell rings, and its edits sync', async (b) => {
  await openSequencer(b);
  await expect(b.page.getByTestId('sequencer-peer-count')).toHaveAttribute('data-count', '0');

  const second = await b.page.context().newPage();
  await second.goto(`${b.host.origin}${b.host.prefix}/sequencer`);
  await expect(cell(second, 'kick', 0)).toHaveAttribute('data-on', 'true', { timeout: 25_000 });

  // One click over there is both a presence touch and a mutation.
  await cell(second, 'snare', 2).click();
  await expect(b.page.getByTestId('sequencer-peer-count')).toHaveAttribute('data-count', '1', {
    timeout: 20_000
  });
  await expect(cell(b.page, 'snare', 2)).toHaveAttribute('data-peer', 'true', { timeout: 20_000 });
  await expect(cell(b.page, 'snare', 2)).toHaveAttribute('data-on', 'true', { timeout: 20_000 });

  await second.close();
});

// behavior: SEQ-11
behavior('SEQ-11', 'play is local: the peer sees that you are playing but does not start', async (b) => {
  await openSequencer(b);

  const second = await b.page.context().newPage();
  await second.goto(`${b.host.origin}${b.host.prefix}/sequencer`);
  await expect(cell(second, 'kick', 0)).toHaveAttribute('data-on', 'true', { timeout: 25_000 });

  await b.click('press play here', playButton(b.page));
  await expect.poll(() => readStep(b.page), { timeout: 15_000 }).toBeGreaterThanOrEqual(0);

  // Over there: counted as a playing peer, but its OWN playhead never moved.
  await expect(second.getByTestId('sequencer-playing-peers')).toHaveAttribute('data-count', '1', {
    timeout: 20_000
  });
  await expect(second.getByTestId('sequencer-play')).toHaveAttribute('data-playing', 'false');
  expect(await readStep(second)).toBe(-1);

  await second.close();
});
