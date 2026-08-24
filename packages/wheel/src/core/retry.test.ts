/**
 * retryForever's contract, pinned deterministically with a hand-cranked
 * Defer: backoff doubling + cap, jitter through the injected source only,
 * waitFirst (grace-loop) vs immediate (connect) shapes, the 'stop' verdict,
 * abort at every boundary, and wake short-circuiting a wait.
 */
import { describe, expect, it } from 'vitest';
import type { Defer } from './runtime-defaults';
import { isAbortError, retryForever } from './retry';

/** A manual Defer: collects scheduled delays; tick() fires the oldest pending timer. */
function manualDefer(): { defer: Defer; tick: () => Promise<void>; delays: number[]; pending: () => number } {
  const queue: Array<{ ms: number; fn: () => void; cancelled: boolean }> = [];
  const delays: number[] = [];
  return {
    delays,
    defer: {
      schedule(ms, fn) {
        const entry = { ms, fn, cancelled: false };
        delays.push(ms);
        queue.push(entry);
        return () => {
          entry.cancelled = true;
        };
      }
    },
    pending: () => queue.filter((entry) => !entry.cancelled).length,
    async tick() {
      // Drain microtasks FIRST so a wait scheduled by a just-failed attempt
      // is visible, then fire the oldest timer, then let its continuations run.
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
      const entry = queue.shift();
      if (entry && !entry.cancelled) {
        entry.fn();
      }
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    }
  };
}

