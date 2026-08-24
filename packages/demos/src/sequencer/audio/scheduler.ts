/**
 * The lookahead scheduler — PURE, and free of any WebAudio import. This is
 * the sequencer's `tiptap/projection.ts`: the one place the hard part lives,
 * kept as a function of its inputs so a headless test can prove it.
 *
 * WHY A LOOKAHEAD SCHEDULER AT ALL, in one paragraph. JavaScript timers are
 * not musical instruments: a `setInterval` fires late, unevenly, and
 * whenever the browser feels like it, so triggering a drum hit directly from
 * a timer produces audible flam. WebAudio has a second, much better clock —
 * every node can be told to start at an exact time in the future. So the
 * pattern (Chris Wilson's "A Tale of Two Clocks") is: a sloppy JS timer wakes
 * up often, looks a little way AHEAD on the accurate audio clock, and books
 * every hit that falls inside that window at its exact time. The timer's
 * jitter stops mattering — it only has to be roughly frequent, never precise.
 *
 * This module is the "looks a little way ahead" half, and nothing else:
 *
 *   scheduleAhead(state, pattern, audioNowSeconds, lookaheadSeconds)
 *     → { state, hits, ticks }
 *
 * `state` is the entire memory of the playhead — the next step to fire and
 * the exact time it should fire at. Feed the returned state back in on the
 * next call. `hits` are the sounds to book; `ticks` are step boundaries the
 * UI playhead follows (a step with no sound still moves the highlight).
 *
 * Because the whole thing is a pure function of (state, pattern, now), the
 * test file can advance time by hand and assert on tempo changes, wrapping,
 * and the catch-up rule without a browser, an AudioContext or a speaker.
 */
import { STEP_COUNT } from '../sync/sequencer.sync';

/** Tempo range the UI offers and the scheduler clamps to. */
export const MIN_BPM = 40;
/** The fast end of the same range. */
export const MAX_BPM = 240;

/** One cell of one lane, as the scheduler needs it. */
export interface PatternCell {
  readonly on: boolean;
  readonly velocity: number;
}

/** One lane of the pattern: a voice, its level, and its sixteen cells. */
export interface PatternLane {
  readonly trackId: string;
  readonly voice: string;
  readonly gain: number;
  readonly cells: readonly PatternCell[];
}

/** The whole synced pattern, snapshotted at one instant. */
export interface Pattern {
  readonly bpm: number;
  readonly lanes: readonly PatternLane[];
}

/** One sound to book on the audio clock. `level` already folds in lane gain. */
export interface ScheduledHit {
  readonly step: number;
  readonly timeSeconds: number;
  readonly trackId: string;
  readonly voice: string;
  readonly level: number;
}

/** One step boundary — what the DOM playhead follows, sound or no sound. */
export interface ScheduledTick {
  readonly step: number;
  readonly timeSeconds: number;
}

/** Everything the playhead remembers: which step is next, and exactly when. */
export interface SchedulerState {
  /** The step index that has NOT been booked yet (0…STEP_COUNT-1). */
  readonly nextStep: number;
  /** The audio-clock time, in seconds, at which that step should sound. */
  readonly nextStepTime: number;
}

/** What one call to `scheduleAhead` produced. */
export interface ScheduleResult {
  readonly state: SchedulerState;
  readonly hits: readonly ScheduledHit[];
  readonly ticks: readonly ScheduledTick[];
}

/**
 * Hard cap on steps booked per call, so a nonsense `lookaheadSeconds` (or a
 * future tempo of 10,000 bpm) can never turn one pump into an unbounded loop.
 */
const MAX_STEPS_PER_CALL = 64;

/** Keep a tempo inside the range the transport can actually play. */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) {
    return 120;
  }
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/**
 * Seconds between two steps. The grid is sixteenth notes, so one step is a
 * quarter of a beat: at 120 bpm a beat is 0.5s and a step is 0.125s.
 */
export function stepSeconds(bpm: number): number {
  return 60 / clampBpm(bpm) / 4;
}

/** Fresh playhead memory: start `atStep` at `nowSeconds` on the audio clock. */
export function startState(nowSeconds: number, atStep = 0): SchedulerState {
  return { nextStep: ((atStep % STEP_COUNT) + STEP_COUNT) % STEP_COUNT, nextStepTime: nowSeconds };
}

/** Fold a cell's velocity into its lane's level, clamped to a sane range. */
function levelOf(lane: PatternLane, cell: PatternCell): number {
  return Math.min(1, Math.max(0, cell.velocity * lane.gain));
}

/**
 * Book every step that falls inside the next `lookaheadSeconds` of the audio
 * clock, and return the playhead memory to feed back in next time.
 *
 * Two properties worth naming, because both are tested:
 *
 *  - THE TEMPO IS RE-READ EVERY CALL, and only affects steps not yet booked.
 *    Changing bpm mid-bar therefore stretches the future without rewinding or
 *    double-firing the past — the playhead never jumps.
 *  - IT NEVER CATCHES UP BY FIRING THE PAST. If the pump stops for a while
 *    (a background tab, a suspended AudioContext), `nextStepTime` falls
 *    behind the clock. Rather than dumping the missed steps out at once —
 *    thirty seconds of hidden tab would be 480 drum hits in one instant —
 *    the playhead snaps forward to now and carries on.
 */
export function scheduleAhead(
  state: SchedulerState,
  pattern: Pattern,
  nowSeconds: number,
  lookaheadSeconds: number
): ScheduleResult {
  const interval = stepSeconds(pattern.bpm);
  let nextStep = state.nextStep;
  // The catch-up rule, in one line.
  let nextStepTime = state.nextStepTime < nowSeconds ? nowSeconds : state.nextStepTime;

  const horizon = nowSeconds + Math.max(0, lookaheadSeconds);
  const hits: ScheduledHit[] = [];
  const ticks: ScheduledTick[] = [];

  let booked = 0;
  while (nextStepTime < horizon && booked < MAX_STEPS_PER_CALL) {
    ticks.push({ step: nextStep, timeSeconds: nextStepTime });
    for (const lane of pattern.lanes) {
      const cell = lane.cells[nextStep];
      if (cell?.on) {
        hits.push({
          step: nextStep,
          timeSeconds: nextStepTime,
          trackId: lane.trackId,
          voice: lane.voice,
          level: levelOf(lane, cell)
        });
      }
    }
    nextStep = (nextStep + 1) % STEP_COUNT;
    nextStepTime += interval;
    booked += 1;
  }

  return { state: { nextStep, nextStepTime }, hits, ticks };
}
