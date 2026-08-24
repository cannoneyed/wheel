// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, createSignal } from 'solid-js';
import { resetAnimationFrameScheduler } from '../base-utils/createAnimationFrame';
import { createTransitionStatus } from './createTransitionStatus';

function installRafMock() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, cb);
      return handle;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => {
      callbacks.delete(handle);
    }),
  );

  return {
    flush(time = 0) {
      const pending = Array.from(callbacks.values());
      callbacks.clear();
      pending.forEach((cb) => cb(time));
    },
  };
}

// Lets any pending microtask-scheduled Solid effects run before the assertion.
async function tick() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createTransitionStatus', () => {
  let raf: ReturnType<typeof installRafMock>;

  beforeEach(() => {
    raf = installRafMock();
  });

  afterEach(() => {
    resetAnimationFrameScheduler();
    vi.unstubAllGlobals();
  });

  it('starts unmounted with no transition status when initially closed', () => {
    createRoot((dispose) => {
      const [open] = createSignal(false);
      const { mounted, transitionStatus } = createTransitionStatus(open);

      expect(mounted()).toBe(false);
      expect(transitionStatus()).toBeUndefined();

      dispose();
    });
  });

  it('starts mounted with no transition status when initially open', () => {
    createRoot((dispose) => {
      const [open] = createSignal(true);
      const { mounted, transitionStatus } = createTransitionStatus(open);

      expect(mounted()).toBe(true);
      expect(transitionStatus()).toBeUndefined();

      dispose();
    });
  });

  it('mounts and enters "starting", then clears the status after a frame', async () => {
    let cleanup!: () => void;
    let openState!: ReturnType<typeof createSignal<boolean>>;
    let result!: ReturnType<typeof createTransitionStatus>;

    createRoot((dispose) => {
      cleanup = dispose;
      openState = createSignal(false);
      result = createTransitionStatus(openState[0]);
    });

    const [, setOpen] = openState;
    const { mounted, transitionStatus } = result;

    setOpen(true);
    expect(mounted()).toBe(true);
    expect(transitionStatus()).toBe('starting');

    await tick();
    raf.flush();

    expect(transitionStatus()).toBeUndefined();
    expect(mounted()).toBe(true);

    cleanup();
  });

  it('enters "ending" synchronously when closed (not deferred)', async () => {
    let cleanup!: () => void;
    let openState!: ReturnType<typeof createSignal<boolean>>;
    let result!: ReturnType<typeof createTransitionStatus>;

    createRoot((dispose) => {
      cleanup = dispose;
      openState = createSignal(true);
      result = createTransitionStatus(openState[0]);
    });

    const [, setOpen] = openState;
    const { mounted, setMounted, transitionStatus } = result;

    // Clear the (no-op) initial-open scheduling before exercising the close path.
    await tick();
    raf.flush();

    setOpen(false);
    expect(transitionStatus()).toBe('ending');
    expect(mounted()).toBe(true);

    // The consumer (e.g. an open-change-complete callback) unmounts once the
    // exit animation finishes; that should clear the ending status too.
    setMounted(false);
    expect(transitionStatus()).toBeUndefined();

    cleanup();
  });

  it('defers entering "ending" to the next animation frame when deferEndingState is true', async () => {
    let cleanup!: () => void;
    let openState!: ReturnType<typeof createSignal<boolean>>;
    let deferState!: ReturnType<typeof createSignal<boolean>>;
    let result!: ReturnType<typeof createTransitionStatus>;

    createRoot((dispose) => {
      cleanup = dispose;
      openState = createSignal(false);
      deferState = createSignal(false);
      result = createTransitionStatus(openState[0], () => false, deferState[0]);
    });

    const [, setOpen] = openState;
    const [, setDefer] = deferState;
    const { transitionStatus } = result;

    setOpen(true);
    await tick();
    raf.flush();
    expect(transitionStatus()).toBeUndefined();

    setDefer(true);
    setOpen(false);

    // Not applied synchronously, unlike the non-deferred case.
    expect(transitionStatus()).not.toBe('ending');

    await tick();
    raf.flush();

    expect(transitionStatus()).toBe('ending');

    cleanup();
  });

  it('cycles "starting" -> "idle" over a frame when enableIdleState is true', async () => {
    let cleanup!: () => void;
    let openState!: ReturnType<typeof createSignal<boolean>>;
    let result!: ReturnType<typeof createTransitionStatus>;

    createRoot((dispose) => {
      cleanup = dispose;
      openState = createSignal(false);
      result = createTransitionStatus(openState[0], () => true);
    });

    const [, setOpen] = openState;
    const { mounted, transitionStatus } = result;

    setOpen(true);
    expect(mounted()).toBe(true);
    expect(transitionStatus()).toBe('starting');

    await tick();
    raf.flush();

    expect(transitionStatus()).toBe('idle');

    // Closing still enters "ending" synchronously; idle state only concerns
    // the starting side of the transition.
    setOpen(false);
    expect(transitionStatus()).toBe('ending');

    cleanup();
  });
});
