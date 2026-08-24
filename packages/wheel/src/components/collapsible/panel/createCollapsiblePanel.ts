/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import { AnimationFrame } from '../../base-utils/createAnimationFrame';
import { ownerWindow } from '../../base-utils/owner';
import { warn } from '../../base-utils/warn';
import type { HTMLProps } from '../../internals/types';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createAnimationsFinished } from '../../internals/createAnimationsFinished';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { CollapsiblePanelDataAttributes } from './CollapsiblePanelDataAttributes';
import type { CollapsibleRoot } from '../root/CollapsibleRoot';

type AnimationType = 'css-transition' | 'css-animation' | 'none';

interface Dimensions {
  height: number | undefined;
  width: number | undefined;
}

const EMPTY_DIMENSIONS: Dimensions = {
  height: undefined,
  width: undefined,
};

export interface CreateCollapsiblePanelParameters {
  /**
   * Allows the browser's built-in page search to find and expand the panel contents.
   */
  hiddenUntilFound: Accessor<boolean>;
  /**
   * The `id` attribute of the panel (the resolved custom-or-generated id).
   */
  id: Accessor<string | undefined>;
  /**
   * Whether to keep the element in the DOM while the panel is closed.
   * This prop is ignored when `hiddenUntilFound` is used.
   */
  keepMounted: Accessor<boolean>;
  /**
   * Whether the collapsible panel is mounted for transition and hidden-state purposes.
   */
  mounted: Accessor<boolean>;
  onOpenChange: (open: boolean, eventDetails: CollapsibleRoot.ChangeEventDetails) => void;
  /**
   * Whether the collapsible panel is currently open.
   */
  open: Accessor<boolean>;
  setMounted: (nextMounted: boolean) => void;
  setOpen: (nextOpen: boolean) => void;
  transitionStatus: Accessor<TransitionStatus>;
}

export interface CreateCollapsiblePanelReturnValue {
  height: Accessor<number | undefined>;
  width: Accessor<number | undefined>;
  /**
   * Reactive thunk of intrinsic props to spread on the panel element. Pass
   * directly into `renderElement`'s `props` array.
   */
  props: () => HTMLProps;
  /**
   * Ref callback for the panel DOM element. Pass into `renderElement`'s `ref`.
   */
  ref: (el: HTMLDivElement) => void;
  shouldPreventOpenAnimation: Accessor<boolean>;
  shouldRender: Accessor<boolean>;
  transitionStatus: Accessor<TransitionStatus>;
}

/**
 * Solid port of upstream's `useCollapsiblePanel`. Measures the panel's
 * expanded size and drives the starting/ending transition choreography.
 *
 * Upstream's `useIsoLayoutEffect`s become `createEffect`s here: in this
 * runtime, `createEffect` reruns synchronously whenever a tracked signal it
 * reads changes (including signals written by another effect/computed in the
 * same synchronous call), so the measurement/motion-suppression logic below
 * observes the DOM at the same logical point upstream's layout effect would.
 *
 * Upstream also guards against React.Activity teardown replaying a mount
 * animation (`shouldPreventActivityResumeAnimationRef`). Solid has no
 * equivalent concurrent-rendering primitive, so that one-shot guard is not
 * ported — see the port's deviation notes.
 */
