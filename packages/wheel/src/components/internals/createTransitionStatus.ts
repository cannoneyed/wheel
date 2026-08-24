/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createComputed, createEffect, createSignal, onCleanup, untrack, type Accessor } from 'solid-js';
import { AnimationFrame } from '../base-utils/createAnimationFrame';

export type TransitionStatus = 'starting' | 'ending' | 'idle' | undefined;

export interface CreateTransitionStatusReturnValue {
  mounted: Accessor<boolean>;
  setMounted: (value: boolean | ((prev: boolean) => boolean)) => void;
  transitionStatus: Accessor<TransitionStatus>;
}

/**
 * Provides a status string for CSS animations.
 * Solid port of upstream's `useTransitionStatus`.
 *
 * Upstream drives `mounted`/`transitionStatus` with a cascade of `if`
 * statements evaluated during React's render phase: calling `setState`
 * there triggers React to synchronously re-run the component until the
 * values stop changing, so by the time the render commits the two pieces of
 * state have already reached a fixed point. `createComputed` (Solid's
 * render effect) reproduces that: it reruns synchronously whenever `open`,
 * `mounted`, or `transitionStatus` change — including when it writes one of
 * those signals itself — so the same cascade converges before any other
 * effect observes the values.
 *
 * The three upstream `useIsoLayoutEffect`s that defer state changes to the
 * next animation frame become plain `createEffect`s; their cleanup
 * (`AnimationFrame.cancel`) is registered via `onCleanup` instead of a
 * returned function.
 *
 * @param open - whether the element is open.
 * @param enableIdleState - enables the `'idle'` state between `'starting'` and `'ending'`.
 * @param deferEndingState - defers entering the `'ending'` state to the next animation frame.
 */
export function createTransitionStatus(
  open: Accessor<boolean>,
  enableIdleState: Accessor<boolean> = () => false,
  deferEndingState: Accessor<boolean> = () => false,
): CreateTransitionStatusReturnValue {
  const [transitionStatus, setTransitionStatus] = createSignal<TransitionStatus>(
    untrack(open) && untrack(enableIdleState) ? 'idle' : undefined,
  );
  const [mounted, setMounted] = createSignal(untrack(open));

  // Render-phase `if` cascade (see doc comment above).
  createComputed(() => {
    const isOpen = open();
    const isMounted = mounted();
    const status = transitionStatus();
    const deferEnding = deferEndingState();

    if (isOpen && !isMounted) {
      setMounted(true);
      setTransitionStatus('starting');
    }

    if (!isOpen && isMounted && status !== 'ending' && !deferEnding) {
      setTransitionStatus('ending');
    }

    if (!isOpen && !isMounted && status === 'ending') {
      setTransitionStatus(undefined);
    }
  });

  // Effect: when ending is deferred, enter it on the next animation frame instead of immediately.
  createEffect(() => {
    const isOpen = open();
    const isMounted = mounted();
    const status = transitionStatus();
    const deferEnding = deferEndingState();

    if (!isOpen && isMounted && status !== 'ending' && deferEnding) {
      const frame = AnimationFrame.request(() => {
        setTransitionStatus('ending');
      });

      onCleanup(() => {
        AnimationFrame.cancel(frame);
      });
    }
  });

  // Effect: clear the status one frame after opening, when idle state isn't used.
  createEffect(() => {
    const enableIdle = enableIdleState();
    const isOpen = open();

    if (!isOpen || enableIdle) {
      return;
    }

    const frame = AnimationFrame.request(() => {
      setTransitionStatus(undefined);
    });

    onCleanup(() => {
      AnimationFrame.cancel(frame);
    });
  });

  // Effect: transition through 'starting' -> 'idle' one frame after opening, when idle state is used.
  createEffect(() => {
    const enableIdle = enableIdleState();
    const isOpen = open();
    const isMounted = mounted();
    const status = transitionStatus();

    if (!isOpen || !enableIdle) {
      return;
    }

    if (isOpen && isMounted && status !== 'idle') {
      setTransitionStatus('starting');
    }

    const frame = AnimationFrame.request(() => {
      setTransitionStatus('idle');
    });

    onCleanup(() => {
      AnimationFrame.cancel(frame);
    });
  });

  return {
    mounted,
    setMounted,
    transitionStatus,
  };
}