describe('retryForever', () => {
  it('resolves with the first successful attempt and schedules nothing more', async () => {
    const { defer, delays } = manualDefer();
    const value = await retryForever(async () => 'ok', {
      defer,
      signal: new AbortController().signal,
      baseMs: 100,
      capMs: 1000
    });
    expect(value).toBe('ok');
    expect(delays).toEqual([]);
  });

  it('doubles the delay per failure and caps it', async () => {
    const { defer, delays, tick } = manualDefer();
    let failures = 5;
    const done = retryForever(
      async () => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('nope');
        }
        return 'recovered';
      },
      { defer, signal: new AbortController().signal, baseMs: 100, capMs: 400 }
    );
    for (let i = 0; i < 5; i += 1) {
      await tick();
    }
    expect(await done).toBe('recovered');
    expect(delays).toEqual([100, 200, 400, 400, 400]);
  });

  it('waitFirst delays BEFORE every attempt including the first (the grace-loop shape)', async () => {
    const { defer, delays, tick } = manualDefer();
    let attempts = 0;
    const done = retryForever(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('held');
        return 'lock';
      },
      { defer, signal: new AbortController().signal, baseMs: 100, capMs: 5000, waitFirst: true }
    );
    // Nothing ran yet: the first attempt sits behind the first wait.
    await Promise.resolve();
    expect(attempts).toBe(0);
    await tick(); // 100ms → attempt 1 fails
    expect(attempts).toBe(1);
    await tick(); // 200ms → attempt 2 fails
    await tick(); // 400ms → attempt 3 succeeds
    expect(await done).toBe('lock');
    expect(delays).toEqual([100, 200, 400]);
  });

  it('startAttempt resumes the doubling mid-schedule (the flap-guard shape: backoff pressure carried across calls)', async () => {
    const { defer, delays, tick } = manualDefer();
    let failures = 2;
    const seen: number[] = [];
    const done = retryForever(
      async (attempt) => {
        seen.push(attempt);
        if (failures > 0) {
          failures -= 1;
          throw new Error('nope');
        }
        return 'ok';
      },
      // startAttempt 2 → the schedule begins at 100·2² = 400, not 100.
      { defer, signal: new AbortController().signal, baseMs: 100, capMs: 5000, waitFirst: true, startAttempt: 2 }
    );
    await tick(); // 400ms → attempt 2 fails
    await tick(); // 800ms → attempt 3 fails
    await tick(); // 1600ms → attempt 4 succeeds
    expect(await done).toBe('ok');
    expect(delays).toEqual([400, 800, 1600]);
    expect(seen).toEqual([2, 3, 4]); // reported indices start where the counter starts
  });

  it("a 'stop' verdict rejects with the last error and schedules no wait", async () => {
    const { defer, tick, pending } = manualDefer();
    const seen: Array<{ attempt: number; elapsedMs: number }> = [];
    const done = retryForever(
      async () => {
        throw new Error('still held');
      },
      {
        defer,
        signal: new AbortController().signal,
        baseMs: 100,
        capMs: 1000,
        waitFirst: true,
        onFailure: ({ attempt, elapsedMs }) => {
          seen.push({ attempt, elapsedMs });
          return elapsedMs >= 300 ? 'stop' : undefined;
        }
      }
    );
    const outcome = done.catch((error: Error) => error.message);
    await tick(); // 100 → fail (elapsed 100)
    await tick(); // 200 → fail (elapsed 300 → stop)
    expect(await outcome).toBe('still held');
    expect(seen).toEqual([
      { attempt: 0, elapsedMs: 100 },
      { attempt: 1, elapsedMs: 300 }
    ]);
    expect(pending()).toBe(0); // no wait scheduled after the stop
  });

  it('abort mid-wait rejects with an AbortError and cancels the timer', async () => {
    const { defer, tick, pending } = manualDefer();
    const controller = new AbortController();
    const done = retryForever(
      async () => {
        throw new Error('down');
      },
      { defer, signal: controller.signal, baseMs: 100, capMs: 1000 }
    );
    const outcome = done.catch((error: unknown) => error);
    await Promise.resolve(); // attempt 0 failed; now waiting 100ms
    controller.abort();
    await tick();
    expect(isAbortError(await outcome)).toBe(true);
    expect(pending()).toBe(0);
  });

  it('abort observed by the task itself (shared signal) is teardown, not a retryable failure', async () => {
    const { defer } = manualDefer();
    const controller = new AbortController();
    let attempts = 0;
    const done = retryForever(
      async () => {
        attempts += 1;
        // A fetch carrying the shared signal rejects like this on close().
        controller.abort();
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        throw error;
      },
      { defer, signal: controller.signal, baseMs: 100, capMs: 1000 }
    );
    expect(isAbortError(await done.catch((error: unknown) => error))).toBe(true);
    expect(attempts).toBe(1);
  });

  it('a wake source ends the current wait early (attempt runs without the timer firing)', async () => {
    const { defer, pending } = manualDefer();
    let wakeNow: (() => void) | null = null;
    let attempts = 0;
    const done = retryForever(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error('down');
        return 'up';
      },
      {
        defer,
        signal: new AbortController().signal,
        baseMs: 60_000,
        capMs: 60_000,
        wake: (wake) => {
          wakeNow = wake;
          return () => {
            wakeNow = null;
          };
        }
      }
    );
    await Promise.resolve();
    expect(attempts).toBe(1);
    // The browser comes back online: no need to sit out the 60s backoff.
    wakeNow!();
    expect(await done).toBe('up');
    expect(pending()).toBe(0); // the wake cancelled the pending timer
  });

  it('jitter uses ONLY the injected random01 source', async () => {
    const { defer, delays, tick } = manualDefer();
    let failures = 2;
    const done = retryForever(
      async () => {
        if (failures > 0) {
          failures -= 1;
          throw new Error('nope');
        }
        return 'ok';
      },
      {
        defer,
        signal: new AbortController().signal,
        baseMs: 1000,
        capMs: 10_000,
        jitter: 0.25,
        // Always the midpoint high extreme: factor = 1 + (1·2−1)·0.25 = 1.25.
        random01: () => 1 - Number.EPSILON
      }
    );
    await tick();
    await tick();
    expect(await done).toBe('ok');
    expect(delays).toEqual([1250, 2500]);
  });

  it('jitter without an injected source throws loudly (determinism doctrine)', async () => {
    const { defer } = manualDefer();
    const done = retryForever(
      async () => {
        throw new Error('nope');
      },
      { defer, signal: new AbortController().signal, baseMs: 100, capMs: 1000, jitter: 0.25 }
    );
    await expect(done).rejects.toThrow(/random01/);
  });
});
