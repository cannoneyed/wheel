// @vitest-environment node
/**
 * The timing machinery WITHOUT an AudioContext, a speaker, or a DOM — which
 * is the whole point of keeping it pure.
 *
 * A browser test cannot hear anything, so these tests are where the
 * sequencer's musical claims are actually proven:
 *
 *   1. TEMPO. A step at 120 bpm is 125ms, and the grid is sixteenths.
 *   2. WINDOW. Nothing is booked past the lookahead horizon — the scheduler
 *      stays a few steps ahead of the clock, never a whole bar ahead.
 *   3. WRAP. Step 15 is followed by step 0, forever, with no gap in time.
 *   4. LIVE EDITS. Tempo and pattern are re-read every call: a change
 *      stretches the FUTURE and never rewinds or re-fires the past.
 *   5. CATCH-UP. A pump that stops for thirty seconds must not come back and
 *      fire 480 drum hits in one instant.
 */
import { describe, expect, test } from 'vitest';

import { STEP_COUNT } from '../sync/sequencer.sync';
import {
  MAX_BPM,
  MIN_BPM,
  clampBpm,
  scheduleAhead,
  startState,
  stepSeconds,
  type Pattern,
  type PatternLane
} from './scheduler';

/** A lane whose listed indices are on at full velocity. */
function lane(trackId: string, voice: string, on: readonly number[], gain = 1): PatternLane {
  const hits = new Set(on);
  return {
    trackId,
    voice,
    gain,
    cells: Array.from({ length: STEP_COUNT }, (_, index) => ({ on: hits.has(index), velocity: 1 }))
  };
}

/** Four-on-the-floor plus offbeat hats: two lanes, enough to prove ordering. */
const PATTERN: Pattern = {
  bpm: 120,
  lanes: [lane('track_kick', 'kick', [0, 4, 8, 12]), lane('track_hat', 'hat', [2, 6, 10, 14])]
};

/** Run the pump repeatedly over a stretch of fake audio-clock time. */
function run(pattern: Pattern, seconds: number, options: { pumpMs?: number; lookahead?: number } = {}) {
  const pumpMs = options.pumpMs ?? 25;
  const lookahead = options.lookahead ?? 0.2;
  let state = startState(0);
  const hits: { step: number; timeSeconds: number; voice: string; level: number }[] = [];
  const ticks: { step: number; timeSeconds: number }[] = [];
  for (let now = 0; now <= seconds; now += pumpMs / 1000) {
    const result = scheduleAhead(state, pattern, now, lookahead);
    state = result.state;
    hits.push(...result.hits);
    ticks.push(...result.ticks);
  }
  return { state, hits, ticks };
}

describe('tempo', () => {
  test('a step is a sixteenth note', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 6);
    expect(stepSeconds(60)).toBeCloseTo(0.25, 6);
    expect(stepSeconds(240)).toBeCloseTo(0.0625, 6);
  });

  test('tempo is clamped to the playable range, and nonsense falls back to 120', () => {
    expect(clampBpm(10)).toBe(MIN_BPM);
    expect(clampBpm(10_000)).toBe(MAX_BPM);
    expect(clampBpm(Number.NaN)).toBe(120);
    expect(clampBpm(128.4)).toBe(128);
  });
});

describe('the lookahead window', () => {
  test('books only what falls inside the horizon', () => {
    const { ticks } = scheduleAhead(startState(10), PATTERN, 10, 0.2);
    // 0.2s of window at 0.125s per step: steps at t=10.0 and t=10.125.
    expect(ticks.map((tick) => tick.step)).toEqual([0, 1]);
    for (const tick of ticks) {
      expect(tick.timeSeconds).toBeLessThan(10.2);
    }
  });

  test('a second call with no time passed books nothing new', () => {
    const first = scheduleAhead(startState(10), PATTERN, 10, 0.2);
    const second = scheduleAhead(first.state, PATTERN, 10, 0.2);
    expect(second.ticks).toEqual([]);
    expect(second.hits).toEqual([]);
    expect(second.state).toEqual(first.state);
  });

  test('a zero-length window books nothing at all', () => {
    expect(scheduleAhead(startState(0), PATTERN, 0, 0).ticks).toEqual([]);
  });
});

