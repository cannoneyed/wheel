/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { NOOP } from '../../base-utils/empty';
import { componentRuntime } from '../../base-utils/runtime';
import type { FocusableElement } from './tabbable';

/**
 * Solid port of upstream's `enqueueFocus.ts`.
 */
interface Options {
  preventScroll?: boolean | undefined;
  sync?: boolean | undefined;
  // Called when the frame runs to decide whether focus should still be applied.
  shouldFocus?: (() => boolean) | undefined;
}

let rafId = 0;
export function enqueueFocus(el: FocusableElement | null, options: Options = {}) {
  const { preventScroll = false, sync = false, shouldFocus } = options;

  componentRuntime.cancelAnimationFrame(rafId);

  function exec() {
    if (shouldFocus && !shouldFocus()) {
      return;
    }
    el?.focus({ preventScroll });
  }

  if (sync) {
    exec();
    return NOOP;
  }

  const currentRafId = componentRuntime.requestAnimationFrame(exec);
  rafId = currentRafId;
  return () => {
    if (rafId === currentRafId) {
      componentRuntime.cancelAnimationFrame(currentRafId);
      rafId = 0;
    }
  };
}
