import type { Accessor } from 'solid-js';
import { createAnimationFrame } from '../base-utils/createAnimationFrame';
import { TransitionStatusDataAttributes } from './stateAttributesMapping';

declare global {
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

/**
 * Returns a function that executes a callback once all animations have finished on an element.
 * Solid port of upstream's `useAnimationsFinished`.
 *
 * Upstream wraps the callback in `ReactDOM.flushSync` so React synchronously commits the
 * unmount before the browser paints. Solid signal writes are already synchronous, so the
 * callback is simply invoked directly.
 *
 * @param getElement - Accessor for the element to watch for animations.
 * @param waitForStartingStyleRemoved - Whether to wait for `[data-starting-style]` to be removed
 *   before checking for animations.
 * @param treatAbortedAsFinished - Whether to treat aborted animations as finished. If `false`, and
 *   there are aborted animations, the function will check again if any new animations have started
 *   and wait for them to finish.
 * @returns A function that takes a callback to execute once all animations have finished, and an
 *   optional `AbortSignal` to abort the callback before it runs.
 */
export function createAnimationsFinished(
  getElement: Accessor<HTMLElement | null | undefined>,
  waitForStartingStyleRemoved: Accessor<boolean> = () => false,
  treatAbortedAsFinished: Accessor<boolean> = () => true,
) {
  const frame = createAnimationFrame();

  return (
    /**
     * A function to execute once all animations have finished.
     */
    fnToExecute: () => void,
    /**
     * An optional AbortSignal that can be used to abort `fnToExecute` before all the animations
     * have finished.
     * @default null
     */
    signal: AbortSignal | null = null,
  ) => {
    frame.cancel();

    const element = getElement();
    if (element == null) {
      return;
    }

    const resolvedElement = element;

    if (
      typeof resolvedElement.getAnimations !== 'function' ||
      globalThis.BASE_UI_ANIMATIONS_DISABLED
    ) {
      fnToExecute();
      return;
    }

    function exec() {
      Promise.all(resolvedElement.getAnimations().map((animation) => animation.finished))
        .then(() => {
          if (!signal?.aborted) {
            fnToExecute();
          }
        })
        .catch(() => {
          if (treatAbortedAsFinished()) {
            if (!signal?.aborted) {
              fnToExecute();
            }
            return;
          }

          const currentAnimations = resolvedElement.getAnimations();

          if (
            !signal?.aborted &&
            currentAnimations.length > 0 &&
            currentAnimations.some(
              (animation) => animation.pending || animation.playState !== 'finished',
            )
          ) {
            // Sometimes animations can be aborted because a property they depend on changes while
            // the animation plays. In such cases, we need to re-check if any new animations have
            // started.
            exec();
          }
        });
    }

    if (waitForStartingStyleRemoved()) {
      const startingStyleAttribute = TransitionStatusDataAttributes.startingStyle;

      // If `[data-starting-style]` isn't present, fall back to waiting one more frame
      // to give "open" animations a chance to be registered.
      if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
        frame.request(exec);
        return;
      }

      // Wait for `[data-starting-style]` to have been removed.
      const attributeObserver = new MutationObserver(() => {
        if (!resolvedElement.hasAttribute(startingStyleAttribute)) {
          attributeObserver.disconnect();
          exec();
        }
      });

      attributeObserver.observe(resolvedElement, {
        attributes: true,
        attributeFilter: [startingStyleAttribute],
      });

      signal?.addEventListener('abort', () => attributeObserver.disconnect(), { once: true });
      return;
    }

    frame.request(exec);
  };
}
