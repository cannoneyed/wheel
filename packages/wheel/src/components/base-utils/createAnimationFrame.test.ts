// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'solid-js';
import {
  AnimationFrame,
  createAnimationFrame,
  resetAnimationFrameScheduler,
} from './createAnimationFrame';

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
    pendingCount: () => callbacks.size,
  };
}

describe('AnimationFrame', () => {
  let raf: ReturnType<typeof installRafMock>;

  beforeEach(() => {
    raf = installRafMock();
  });

  afterEach(() => {
    resetAnimationFrameScheduler();
    vi.unstubAllGlobals();
  });

  it('runs the callback on the next animation frame', () => {
    const fn = vi.fn();
    const frame = AnimationFrame.create();

    frame.request(fn);
    expect(fn).not.toHaveBeenCalled();

    raf.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clears any previously scheduled call when request is called again', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const frame = AnimationFrame.create();

    frame.request(fn1);
    frame.request(fn2);
    raf.flush();

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents the callback from running', () => {
    const fn = vi.fn();
    const frame = AnimationFrame.create();

    frame.request(fn);
    frame.cancel();
    raf.flush();

    expect(fn).not.toHaveBeenCalled();
  });

  it('resets currentId once the callback has run', () => {
    const frame = AnimationFrame.create();

    frame.request(() => {});
    raf.flush();

    expect(frame.currentId).toBeNull();
  });

  it('does not affect other AnimationFrame instances sharing the scheduler', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const frameA = AnimationFrame.create();
    const frameB = AnimationFrame.create();

    frameA.request(fn1);
    frameB.request(fn2);
    frameA.cancel();
    raf.flush();

    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});

describe('createAnimationFrame', () => {
  let raf: ReturnType<typeof installRafMock>;

  beforeEach(() => {
    raf = installRafMock();
  });

  afterEach(() => {
    resetAnimationFrameScheduler();
    vi.unstubAllGlobals();
  });

  it('runs the callback normally when the scope stays alive', () => {
    const fn = vi.fn();

    createRoot((dispose) => {
      const frame = createAnimationFrame();
      frame.request(fn);
      dispose();
    });

    // dispose() happens after request() above; run the assertion against a
    // fresh scope to also verify the "not disposed" path.
    createRoot(() => {
      const frame = createAnimationFrame();
      frame.request(fn);
    });

    raf.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending frame when the owning reactive scope is disposed', () => {
    const fn = vi.fn();
    let dispose: (() => void) | undefined;

    createRoot((d) => {
      dispose = d;
      const frame = createAnimationFrame();
      frame.request(fn);
    });

    dispose?.();
    raf.flush();

    expect(fn).not.toHaveBeenCalled();
  });
});