export function createCollapsiblePanel(
  parameters: CreateCollapsiblePanelParameters,
): CreateCollapsiblePanelReturnValue {
  const { hiddenUntilFound, id, keepMounted, mounted, onOpenChange, open, setMounted, setOpen, transitionStatus } =
    parameters;

  let panelEl: HTMLDivElement | null = null;
  let animationType: AnimationType | null = null;
  let lastMeasuredDimensions: Dimensions = EMPTY_DIMENSIONS;
  // `beforematch` should reveal the matched content immediately, so the next
  // open cycle skips author-defined motion once and then returns to normal.
  let shouldSkipNextOpen = false;
  // Keyframe mount animations on initially open panels cause a visible layout
  // shift during the first paint, so suppress that first open lifecycle
  // until the panel has been closed once.
  let shouldPreventMountAnimation = open();
  let pendingTemporaryStyleRestore: (() => void) | null = null;

  const [dimensions, setDimensionsUnwrapped] = createSignal<Dimensions>(EMPTY_DIMENSIONS);
  // Some open paths intentionally bypass motion, but the shared root transition
  // status still advances asynchronously. Override the panel to idle so its data
  // attributes and dimension cleanup reflect the immediate open state.
  const [forcePanelIdle, setForcePanelIdle] = createSignal(false);

  // Only used to handle panel close.
  const runOnceCloseAnimationsFinish = createAnimationsFinished(
    () => panelEl,
    () => false,
    () => false,
  );

  const hidden = () => !open() && !mounted();
  const panelTransitionStatus = (): TransitionStatus =>
    forcePanelIdle() ? 'idle' : transitionStatus();
  const shouldPreventOpenAnimation = () => open() && shouldPreventMountAnimation;

  const shouldPersistHiddenTransitionStyles = () =>
    hiddenUntilFound() && hidden() && animationType !== 'css-animation';

  // Most measured dimensions are reused later when CSS keyframe closes need a
  // pixel size after the rendered dimensions have been reset back to `auto`.
  // Passing `false` is only for clearing the current dimensions state.
  const setDimensions = (nextDimensions: Dimensions, shouldCacheMeasurement: boolean = true) => {
    if (shouldCacheMeasurement) {
      lastMeasuredDimensions = nextDimensions;
    }
    setDimensionsUnwrapped(nextDimensions);
  };

  const restorePendingTemporaryStyle = () => {
    pendingTemporaryStyleRestore?.();
    pendingTemporaryStyleRestore = null;
  };

  const setPendingTemporaryStyleRestore = (restore: () => void) => {
    restorePendingTemporaryStyle();
    pendingTemporaryStyleRestore = () => {
      pendingTemporaryStyleRestore = null;
      restore();
    };
  };

  onCleanup(() => {
    restorePendingTemporaryStyle();
  });

  // `forcePanelIdle` is only a temporary override for open paths that skip
  // motion. Keep it active while the shared root still reports `starting`,
  // then drop it once the root transition state catches up.
  createEffect(() => {
    if (!forcePanelIdle() || transitionStatus() === 'starting') {
      return;
    }
    setForcePanelIdle(false);
  });

  // Main measurement / motion-suppression effect (upstream's iso-layout-effect).
  createEffect(() => {
    const panel = panelEl;
    const isOpen = open();
    const isMounted = mounted();
    const status = transitionStatus();

    if (!panel) {
      return;
    }

    // `beforematch` can temporarily force a `0s` motion duration so the matched
    // content reveals immediately. Restore the authored duration before detecting
    // the next close animation type, otherwise that first close is misread as
    // "no motion" and the close transition or keyframe gets skipped.
    if (!isOpen && pendingTemporaryStyleRestore) {
      restorePendingTemporaryStyle();
    }

    const preventOpenAnimation = shouldPreventOpenAnimation();
    const type = getAnimationType(panel, preventOpenAnimation);
    animationType = type;

    // Initially open keyframe panels skip their first paint animation to avoid
    // layout shift, but we still need to cache the expanded size so the first
    // close animation can start from pixels instead of `auto`.
    if (isOpen && status === 'idle' && shouldPreventMountAnimation && type === 'css-animation') {
      lastMeasuredDimensions = getDimensions(panel);
      return;
    }

    // Handle the opening pass: measure the expanded size and, when necessary,
    // neutralize author-defined motion so the panel can open immediately.
    if (isOpen && status === 'starting') {
      // `beforematch` opens should reveal the panel immediately so find-in-page
      // does not wait for the author-defined transition or animation to finish.
      const skipNextOpen = shouldSkipNextOpen;
      shouldSkipNextOpen = false;

      if (type === 'none') {
        setDimensions(getDimensions(panel));
        setForcePanelIdle(true);
        return;
      }

      if (type === 'css-transition') {
        const cancelResetLayoutStyles = resetLayoutStyles(panel);
        onCleanup(cancelResetLayoutStyles);
        setDimensions(getDimensions(panel));

        if (skipNextOpen) {
          const restoreTransitionDuration = setTemporaryStyle(panel, 'transition-duration', '0s');
          setPendingTemporaryStyleRestore(restoreTransitionDuration);
          setForcePanelIdle(true);
        }
        return;
      }

      if (type === 'css-animation') {
        setDimensions(getDimensions(panel));

        if (!skipNextOpen) {
          const restoreAnimationName = setTemporaryStyle(panel, 'animation-name', 'none');
          restoreAnimationName();
          return;
        }

        const restoreAnimationName = setTemporaryStyle(panel, 'animation-name', 'none');
        const restoreAnimationDuration = setTemporaryStyle(panel, 'animation-duration', '0s');

        restoreAnimationName();
        setPendingTemporaryStyleRestore(restoreAnimationDuration);
        setForcePanelIdle(true);
        return;
      }
    }

    // Capture the current size as soon as close is requested, before the
    // deferred ending phase applies closed styles. This keeps close transitions
    // starting from a measured pixel value, including interrupted opens.
    if (!isOpen && isMounted && (status === 'idle' || status === 'starting')) {
      shouldPreventMountAnimation = false;

      if (type === 'none') {
        setDimensions(EMPTY_DIMENSIONS, false);
        setMounted(false);
        return;
      }

      setDimensions(getDimensions(panel));
      return;
    }

    if (status !== 'ending') {
      return;
    }

    if (type === 'none') {
      setMounted(false);
      return;
    }

    const nextDimensions = getDimensions(panel);
    const hasMeasuredSize = (nextDimensions.height ?? 0) > 0 || (nextDimensions.width ?? 0) > 0;

    if (!hasMeasuredSize) {
      setMounted(false);
      return;
    }

    setDimensions(nextDimensions);

    if (type === 'css-animation') {
      const restoreAnimationName = setTemporaryStyle(panel, 'animation-name', 'none');
      restoreAnimationName();
    }
  });

  createOpenChangeComplete({
    enabled: () => open() && mounted() && panelTransitionStatus() === 'idle',
    open: () => true,
    getElement: () => panelEl,
    onComplete() {
      if (!open()) {
        return;
      }
      setDimensions(EMPTY_DIMENSIONS, false);
    },
  });

  // Closing panels need extra sequencing beyond `createOpenChangeComplete`.
  // This effect runs after the `ending` state has committed, so
  // `[data-ending-style]` is already present. Chrome can still register the
  // exit transition one frame later when an Accordion closes one item while
  // opening another, so wait one frame before watching animations.
  // See https://github.com/mui/base-ui/issues/3099
  createEffect(() => {
    const isOpen = open();
    const isMounted = mounted();
    const status = panelTransitionStatus();

    if (isOpen || !isMounted || status !== 'ending') {
      return;
    }

    const panel = panelEl;
    if (!panel) {
      return;
    }

    const abortController = new AbortController();

    function handleComplete() {
      if (open()) {
        return;
      }
      setMounted(false);
      setDimensions(EMPTY_DIMENSIONS, false);
    }

    const endingStyleFrame = AnimationFrame.request(() => {
      if (!abortController.signal.aborted) {
        runOnceCloseAnimationsFinish(handleComplete, abortController.signal);
      }
    });

    onCleanup(() => {
      AnimationFrame.cancel(endingStyleFrame);
      abortController.abort();
    });
  });

  // React only supports a boolean for the `hidden` attribute; Solid's DOM
  // bindings set the `hidden` IDL property the same way, coercing a string
  // like `"until-found"` back to `true`. Force it back onto the attribute.
  createEffect(() => {
    const panel = panelEl;
    if (!panel || !hiddenUntilFound() || !hidden()) {
      return;
    }
    panel.setAttribute('hidden', 'until-found');
  });

  onMount(() => {
    const panel = panelEl;
    if (!panel) {
      return;
    }

    function handleBeforeMatch(event: Event) {
      const eventDetails = createChangeEventDetails(REASONS.none, event);

      onOpenChange(true, eventDetails);

      if (eventDetails.isCanceled) {
        return;
      }

      shouldSkipNextOpen = true;
      setOpen(true);
    }

    panel.addEventListener('beforematch', handleBeforeMatch);
    onCleanup(() => {
      panel.removeEventListener('beforematch', handleBeforeMatch);
    });
  });

  const renderedDimensions = createMemo<Dimensions>(() => {
    const current = dimensions();
    if (
      !open() &&
      mounted() &&
      animationType === 'css-animation' &&
      current.height === undefined &&
      current.width === undefined
    ) {
      return lastMeasuredDimensions;
    }
    return current;
  });

  const shouldRender = () => keepMounted() || hiddenUntilFound() || mounted() || open();

  const props = (): HTMLProps => {
    const result: HTMLProps = {
      hidden: hidden(),
      id: id(),
    };

    if (shouldPersistHiddenTransitionStyles()) {
      result[CollapsiblePanelDataAttributes.startingStyle] = '';
    }

    return result;
  };

  return {
    height: () => renderedDimensions().height,
    width: () => renderedDimensions().width,
    props,
    ref: (el: HTMLDivElement) => {
      panelEl = el;
    },
    shouldPreventOpenAnimation,
    shouldRender,
    transitionStatus: panelTransitionStatus,
  };
}

