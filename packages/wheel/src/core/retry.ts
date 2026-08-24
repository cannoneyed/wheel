/**
 * `retryForever` — THE one backoff loop in wheel. Every "try again until it
 * works" path, including WebSocket connection and reconnection, runs through this
 * helper instead of a hand-rolled `for(;;)` + sleep, because hand-rolled
 * loops kept re-inventing the same three bugs:
 *
 *  1. Un-cancellable sleeps: a loop mid-backoff ignored teardown until the
 *     timer fired, so close() left work running in the background.
 *  2. Raw timers/randomness: `setTimeout` + `Math.random` in src/ breaks
 *     the determinism doctrine (World and simulation seeds can't reproduce
 *     the schedule). This helper takes the injected `Defer` and an optional
 *     injected jitter source — the same seam everything else uses.
 *  3. Divergent give-up semantics: each loop had its own way of deciding
 *     "stop retrying", scattered across flags. Here it is ONE callback with
 *     one verdict.
 *
 * Lifecycle contract, in plain terms:
 *  - The task runs; success resolves the whole call with its value.
 *  - Failure invokes `onFailure` (observability + the give-up verdict), then
 *    waits an exponential-backoff delay, then tries again. Forever, unless:
 *  - `signal` aborts (teardown): the call rejects with an AbortError, at the
 *    NEXT boundary — a wait is cut short, but an attempt already in flight
 *    is never interrupted mid-body (the task observes the same signal if it
 *    wants earlier cancellation, e.g. by passing it to fetch).
 *  - `onFailure` returns `'stop'`: the call rejects with the LAST error —
 *    the caller decides what giving up means.
 *  - A `wake` source fires (browser `online` event, a nudge from a failed
 *    reconnect nudge): the CURRENT wait ends early and the next attempt runs now.
 *    Waking never skips an attempt — it only shortens a delay.
 */
import type { Defer } from './runtime-defaults';

/** What `onFailure` sees after each failed attempt — enough to log, count, and decide whether to give up. */
export interface RetryFailure {
  /** 0-based index of the attempt that just failed. */
  readonly attempt: number;
  /** What the attempt threw. */
  readonly error: unknown;
  /** Total delay slept so far (sums the SCHEDULED delays — deterministic, not wall-clock). */
  readonly elapsedMs: number;
  /** The backoff delay that would precede the next attempt (informational; not slept when `onFailure` returns 'stop'). */
  readonly nextDelayMs: number;
}

/** Configuration for `retryForever` — timing always comes through the injected `Defer` (determinism doctrine). */
export interface RetryForeverOptions {
  /** The injectable one-shot timer seam. Production passes `systemDefer`; tests pass a manual/fake Defer. */
  defer: Defer;
  /** The ONE teardown signal. Aborting rejects the call with an AbortError at the next attempt/wait boundary. */
  signal: AbortSignal;
  /** First backoff delay in ms; doubles each failure. */
  baseMs: number;
  /** Ceiling for the backoff delay in ms. */
  capMs: number;
  /**
   * Jitter as a ± fraction of the delay (0.25 = ±25%), spreading a thundering
   * herd of reconnecting clients. Default 0 (deterministic). When set,
   * `random01` must be provided — jitter without an injected source would
   * smuggle `Math.random` past the determinism doctrine.
   */
  jitter?: number;
  /** Uniform [0,1) source for jitter — `systemRandom01` in production, a seeded fn in tests. */
  random01?: () => number;
  /**
   * When true, the FIRST attempt also waits `baseMs` before running (the
   * shape where an immediate try already happened, so the loop starts with a
   * delay. Default false: attempt 0 runs immediately.
   */
  waitFirst?: boolean;
  /**
   * Attempt number the counter STARTS at (default 0). Both the delay
   * schedule and the `attempt` indices reported to `task`/`onFailure` begin
   * here. For callers carrying backoff pressure ACROSS separate retryForever
   * calls — the WebSocket transport's flap guard, where each socket opens but
   * dies young — this
   * resumes the doubling where it left off instead of resetting to `baseMs`
   * on every success. Without it, a connect loop whose opens always succeed
   * and then instantly drop retries at full speed forever.
   */
  startAttempt?: number;
  /**
   * Observed after every failed attempt, BEFORE the next wait. Return
   * `'stop'` to give up: the call rejects with this attempt's error and no
   * further wait is scheduled. Also the place to surface status ("offline
   * after N attempts") and classify errors.
   */
  onFailure?: (failure: RetryFailure) => void | 'stop';
  /**
   * Registers wake sources for ONE wait: called with a `wakeNow` that ends
   * the current backoff wait early; must return the detach function (called
   * when the wait ends, however it ends). The WebSocket transport wires browser
   * `online` and `visibilitychange` events here.
   */
  wake?: (wakeNow: () => void) => () => void;
}