describe('playing the pattern', () => {
  test('one bar at 120 bpm is 2 seconds, 16 ticks, and every hit lands on its own step', () => {
    const bar = stepSeconds(120) * STEP_COUNT;
    expect(bar).toBeCloseTo(2, 6);

    const played = run(PATTERN, 1.9);
    const ticks = played.ticks.filter((tick) => tick.timeSeconds < bar);
    const hits = played.hits.filter((hit) => hit.timeSeconds < bar);
    expect(ticks).toHaveLength(STEP_COUNT);
    expect(ticks.map((tick) => tick.step)).toEqual([...Array(STEP_COUNT).keys()]);
    // Consecutive ticks are exactly one step apart — no drift from the pump.
    for (let index = 1; index < ticks.length; index += 1) {
      expect(ticks[index]!.timeSeconds - ticks[index - 1]!.timeSeconds).toBeCloseTo(0.125, 6);
    }
    expect(hits.filter((hit) => hit.voice === 'kick').map((hit) => hit.step)).toEqual([0, 4, 8, 12]);
    expect(hits.filter((hit) => hit.voice === 'hat').map((hit) => hit.step)).toEqual([2, 6, 10, 14]);
  });

  test('the playhead wraps from 15 to 0 with no gap in time', () => {
    const { ticks } = run(PATTERN, 4.1);
    const wrapIndex = ticks.findIndex((tick, index) => index > 0 && tick.step === 0);
    expect(ticks[wrapIndex - 1]!.step).toBe(STEP_COUNT - 1);
    expect(ticks[wrapIndex]!.timeSeconds - ticks[wrapIndex - 1]!.timeSeconds).toBeCloseTo(0.125, 6);
  });

  test('off cells make no sound, and lane gain scales velocity into the level', () => {
    const quiet: Pattern = { bpm: 120, lanes: [lane('track_hat', 'hat', [0], 0.5)] };
    const { hits } = run(quiet, 1.5); // less than one bar, so step 0 comes round once
    expect(hits).toHaveLength(1);
    expect(hits[0]!.step).toBe(0);
    expect(hits[0]!.level).toBeCloseTo(0.5, 6);
  });

  test('same inputs, same schedule — two clients play the identical bar', () => {
    const a = run(PATTERN, 3);
    const b = run(PATTERN, 3);
    expect(a.hits).toEqual(b.hits);
    expect(a.ticks).toEqual(b.ticks);
  });
});

describe('live edits', () => {
  test('a tempo change stretches the future without rewinding the past', () => {
    let state = startState(0);
    const fast = scheduleAhead(state, { ...PATTERN, bpm: 240 }, 0, 0.2);
    state = fast.state;
    // 0.0625s per step: four of them fit a 0.2s window, and the fifth is
    // promised for 0.25.
    expect(fast.ticks.map((tick) => tick.step)).toEqual([0, 1, 2, 3]);
    expect(state.nextStepTime).toBeCloseTo(0.25, 6);

    // Halve the tempo. The already-booked steps keep their times; the next
    // one still fires exactly when it was promised, then the gaps widen.
    const slow = scheduleAhead(state, { ...PATTERN, bpm: 120 }, 0.18, 0.2);
    expect(slow.ticks[0]!.timeSeconds).toBeCloseTo(0.25, 6);
    expect(slow.ticks[1]!.timeSeconds - slow.ticks[0]!.timeSeconds).toBeCloseTo(0.125, 6);
  });

  test('toggling a cell between pumps changes only steps not yet booked', () => {
    const before = scheduleAhead(startState(0), PATTERN, 0, 0.1);
    expect(before.hits.map((hit) => hit.step)).toEqual([0]);

    const edited: Pattern = { bpm: 120, lanes: [lane('track_kick', 'kick', [0, 1, 4])] };
    const after = scheduleAhead(before.state, edited, 0.05, 0.1);
    // Step 0 already went out and is NOT re-fired; the newly-lit step 1 is.
    expect(after.hits.map((hit) => hit.step)).toEqual([1]);
    expect(after.hits[0]!.timeSeconds).toBeCloseTo(0.125, 6);
  });
});

describe('catch-up', () => {
  test('a long stall snaps the playhead to now instead of firing the missed bar', () => {
    const first = scheduleAhead(startState(0), PATTERN, 0, 0.2);
    // The tab slept for thirty seconds — 240 steps' worth of missed time.
    const woken = scheduleAhead(first.state, PATTERN, 30, 0.2);
    expect(woken.ticks).toHaveLength(2);
    expect(woken.ticks[0]!.timeSeconds).toBeCloseTo(30, 6);
    expect(woken.state.nextStepTime).toBeGreaterThanOrEqual(30);
  });

  test('one call can never book more than the hard cap', () => {
    // An absurd window: 10 seconds of lookahead at the fastest tempo.
    const result = scheduleAhead(startState(0), { ...PATTERN, bpm: MAX_BPM }, 0, 10);
    expect(result.ticks.length).toBeLessThanOrEqual(64);
  });
});