function getDimensions(element: HTMLElement): Dimensions {
  return {
    height: element.scrollHeight,
    width: element.scrollWidth,
  };
}

function getAnimationType(
  element: HTMLElement,
  hasSuppressedMountAnimation: boolean = false,
): AnimationType {
  const panelStyles = ownerWindow(element).getComputedStyle(element);
  const hasAnimation =
    (panelStyles.animationName
      .split(',')
      .map((name) => name.trim())
      .some((name) => name !== '' && name !== 'none') ||
      hasSuppressedMountAnimation) &&
    hasNonZeroDuration(panelStyles.animationDuration);
  const hasTransition = hasNonZeroDuration(panelStyles.transitionDuration);

  if (hasAnimation && hasTransition) {
    if (process.env.NODE_ENV !== 'production') {
      warn(
        'CSS transitions and CSS animations both detected on Collapsible or Accordion panel.',
        'Only one of either animation type should be used.',
      );
    }

    return 'css-transition';
  }

  if (hasTransition) {
    return 'css-transition';
  }

  if (hasAnimation) {
    return 'css-animation';
  }

  return 'none';
}

function hasNonZeroDuration(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .some((part) => part !== '' && Number.parseFloat(part) > 0);
}

/**
 * Temporarily overrides an inline style property and returns a cleanup that
 * restores the previous inline value and priority.
 */
