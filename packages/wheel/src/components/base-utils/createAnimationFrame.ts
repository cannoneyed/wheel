/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { onCleanup } from 'solid-js';
import { componentRuntime } from './runtime';

/** Unlike `setTimeout`, rAF doesn't guarantee a positive integer return value, so we can't have
 * a monomorphic `uint` type with `0` meaning empty.
 * See warning note at:
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame#return_value */
type AnimationFrameId = number;

const EMPTY = null;

let LAST_RAF = componentRuntime.animationFrameSource();

/**
 * Framework-neutral rAF batcher, ported verbatim from upstream.
 *
 * This implementation uses an array as a backing data-structure for frame callbacks.
 * It allows `O(1)` callback cancelling by inserting a `null` in the array, though it
 * never calls the native `cancelAnimationFrame` if there are no frames left. This can
 * be much more efficient if there is a call pattern that alterns as
 * "request-cancel-request-cancel-…".
 * But in the case of "request-request-…-cancel-cancel-…", it leaves the final animation
 * frame to run anyway. We turn that frame into a `O(1)` no-op via `callbacksCount`.
 */
class Scheduler {
  callbacks = [] as (FrameRequestCallback | null)[];

  callbacksCount = 0;

  nextId = 1;

  startId = 1;

  isScheduled = false;

  tick = (timestamp: number) => {
    this.isScheduled = false;

    const currentCallbacks = this.callbacks;
    const currentCallbacksCount = this.callbacksCount;

    // Update these before iterating, callbacks could call `requestAnimationFrame` again.
    this.callbacks = [];
    this.callbacksCount = 0;
    this.startId = this.nextId;

    if (currentCallbacksCount > 0) {
      for (let i = 0; i < currentCallbacks.length; i += 1) {
        currentCallbacks[i]?.(timestamp);
      }
    }
  };

  request(fn: FrameRequestCallback) {
    const id = this.nextId;
    this.nextId += 1;
    this.callbacks.push(fn);
    this.callbacksCount += 1;

    /* In a test environment with fake timers, a fake `requestAnimationFrame` can be called
     * but there's no guarantee that the animation frame will actually run before the fake
     * timers are teared, which leaves `isScheduled` set, but won't run our `tick()`. */
    const currentRAF = componentRuntime.animationFrameSource();
    const didRAFChange =
      process.env.NODE_ENV !== 'production' &&
      LAST_RAF !== currentRAF &&
      ((LAST_RAF = currentRAF), true);

    if (!this.isScheduled || didRAFChange) {
      // Set the flag BEFORE requesting: a synchronously-invoked callback
      // (test mocks) runs tick() — which resets the flag — during the call,
      // and assigning afterwards would clobber that reset, silently dropping
      // the next request.
      this.isScheduled = true;
      componentRuntime.requestAnimationFrame(this.tick);
    }
    return id;
  }

  cancel(id: AnimationFrameId) {
    const index = id - this.startId;
    if (index < 0 || index >= this.callbacks.length) {
      return;
    }
    this.callbacks[index] = null;
    this.callbacksCount -= 1;
  }
}

let scheduler = new Scheduler();

/**
 * Replaces the shared scheduler and drops all pending animation frame callbacks.
 *
 * For test environments only. The scheduler is process-global, so a callback scheduled in one test
 * but never run (e.g. requested under fake timers that were torn down before the frame fired) would
 * otherwise survive into a later test and run there against stale state. Call between tests to drop
 * such leftovers.
 */
export function resetAnimationFrameScheduler() {
  const previous = scheduler;
  scheduler = new Scheduler();
  // Continue the id sequence so `cancel()` calls from `AnimationFrame` instances created before the
  // reset cannot cancel callbacks scheduled after it.
  scheduler.nextId = previous.nextId;
  scheduler.startId = previous.nextId;
  // A frame requested before the reset may still be pending and holds the previous scheduler's
  // `tick`; empty its queue in place so that frame runs nothing when it eventually fires.
  previous.callbacks = [];
  previous.callbacksCount = 0;
}

export class AnimationFrame {
  static create() {
    return new AnimationFrame();
  }

  static request(fn: FrameRequestCallback) {
    return scheduler.request(fn);
  }

  static cancel(id: AnimationFrameId) {
    return scheduler.cancel(id);
  }

  currentId: AnimationFrameId | null = EMPTY;

  /**
   * Executes `fn` after the next paint, clearing any previously scheduled call.
   */
  request(fn: Function) {
    this.cancel();
    this.currentId = scheduler.request(() => {
      this.currentId = EMPTY;
      fn();
    });
  }

  cancel = () => {
    if (this.currentId !== EMPTY) {
      scheduler.cancel(this.currentId);
      this.currentId = EMPTY;
    }
  };
}

/**
 * A `requestAnimationFrame` with automatic cleanup when the owning reactive scope is disposed.
 * Solid port of upstream's `useAnimationFrame`.
 */
export function createAnimationFrame() {
  const frame = AnimationFrame.create();
  onCleanup(frame.cancel);
  return frame;
}
