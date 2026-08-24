/**
 * Ids and time are always injected (Clock/IdGen) so every run can be made
 * deterministic. Ids are prefixed UUIDv7:
 * `todo_0190b62e-...` — time-ordered, collision-proof, self-describing in
 * logs and provenance. The server validates prefix + format on every mutation.
 */

// Clock and RandomBytes are the injectable time/randomness seam; they live in
// core (core/runtime-defaults) because kit and core also need them, and the
// layer DAG forbids reaching up into sync. Re-exported here so id consumers
// keep a single import.
export type { Clock, RandomBytes } from '../core/runtime-defaults';
import type { Clock, RandomBytes } from '../core/runtime-defaults';

/** Injected id source (prefixed UUIDv7s) - deterministic in World, real randomness in production. */
export interface IdGen {
  newId(prefix: string): string;
}

const PREFIX_PATTERN = /^[a-z][a-z0-9]*$/;
const ID_PATTERN = /^([a-z][a-z0-9]*)_([0-9a-f]{8})-([0-9a-f]{4})-(7[0-9a-f]{3})-([89ab][0-9a-f]{3})-([0-9a-f]{12})$/;

/** Validate a prefixed-UUIDv7 id (optionally pinning the prefix) - the server refuses malformed client-generated ids with this. */
export function isValidId(id: string, prefix?: string): boolean {
  const match = ID_PATTERN.exec(id);
  if (!match) {
    return false;
  }
  return prefix === undefined || match[1] === prefix;
}

/** Extract the UUIDv7 timestamp (epoch ms) for debugging/provenance display. */
export function idTimestamp(id: string): number | null {
  const match = ID_PATTERN.exec(id);
  if (!match) {
    return null;
  }
  return parseInt(match[2] + match[3], 16);
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

/**
 * UUIDv7 generator over an injected clock and randomness source. Within one
 * millisecond, a 12-bit counter in rand_a keeps ids monotonic; the counter
 * resets when the clock advances.
 */
export function createIdGen(options: { clock: Clock; randomBytes: RandomBytes }): IdGen {
  const { clock, randomBytes } = options;
  let lastMs = -1;
  let counter = 0;
  return {
    newId(prefix: string): string {
      if (!PREFIX_PATTERN.test(prefix)) {
        throw new Error(`Invalid id prefix ${JSON.stringify(prefix)}: must match ${PREFIX_PATTERN}.`);
      }
      let ms = clock.now();
      if (ms <= lastMs) {
        ms = lastMs;
        counter += 1;
        if (counter > 0xfff) {
          // Counter exhausted within one ms: nudge time forward one ms.
          ms += 1;
          counter = 0;
        }
      } else {
        counter = 0;
      }
      lastMs = ms;

      const time = ms.toString(16).padStart(12, '0');
      const rand = randomBytes(8);
      const randA = counter.toString(16).padStart(3, '0');
      const variantByte = (rand[0] & 0x3f) | 0x80;
      const uuid =
        `${time.slice(0, 8)}-${time.slice(8, 12)}` +
        `-7${randA}` +
        `-${hex(variantByte)}${hex(rand[1])}` +
        `-${hex(rand[2])}${hex(rand[3])}${hex(rand[4])}${hex(rand[5])}${hex(rand[6])}${hex(rand[7])}`;
      return `${prefix}_${uuid}`;
    }
  };
}

/**
 * Deterministic randomness for World/tests: a seeded xorshift stream. Same
 * seed → same bytes → same ids, forever. Never use outside tests.
 */
export function seededRandomBytes(seed: number): RandomBytes {
  let state = seed >>> 0 || 0xc0ffee;
  return (length: number) => {
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      bytes[index] = state & 0xff;
    }
    return bytes;
  };
}

/** Fixed-step clock for World/tests. */
export function fixedClock(start: number, stepMs = 0): Clock {
  let current = start;
  return {
    now(): number {
      const value = current;
      current += stepMs;
      return value;
    }
  };
}