function setTemporaryStyle(element: HTMLElement, property: string, value: string): () => void {
  const previousValue = element.style.getPropertyValue(property);
  const previousPriority = element.style.getPropertyPriority(property);

  element.style.setProperty(property, value);

  return () => {
    if (previousValue === '') {
      element.style.removeProperty(property);
      return;
    }

    element.style.setProperty(property, previousValue, previousPriority);
  };
}

/**
 * Temporarily resets inline alignment styles that can distort scroll-based
 * size measurements, then restores them on the next animation frame.
 */
function resetLayoutStyles(element: HTMLElement): () => void {
  const originalLayoutStyles = {
    'justify-content': element.style.justifyContent,
    'align-items': element.style.alignItems,
    'align-content': element.style.alignContent,
    'justify-items': element.style.justifyItems,
  };

  Object.keys(originalLayoutStyles).forEach((key) => {
    element.style.setProperty(key, 'initial', 'important');
  });

  function restoreLayoutStyles() {
    Object.entries(originalLayoutStyles).forEach(([key, value]) => {
      if (value === '') {
        element.style.removeProperty(key);
        return;
      }

      element.style.setProperty(key, value);
    });
  }

  const frame = AnimationFrame.request(restoreLayoutStyles);

  return () => {
    AnimationFrame.cancel(frame);
    restoreLayoutStyles();
  };
}