/**
 * True when `error` is a teardown signal — an AbortError from this module,
 * from `fetch(..., { signal })`, or from `signal.reason`. The standard check
 * for "this rejection means close(), not a real failure".
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** Build the rejection for an aborted retry loop: the signal's reason when it is an Error, else a fresh AbortError. */
function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

/** The backoff delay before/after attempt `attempt`: min(cap, base·2^attempt), optionally jittered. */
function delayFor(attempt: number, options: RetryForeverOptions): number {
  // 2^attempt overflows past ~2^30 into Infinity territory long before any
  // realistic attempt count; clamp the exponent so the arithmetic stays exact.
  const exp = Math.min(options.capMs, options.baseMs * 2 ** Math.min(attempt, 30));
  const jitter = options.jitter ?? 0;
  if (jitter <= 0) {
    return exp;
  }
  const random01 = options.random01;
  if (!random01) {
    throw new Error('retryForever: jitter > 0 requires an injected random01 source (determinism doctrine).');
  }
  return Math.round(exp * (1 + (random01() * 2 - 1) * jitter));
}

/**
 * Run `task` until it succeeds, backing off exponentially between failures.
 * Resolves with the task's value; rejects ONLY on teardown (AbortError) or
 * an `onFailure` `'stop'` verdict (the last error). See the module doc for
 * the full lifecycle contract.
 */
export async function retryForever<T>(task: (attempt: number) => Promise<T>, options: RetryForeverOptions): Promise<T> {
  const { signal } = options;

  /**
   * One cancellable backoff wait. Resolves when the delay elapses, a wake
   * source fires, or the signal aborts — the caller re-checks `signal.aborted`
   * after every wait, so an abort-resolved wait exits the loop immediately.
   */
  const wait = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        cancelTimer();
        detachWake?.();
        signal.removeEventListener('abort', finish);
        resolve();
      };
      const cancelTimer = options.defer.schedule(ms, finish);
      const detachWake = options.wake?.(finish);
      signal.addEventListener('abort', finish);
      // The signal may have aborted between the caller's check and this
      // registration — resolve immediately rather than sleeping a full delay
      // on a dead loop.
      if (signal.aborted) {
        finish();
      }
    });

  let elapsedMs = 0;
  for (let attempt = options.startAttempt ?? 0; ; attempt += 1) {
    if (signal.aborted) {
      throw abortError(signal);
    }
    if (options.waitFirst) {
      const delayMs = delayFor(attempt, options);
      await wait(delayMs);
      elapsedMs += delayMs;
      if (signal.aborted) {
        throw abortError(signal);
      }
    }
    try {
      return await task(attempt);
    } catch (error) {
      // An abort observed by the task itself (e.g. fetch rejecting with the
      // shared signal) is teardown, not a failure to retry.
      if (signal.aborted) {
        throw abortError(signal);
      }
      // With waitFirst the next delay is charged at the TOP of the next turn;
      // it is computed here only so onFailure can report it.
      const nextDelayMs = options.waitFirst ? delayFor(attempt + 1, options) : delayFor(attempt, options);
      const verdict = options.onFailure?.({ attempt, error, elapsedMs, nextDelayMs });
      if (verdict === 'stop') {
        throw error;
      }
      if (!options.waitFirst) {
        await wait(nextDelayMs);
        elapsedMs += nextDelayMs;
      }
    }
  }
}
