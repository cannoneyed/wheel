/** The browser time and scheduling seam used by component internals. */
export const componentRuntime = {
  now: (): number => Date.now(),
  scheduleTimeout: (callback: () => void, delay: number): ReturnType<typeof globalThis.setTimeout> =>
    globalThis.setTimeout(callback, delay),
  cancelTimeout: (id: ReturnType<typeof globalThis.setTimeout>): void => globalThis.clearTimeout(id),
  requestAnimationFrame: (callback: FrameRequestCallback): number =>
    globalThis.requestAnimationFrame(callback),
  cancelAnimationFrame: (id: number): void => globalThis.cancelAnimationFrame(id),
  animationFrameSource: (): typeof globalThis.requestAnimationFrame =>
    globalThis.requestAnimationFrame,
};
