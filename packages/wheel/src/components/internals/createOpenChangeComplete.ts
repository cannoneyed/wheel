/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, type Accessor } from 'solid-js';
import { createAnimationsFinished } from './createAnimationsFinished';

export interface CreateOpenChangeCompleteParameters {
  /**
   * Whether the hook is enabled.
   * @default true
   */
  enabled?: Accessor<boolean> | undefined;
  /**
   * Whether the element is open.
   */
  open?: Accessor<boolean> | undefined;
  /**
   * Accessor for the element being closed.
   */
  getElement: Accessor<HTMLElement | null | undefined>;
  /**
   * Function to call when the animation completes (or there is no animation).
   */
  onComplete: () => void;
}

/**
 * Calls the provided function when the CSS open/close animation or transition completes.
 * Solid port of upstream's `useOpenChangeComplete`.
 */
export function createOpenChangeComplete(parameters: CreateOpenChangeCompleteParameters) {
  const enabled = () => parameters.enabled?.() ?? true;
  const open = () => parameters.open?.() ?? false;
  const onComplete = parameters.onComplete;

  const runOnceAnimationsFinish = createAnimationsFinished(parameters.getElement, open, () => false);

  createEffect(() => {
    if (!enabled()) {
      return;
    }

    // Track `open` so the effect reruns (and any pending completion is aborted/rescheduled)
    // whenever the open state changes, matching upstream's dependency array.
    open();

    const abortController = new AbortController();

    runOnceAnimationsFinish(onComplete, abortController.signal);

    onCleanup(() => {
      abortController.abort();
    });
  });
}
