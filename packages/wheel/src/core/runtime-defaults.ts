/**
 * THE ONLY module in src/ allowed to touch real time, real randomness, and
 * real timers. Everything else — engine, client, and kit services alike —
 * takes Clock / RandomBytes / Defer by injection, which is what makes World,
 * simulation seeds, and replay fixtures reproducible. The constraints suite
 * enforces this boundary by scanning every other file for `Date.now(`,
 * `Math.random(`, and `setTimeout(`.
 *
 * These live in `core` because timing is foundational: the sync engine, the
 * client, and kit UI services (toast pacing, dialog timing) all need the same
 * injectable seam, and the layer DAG forbids kit and core from reaching up
 * into sync.
 */

/** Injected wall clock — real time in production, a fixed/stepping clock in tests. */
export interface Clock {
  /** Milliseconds since epoch. */
  now(): number;
}

/** Injected randomness source backing id generation — seeded in tests, crypto in production. */
export type RandomBytes = (length: number) => Uint8Array;

/** A one-shot deferred call, cancelable — the injectable face of setTimeout. */
export interface Defer {
  schedule(ms: number, fn: () => void): () => void;
}

/** The real wall clock. */
export const systemClock: Clock = {
  now: () => Date.now()
};

/** Real crypto randomness — production counterpart of the seeded test source. */
export const systemRandomBytes: RandomBytes = (length: number) => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Real uniform [0,1) randomness — the production jitter source for
 * `retryForever` backoff. Tests pass a seeded function instead, so simulated
 * reconnect schedules replay exactly.
 */
export const systemRandom01 = (): number => Math.random();

/** Real one-shot timers for production clients and kit services (presence coalescing, toast pacing). Tests inject a manual Defer or use fake timers. */
export const systemDefer: Defer = {
  schedule(ms: number, fn: () => void): () => void {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  }
};

/**
 * Real elapsed-time measurement for DIAGNOSTICS ONLY (the WHEEL_TIMING=1 log
 * lines): monotonic where the platform has it, wall clock otherwise. Never the
 * injected Clock — timing a network round trip with a fixed clock would report
 * zero. Must not feed any behavior, only logs.
 */
export const monotonicNowMs = (): number => {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
};
