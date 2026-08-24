/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSignal, type Accessor } from 'solid-js';
import type { JSX } from 'solid-js';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { contains, getTarget } from '../../floating-ui-solid/utils/element';
import { findScrollableTouchTarget, hasScrollableAncestor, type ScrollAxis } from './scrollable';
import { clamp } from '../../internals/clamp';
import { getElementAtPoint } from './getElementAtPoint';

/**
 * Solid port of upstream's `utils/useSwipeDismiss.ts`.
 *
 * Deviations from upstream (framework-only, behavior unchanged):
 * - Every `React.useRef` becomes a plain closure-local mutable variable — this factory function is
 *   called exactly once per component instance (unlike a React hook re-invoked every render), so
 *   there is no re-render to survive across; a plain `let` already persists for the instance's
 *   lifetime.
 * - The three reactive outputs consumers read over time (`swiping`, `swipeDirection`,
 *   `dragDismissed`) are exposed as accessors (`createSignal`) instead of returned plain values,
 *   since Solid components don't re-run on every state change the way React ones do.
 * - `swipeThreshold` is read once at setup (not re-synced via an effect keyed on a changing prop):
 *   every caller in this port (`Drawer.Viewport`, `Drawer.SwipeArea`) passes a value that is stable
 *   for the component's lifetime, so upstream's `React.useEffect` that reset
 *   `swipeThresholdRef.current` when `swipeThresholdProp` stopped being a function has no
 *   observable effect here.
 * - Event handler parameters are plain DOM `PointerEvent`/`TouchEvent` (no React synthetic event
 *   wrapper), so `event.nativeEvent` reads become `event` itself.
 */

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

interface SwipeDismissNativeTouchMove {
  readonly touches: TouchList;
  readonly currentTarget: HTMLElement;
  readonly defaultPrevented: boolean;
  readonly timeStamp: number;
}

type SwipeDismissStartEvent = PointerEvent | TouchEvent;
type SwipeDismissMoveEvent = PointerEvent | TouchEvent | SwipeDismissNativeTouchMove;
type SwipeDismissEndEvent = PointerEvent | TouchEvent;
type SwipeProgressDetailsInternal = {
  deltaX: number;
  deltaY: number;
  direction: SwipeDirection | undefined;
};

const DEFAULT_SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const MIN_DRAG_THRESHOLD = 1;
const MIN_VELOCITY_DURATION_MS = 50;
const MIN_RELEASE_VELOCITY_DURATION_MS = 16;
const MAX_RELEASE_VELOCITY_AGE_MS = 80;
const DEFAULT_IGNORE_SELECTOR = 'button,a,input,select,textarea,label,[role="button"]';

export function getDisplacement(direction: SwipeDirection, deltaX: number, deltaY: number) {
  switch (direction) {
    case 'up':
      return -deltaY;
    case 'down':
      return deltaY;
    case 'left':
      return -deltaX;
    case 'right':
      return deltaX;
    default:
      return 0;
  }
}

export function getElementTransform(element: HTMLElement) {
  const computedStyle = ownerWindow(element).getComputedStyle(element);
  const transform = computedStyle.transform;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;

  if (transform && transform !== 'none') {
    const matrix = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    if (matrix) {
      const values = matrix[1].split(', ').map(Number.parseFloat);
      if (values.length === 6) {
        translateX = values[4];
        translateY = values[5];
        scale = Math.sqrt(values[0] * values[0] + values[1] * values[1]);
      } else if (values.length === 16) {
        translateX = values[12];
        translateY = values[13];
        scale = values[0];
      }
    }
  }

  return { x: translateX, y: translateY, scale };
}

function getValidTimeStamp(timeStamp: number): number | null {
  return Number.isFinite(timeStamp) && timeStamp > 0 ? timeStamp : null;
}

function getDragTransform(dragOffset: { x: number; y: number }, scale: number): string {
  return `translate3d(${dragOffset.x}px,${dragOffset.y}px,0) scale(${scale})`;
}

function hasPrimaryMouseButton(buttons: number): boolean {
  return buttons % 2 === 1;
}

function safelyChangePointerCapture(
  element: HTMLElement,
  pointerId: number,
  method: 'setPointerCapture' | 'releasePointerCapture',
) {
  const pointerCaptureMethod = element[method];
  if (typeof pointerCaptureMethod !== 'function') {
    return;
  }

  try {
    pointerCaptureMethod.call(element, pointerId);
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFoundError') {
      return;
    }
    throw error;
  }
}

export interface UseSwipeDismissDetails {
  nativeEvent: PointerEvent | TouchEvent;
  direction: SwipeDirection | undefined;
}

export type UseSwipeDismissProgressDetails = SwipeProgressDetailsInternal;

export interface UseSwipeDismissOptions {
  enabled: Accessor<boolean>;
  directions: Accessor<SwipeDirection[]>;
  elementRef: { readonly current: HTMLElement | null };
  movementCssVars: { x: string; y: string };
  /**
   * The minimum distance (in pixels) the pointer must travel from the initial swipe point
   * before the gesture is considered a dismiss.
   * @default 40
   */
  swipeThreshold?:
    | number
    | ((details: { element: HTMLElement; direction: SwipeDirection }) => number)
    | undefined;
  /**
   * If provided, swiping will only begin once this returns true.
   * The predicate is evaluated on start and on subsequent move events while the pointer is down.
   */
  canStart?:
    | ((position: { x: number; y: number }, details: UseSwipeDismissDetails) => boolean)
    | undefined;
  /**
   * If true, swiping won't start when the gesture begins within a scrollable element.
   * @default false
   */
  ignoreScrollableAncestors?: boolean | undefined;
  /**
   * If false, touch interactions can start swiping on interactive elements
   * that are ignored during pointer swipes.
   * @default true
   */
  ignoreSelectorWhenTouch?: boolean | undefined;
  /**
   * Whether to apply drag transform and movement styles to the element imperatively during a swipe.
   * @default true
   */
  trackDrag?: boolean | undefined;
  onSwipeStart?: ((event: PointerEvent | TouchEvent) => void) | undefined;
  onProgress?: ((progress: number, details?: UseSwipeDismissProgressDetails) => void) | undefined;
  onCancel?: ((event: PointerEvent | TouchEvent) => void) | undefined;
  onSwipingChange?: ((swiping: boolean) => void) | undefined;
  onRelease?:
    | ((details: {
        event: PointerEvent | TouchEvent;
        direction: SwipeDirection | undefined;
        deltaX: number;
        deltaY: number;
        velocityX: number;
        velocityY: number;
        releaseVelocityX: number;
        releaseVelocityY: number;
      }) => boolean | void)
    | undefined;
  onDismiss?:
    | ((event: PointerEvent | TouchEvent, details: { direction: SwipeDirection }) => void)
    | undefined;
}

export interface UseSwipeDismissReturnValue {
  swiping: Accessor<boolean>;
  swipeDirection: Accessor<SwipeDirection | undefined>;
  dragDismissed: Accessor<boolean>;
  getPointerProps: () => {
    onPointerDown?: ((event: PointerEvent) => void) | undefined;
    onPointerMove?: ((event: PointerEvent) => void) | undefined;
    onPointerUp?: ((event: PointerEvent) => void) | undefined;
    onPointerCancel?: ((event: PointerEvent) => void) | undefined;
  };
  getTouchProps: () => {
    onTouchStart?: ((event: TouchEvent) => void) | undefined;
    onTouchMove?: ((event: TouchEvent) => void) | undefined;
    onTouchEnd?: ((event: TouchEvent) => void) | undefined;
    onTouchCancel?: ((event: TouchEvent) => void) | undefined;
  };
  moveNative: (nativeEvent: TouchEvent, currentTarget: HTMLElement) => void;
  getDragStyles: () => JSX.CSSProperties;
  reset: () => void;
}

export function useSwipeDismiss(options: UseSwipeDismissOptions): UseSwipeDismissReturnValue {
  const {
    enabled,
    directions,
    elementRef,
    movementCssVars,
    canStart,
    ignoreSelectorWhenTouch = true,
    ignoreScrollableAncestors = false,
    swipeThreshold: swipeThresholdProp,
    onDismiss,
    onProgress,
    onCancel,
    onSwipeStart,
    onRelease,
    onSwipingChange,
    trackDrag = true,
  } = options;

  const ignoreSelector = DEFAULT_IGNORE_SELECTOR;

  const swipeThresholdDefault = Math.max(
    0,
    typeof swipeThresholdProp === 'number' ? swipeThresholdProp : DEFAULT_SWIPE_THRESHOLD,
  );

  function getDirectionFlags() {
    const dirs = directions();
    return {
      dirs,
      primaryDirection: dirs.length === 1 ? dirs[0] : undefined,
      allowLeft: dirs.includes('left'),
      allowRight: dirs.includes('right'),
      allowUp: dirs.includes('up'),
      allowDown: dirs.includes('down'),
    };
  }

  function getScrollAxes(): ScrollAxis[] {
    const { allowUp, allowDown, allowLeft, allowRight } = getDirectionFlags();
    const hasVertical = allowUp || allowDown;
    const hasHorizontal = allowLeft || allowRight;
    const axes: ScrollAxis[] = [];
    if (hasVertical) {
      axes.push('vertical');
    }
    if (hasHorizontal) {
      axes.push('horizontal');
    }
    return axes;
  }

  const [currentSwipeDirection, setCurrentSwipeDirection] = createSignal<
    SwipeDirection | undefined
  >(undefined);
  const [isSwiping, setIsSwiping] = createSignal(false);
  const [dragDismissed, setDragDismissed] = createSignal(false);

  let dragStartPos = { x: 0, y: 0 };
  let dragOffset = { x: 0, y: 0 };
  let lastMovePos: { x: number; y: number } | null = null;
  let initialTransform = { x: 0, y: 0, scale: 1 };
  let intendedSwipeDirection: SwipeDirection | undefined;
  let maxSwipeDisplacement = 0;
  let cancelledSwipe = false;
  let swipeCancelBaseline = { x: 0, y: 0 };
  let lockedDirection: 'horizontal' | 'vertical' | null = null;
  let isFirstPointerMove = false;
  let pendingSwipe = false;
  let pendingSwipeStartPos: { x: number; y: number } | null = null;
  let swipeFromScrollable = false;
  let sawPrimaryButtonsOnMove = false;
  let elementSize = { width: 0, height: 0 };
  let swipeProgress = 0;
  let swipeThresholdCurrent = swipeThresholdDefault;
  let swipeStartTime: number | null = null;
  let lastDragSample: { x: number; y: number; time: number } | null = null;
  let lastDragVelocity = { x: 0, y: 0 };
  let lastProgressDetails: SwipeProgressDetailsInternal | null = null;
  let isSwipingCurrent = false;
  let dragStyleSnapshot: [string, string] | null = null;

  function setSwiping(nextSwiping: boolean) {
    if (isSwipingCurrent === nextSwiping) {
      return;
    }

    isSwipingCurrent = nextSwiping;
    setIsSwiping(nextSwiping);
    onSwipingChange?.(nextSwiping);
  }

  function resolveSwipeThreshold(direction: SwipeDirection | undefined) {
    if (!direction) {
      return;
    }

    if (typeof swipeThresholdProp !== 'function') {
      swipeThresholdCurrent = swipeThresholdDefault;
      return;
    }

    const element = elementRef.current;
    if (!element) {
      return;
    }

    const value = swipeThresholdProp({ element, direction });

    swipeThresholdCurrent = Math.max(0, value);
  }

  function updateSwipeProgress(progress: number, details?: SwipeProgressDetailsInternal) {
    const nextProgress = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
    const progressChanged = nextProgress !== swipeProgress;
    let detailsChanged = false;

    if (details) {
      const lastDetails = lastProgressDetails;

      detailsChanged =
        !lastDetails ||
        lastDetails.deltaX !== details.deltaX ||
        lastDetails.deltaY !== details.deltaY ||
        lastDetails.direction !== details.direction;
    }

    if (!progressChanged && !detailsChanged) {
      return;
    }

    swipeProgress = nextProgress;
    if (details) {
      lastProgressDetails = details;
    } else if (progressChanged) {
      lastProgressDetails = null;
    }
    onProgress?.(nextProgress, details);
  }

  function syncDragStyles(swiping: boolean) {
    const element = elementRef.current;
    if (!trackDrag || !element) {
      if (!swiping) {
        dragStyleSnapshot = null;
      }
      return;
    }

    const style = element.style;
    if (swiping) {
      if (!dragStyleSnapshot) {
        dragStyleSnapshot = [style.transition, style.transform];
      }

      style.transition = 'none';
    } else if (dragStyleSnapshot) {
      [style.transition, style.transform] = dragStyleSnapshot;
      dragStyleSnapshot = null;
    }

    const deltaX = dragOffset.x - initialTransform.x;
    const deltaY = dragOffset.y - initialTransform.y;

    if (swiping) {
      style.transform = getDragTransform(dragOffset, initialTransform.scale);
    }

    style.setProperty(movementCssVars.x, `${deltaX}px`);
    style.setProperty(movementCssVars.y, `${deltaY}px`);
  }

  function recordDragSample(offset: { x: number; y: number }, timeStamp: number | null) {
    if (timeStamp === null) {
      return;
    }

    const lastSample = lastDragSample;
    if (lastSample && timeStamp > lastSample.time) {
      const durationMs = Math.max(timeStamp - lastSample.time, MIN_RELEASE_VELOCITY_DURATION_MS);

      lastDragVelocity = {
        x: (offset.x - lastSample.x) / durationMs,
        y: (offset.y - lastSample.y) / durationMs,
      };
    }

    lastDragSample = { x: offset.x, y: offset.y, time: timeStamp };
  }

  function reset() {
    setCurrentSwipeDirection(undefined);
    setSwiping(false);
    setDragDismissed(false);
    updateSwipeProgress(0);

    swipeThresholdCurrent = swipeThresholdDefault;
    dragStartPos = { x: 0, y: 0 };
    dragOffset = { x: 0, y: 0 };
    initialTransform = { x: 0, y: 0, scale: 1 };
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;
    cancelledSwipe = false;
    swipeCancelBaseline = { x: 0, y: 0 };
    lockedDirection = null;
    isFirstPointerMove = false;
    lastMovePos = null;
    pendingSwipe = false;
    pendingSwipeStartPos = null;
    swipeFromScrollable = false;
    sawPrimaryButtonsOnMove = false;
    elementSize = { width: 0, height: 0 };
    swipeStartTime = null;
    lastDragSample = null;
    lastDragVelocity = { x: 0, y: 0 };
    lastProgressDetails = null;
    syncDragStyles(false);
  }

  function getPrimaryPointerPosition(event: SwipeDismissStartEvent | SwipeDismissMoveEvent | SwipeDismissEndEvent) {
    if ('touches' in event) {
      const touch = event.touches[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : null;
    }

    return { x: event.clientX, y: event.clientY };
  }

  function isTouchLikeEvent(event: SwipeDismissStartEvent | SwipeDismissMoveEvent | SwipeDismissEndEvent) {
    if ('touches' in event) {
      return true;
    }
    return event.pointerType === 'touch';
  }

  function getTargetAtPoint(position: { x: number; y: number }, nativeEvent: Event) {
    const doc = ownerDocument(elementRef.current);
    const elementAtPoint = getElementAtPoint(doc, position.x, position.y);
    const target = elementAtPoint ?? getTarget(nativeEvent);
    return target as HTMLElement | null;
  }

  function findGestureScrollableTouchTarget(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
    const { allowUp, allowDown, allowLeft, allowRight } = getDirectionFlags();
    const hasVertical = allowUp || allowDown;
    const hasHorizontal = allowLeft || allowRight;

    if (hasHorizontal && !hasVertical) {
      return findScrollableTouchTarget(target, root, 'horizontal');
    }

    if (hasVertical && !hasHorizontal) {
      return findScrollableTouchTarget(target, root, 'vertical');
    }

    return (
      findScrollableTouchTarget(target, root, 'vertical') ??
      findScrollableTouchTarget(target, root, 'horizontal')
    );
  }

  function startSwipeAtPosition(
    event: SwipeDismissStartEvent | SwipeDismissMoveEvent,
    position: { x: number; y: number },
    startOptions?: {
      ignoreScrollableTarget?: boolean | undefined;
      ignoreScrollableAncestors?: boolean | undefined;
    },
  ) {
    swipeFromScrollable = false;
    const touchLike = isTouchLikeEvent(event);
    const target = getTargetAtPoint(position, event as unknown as Event);

    const doc = ownerDocument(elementRef.current);
    const body = doc.body;

    const scrollableTarget = touchLike && body ? findGestureScrollableTouchTarget(target, body) : null;
    const ignoreScrollableTarget = startOptions?.ignoreScrollableTarget ?? false;
    if (scrollableTarget && !ignoreScrollableTarget) {
      return false;
    }
    swipeFromScrollable = Boolean(scrollableTarget && ignoreScrollableTarget);

    const isInteractiveElement = target ? target.closest(ignoreSelector) : false;
    if (isInteractiveElement && (!touchLike || ignoreSelectorWhenTouch)) {
      return false;
    }

    const { primaryDirection } = getDirectionFlags();
    const element = elementRef.current;
    if (ignoreScrollableAncestors && element && target && getScrollAxes().length > 0) {
      const ignoreAncestors = startOptions?.ignoreScrollableAncestors ?? false;
      if (!ignoreAncestors && hasScrollableAncestor(target, element, getScrollAxes())) {
        return false;
      }
    }

    cancelledSwipe = false;
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;

    dragStartPos = position;
    swipeStartTime = getValidTimeStamp(event.timeStamp);
    swipeCancelBaseline = position;
    lastMovePos = position;

    if (element) {
      elementSize = { width: element.offsetWidth, height: element.offsetHeight };
      resolveSwipeThreshold(primaryDirection);
      const transform = getElementTransform(element);

      initialTransform = transform;
      dragOffset = { x: transform.x, y: transform.y };
      recordDragSample({ x: transform.x, y: transform.y }, swipeStartTime);

      if (!('touches' in event)) {
        safelyChangePointerCapture(element, event.pointerId, 'setPointerCapture');
      }
    }

    onSwipeStart?.(event as PointerEvent | TouchEvent);

    setSwiping(true);
    lockedDirection = null;
    isFirstPointerMove = true;
    updateSwipeProgress(0);
    syncDragStyles(true);

    return true;
  }

  function resetPendingSwipeState() {
    clearPendingSwipeStartState();
    swipeFromScrollable = false;
    lastMovePos = null;
  }

  function clearPendingSwipeStartState() {
    pendingSwipe = false;
    pendingSwipeStartPos = null;
  }

  function cancelSwipeInteraction(event: PointerEvent) {
    resetPendingSwipeState();

    if (!isSwipingCurrent) {
      return;
    }

    setSwiping(false);
    lockedDirection = null;

    const resolvedInitialTransform = initialTransform;

    dragOffset = { x: resolvedInitialTransform.x, y: resolvedInitialTransform.y };
    setCurrentSwipeDirection(undefined);
    sawPrimaryButtonsOnMove = false;
    syncDragStyles(false);

    const element = elementRef.current;
    if (element) {
      safelyChangePointerCapture(element, event.pointerId, 'releasePointerCapture');
    }

    updateSwipeProgress(0, {
      deltaX: 0,
      deltaY: 0,
      direction: undefined,
    });

    onCancel?.(event);
  }

  function applyDirectionalDamping(deltaX: number, deltaY: number) {
    const { allowUp, allowDown, allowLeft, allowRight } = getDirectionFlags();
    const hasVertical = allowUp || allowDown;
    const hasHorizontal = allowLeft || allowRight;
    const exponent = (value: number) => (value >= 0 ? value ** 0.5 : -(Math.abs(value) ** 0.5));
    const dampAxis = (delta: number, allowNegative: boolean, allowPositive: boolean) => {
      if (!allowNegative && delta < 0) {
        return exponent(delta);
      }
      if (!allowPositive && delta > 0) {
        return exponent(delta);
      }
      return delta;
    };

    const newDeltaX = hasHorizontal ? dampAxis(deltaX, allowLeft, allowRight) : exponent(deltaX);
    const newDeltaY = hasVertical ? dampAxis(deltaY, allowUp, allowDown) : exponent(deltaY);

    return { x: newDeltaX, y: newDeltaY };
  }

  function canSwipeFromScrollEdgeOnPendingMove(
    scrollTarget: HTMLElement,
    deltaX: number,
    deltaY: number,
  ): boolean | null {
    const { allowUp, allowDown, allowLeft, allowRight } = getDirectionFlags();
    const hasVertical = allowUp || allowDown;
    const hasHorizontal = allowLeft || allowRight;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    const useVerticalAxis = hasVertical && deltaY !== 0 && (!hasHorizontal || absDeltaY >= absDeltaX);

    if (useVerticalAxis) {
      const maxScrollTop = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
      const atTop = scrollTarget.scrollTop <= 0;
      const atBottom = scrollTarget.scrollTop >= maxScrollTop;
      const movingDown = deltaY > 0;
      const movingUp = deltaY < 0;
      const canSwipeDown = movingDown && atTop && allowDown;
      const canSwipeUp = movingUp && atBottom && allowUp;
      return canSwipeDown || canSwipeUp;
    }

    const useHorizontalAxis = hasHorizontal && deltaX !== 0 && (!hasVertical || absDeltaX > absDeltaY);
    if (useHorizontalAxis) {
      const maxScrollLeft = Math.max(0, scrollTarget.scrollWidth - scrollTarget.clientWidth);
      const atLeft = scrollTarget.scrollLeft <= 0;
      const atRight = scrollTarget.scrollLeft >= maxScrollLeft;
      const movingRight = deltaX > 0;
      const movingLeft = deltaX < 0;
      const canSwipeRight = movingRight && atLeft && allowRight;
      const canSwipeLeft = movingLeft && atRight && allowLeft;
      return canSwipeRight || canSwipeLeft;
    }

    return null;
  }

  function handleStart(event: SwipeDismissStartEvent) {
    if (!enabled()) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (!('touches' in event) && event.button !== 0) {
      return;
    }

    const startPos = getPrimaryPointerPosition(event);
    if (!startPos) {
      return;
    }

    pendingSwipe = true;
    pendingSwipeStartPos = startPos;
    swipeFromScrollable = false;
    sawPrimaryButtonsOnMove = !('touches' in event);

    const { primaryDirection } = getDirectionFlags();
    const allowedToStart = canStart
      ? canStart(startPos, { nativeEvent: event as PointerEvent | TouchEvent, direction: primaryDirection })
      : true;
    if (!allowedToStart) {
      return;
    }

    if (startSwipeAtPosition(event, startPos)) {
      clearPendingSwipeStartState();
    }
  }

  function handleMoveCore(
    event: SwipeDismissMoveEvent,
    position: { x: number; y: number },
    movement: { x: number; y: number },
  ) {
    if (!enabled() || !isSwipingCurrent) {
      return;
    }

    const { allowUp, allowDown, allowLeft, allowRight, primaryDirection } = getDirectionFlags();
    const hasVertical = allowUp || allowDown;
    const hasHorizontal = allowLeft || allowRight;

    const target = getTarget(event as unknown as Event) as HTMLElement | null;
    if (isTouchLikeEvent(event) && !swipeFromScrollable) {
      const boundaryElement = event.currentTarget as HTMLElement;
      if (findGestureScrollableTouchTarget(target, boundaryElement)) {
        return;
      }
    }

    if (!('touches' in event)) {
      // Prevent text selection on Safari
      event.preventDefault();
    }

    if (isFirstPointerMove) {
      isFirstPointerMove = false;
      // Reset the drag origin to the first move's position to absorb the gap between the press and
      // the first move event — notably on iOS touch, where the first `touchmove` arrives already
      // offset from the `touchstart` — which would otherwise make the dragged element jump. This
      // only matters when an element follows the pointer; when `trackDrag` is false (e.g. the
      // swipe-area, which only opens the drawer) keep the original press position so a quick flick
      // still registers.
      if (trackDrag) {
        dragStartPos = position;
        const moveTime = getValidTimeStamp(event.timeStamp);
        if (moveTime !== null) {
          swipeStartTime = moveTime;
        }
      }
    }

    const clientX = position.x;
    const clientY = position.y;
    const movementX = movement.x;
    const movementY = movement.y;

    if (
      (movementY < 0 && clientY > swipeCancelBaseline.y) ||
      (movementY > 0 && clientY < swipeCancelBaseline.y)
    ) {
      swipeCancelBaseline = { x: swipeCancelBaseline.x, y: clientY };
    }

    if (
      (movementX < 0 && clientX > swipeCancelBaseline.x) ||
      (movementX > 0 && clientX < swipeCancelBaseline.x)
    ) {
      swipeCancelBaseline = { x: clientX, y: swipeCancelBaseline.y };
    }

    const deltaX = clientX - dragStartPos.x;
    const deltaY = clientY - dragStartPos.y;
    const cancelDeltaY = clientY - swipeCancelBaseline.y;
    const cancelDeltaX = clientX - swipeCancelBaseline.x;

    if (lockedDirection === null && hasHorizontal && hasVertical) {
      const movementDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (movementDistance >= MIN_DRAG_THRESHOLD) {
        lockedDirection = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
    }

    let candidate: SwipeDirection | undefined;
    if (!intendedSwipeDirection) {
      if (lockedDirection === 'vertical') {
        if (deltaY > 0) {
          candidate = 'down';
        } else if (deltaY < 0) {
          candidate = 'up';
        }
      } else if (lockedDirection === 'horizontal') {
        if (deltaX > 0) {
          candidate = 'right';
        } else if (deltaX < 0) {
          candidate = 'left';
        }
      } else if (Math.abs(deltaX) >= Math.abs(deltaY)) {
        candidate = deltaX > 0 ? 'right' : 'left';
      } else {
        candidate = deltaY > 0 ? 'down' : 'up';
      }

      if (candidate) {
        const isAllowed =
          (candidate === 'left' && allowLeft) ||
          (candidate === 'right' && allowRight) ||
          (candidate === 'up' && allowUp) ||
          (candidate === 'down' && allowDown);
        if (isAllowed) {
          intendedSwipeDirection = candidate;
          maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
          setCurrentSwipeDirection(candidate);
          resolveSwipeThreshold(candidate);
        }
      }
    } else {
      const direction = intendedSwipeDirection;
      const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);
      if (currentDisplacement > swipeThresholdCurrent) {
        cancelledSwipe = false;
        setCurrentSwipeDirection(direction);
      } else if (
        !(allowLeft && allowRight) &&
        !(allowUp && allowDown) &&
        maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
      ) {
        // Mark that a change-of-mind has occurred
        cancelledSwipe = true;
      }
    }

    const dampedDelta = applyDirectionalDamping(deltaX, deltaY);
    let newOffsetX = initialTransform.x;
    let newOffsetY = initialTransform.y;

    if (lockedDirection === 'horizontal') {
      if (hasHorizontal) {
        newOffsetX += dampedDelta.x;
      }
    } else if (lockedDirection === 'vertical') {
      if (hasVertical) {
        newOffsetY += dampedDelta.y;
      }
    } else {
      if (hasHorizontal) {
        newOffsetX += dampedDelta.x;
      }
      if (hasVertical) {
        newOffsetY += dampedDelta.y;
      }
    }

    dragOffset = { x: newOffsetX, y: newOffsetY };
    syncDragStyles(true);
    recordDragSample({ x: newOffsetX, y: newOffsetY }, getValidTimeStamp(event.timeStamp));
    const dragDeltaX = newOffsetX - initialTransform.x;
    const dragDeltaY = newOffsetY - initialTransform.y;
    const swipeDirectionDetails = intendedSwipeDirection;

    const progressDirection = primaryDirection ?? intendedSwipeDirection;
    if (!progressDirection) {
      updateSwipeProgress(0, { deltaX: dragDeltaX, deltaY: dragDeltaY, direction: swipeDirectionDetails });
      return;
    }

    const size =
      progressDirection === 'left' || progressDirection === 'right'
        ? elementSize.width
        : elementSize.height;
    const scale = initialTransform.scale || 1;
    if (size <= 0 || scale <= 0) {
      updateSwipeProgress(0, { deltaX: dragDeltaX, deltaY: dragDeltaY, direction: swipeDirectionDetails });
      return;
    }

    const progressDisplacement = getDisplacement(
      progressDirection,
      newOffsetX - initialTransform.x,
      newOffsetY - initialTransform.y,
    );
    if (progressDisplacement <= 0) {
      updateSwipeProgress(0, { deltaX: dragDeltaX, deltaY: dragDeltaY, direction: swipeDirectionDetails });
      return;
    }

    updateSwipeProgress(progressDisplacement / (size * scale), {
      deltaX: dragDeltaX,
      deltaY: dragDeltaY,
      direction: swipeDirectionDetails,
    });
  }

  function handleEnd(event: SwipeDismissEndEvent) {
    if (!enabled()) {
      return;
    }

    const { dirs: directionsList, primaryDirection } = getDirectionFlags();
    const resolvedDragOffset = dragOffset;
    const resolvedInitialTransform = initialTransform;
    const releaseDeltaX = resolvedDragOffset.x - resolvedInitialTransform.x;
    const releaseDeltaY = resolvedDragOffset.y - resolvedInitialTransform.y;
    const progressDetails: SwipeProgressDetailsInternal = {
      deltaX: releaseDeltaX,
      deltaY: releaseDeltaY,
      direction: intendedSwipeDirection,
    };

    if (!isSwipingCurrent) {
      resetPendingSwipeState();
      updateSwipeProgress(0, progressDetails);
      return;
    }

    setSwiping(false);
    lockedDirection = null;
    resetPendingSwipeState();
    sawPrimaryButtonsOnMove = false;

    const element = elementRef.current;
    if (element && !('touches' in event)) {
      safelyChangePointerCapture(element, event.pointerId, 'releasePointerCapture');
    }

    const deltaX = releaseDeltaX;
    const deltaY = releaseDeltaY;
    const startTime = swipeStartTime;
    const endTime = getValidTimeStamp(event.timeStamp);
    const durationMs = startTime !== null && endTime !== null && endTime > startTime ? endTime - startTime : 0;
    const velocityDurationMs = durationMs > 0 ? Math.max(durationMs, MIN_VELOCITY_DURATION_MS) : 0;
    const velocityX = velocityDurationMs > 0 ? deltaX / velocityDurationMs : 0;
    const velocityY = velocityDurationMs > 0 ? deltaY / velocityDurationMs : 0;
    let releaseVelocityX = lastDragVelocity.x;
    let releaseVelocityY = lastDragVelocity.y;
    const lastSample = lastDragSample;
    if (lastSample && endTime !== null && endTime >= lastSample.time) {
      const ageMs = endTime - lastSample.time;
      if (ageMs <= MAX_RELEASE_VELOCITY_AGE_MS) {
        const sampleDurationMs = Math.max(ageMs, MIN_RELEASE_VELOCITY_DURATION_MS);
        const deltaFromLastSampleX = resolvedDragOffset.x - lastSample.x;
        const deltaFromLastSampleY = resolvedDragOffset.y - lastSample.y;
        const sampleVelocityX = deltaFromLastSampleX / sampleDurationMs;
        const sampleVelocityY = deltaFromLastSampleY / sampleDurationMs;
        if (sampleVelocityX !== 0) {
          releaseVelocityX = sampleVelocityX;
        }
        if (sampleVelocityY !== 0) {
          releaseVelocityY = sampleVelocityY;
        }
      } else {
        releaseVelocityX = 0;
        releaseVelocityY = 0;
      }
    }

    const releaseDecision = onRelease?.({
      event: event as PointerEvent | TouchEvent,
      direction: intendedSwipeDirection,
      deltaX,
      deltaY,
      velocityX,
      velocityY,
      releaseVelocityX,
      releaseVelocityY,
    });
    const hasReleaseDecision = typeof releaseDecision === 'boolean';

    if (cancelledSwipe && !hasReleaseDecision) {
      dragOffset = { x: resolvedInitialTransform.x, y: resolvedInitialTransform.y };
      setCurrentSwipeDirection(undefined);
      syncDragStyles(false);
      updateSwipeProgress(0, progressDetails);
      return;
    }

    let shouldClose = false;
    let dismissDirection: SwipeDirection | undefined;

    if (hasReleaseDecision) {
      shouldClose = releaseDecision as boolean;
      dismissDirection = intendedSwipeDirection ?? primaryDirection;
    } else {
      for (const direction of directionsList) {
        switch (direction) {
          case 'right':
            if (deltaX > swipeThresholdCurrent) {
              shouldClose = true;
              dismissDirection = 'right';
            }
            break;
          case 'left':
            if (deltaX < -swipeThresholdCurrent) {
              shouldClose = true;
              dismissDirection = 'left';
            }
            break;
          case 'down':
            if (deltaY > swipeThresholdCurrent) {
              shouldClose = true;
              dismissDirection = 'down';
            }
            break;
          case 'up':
            if (deltaY < -swipeThresholdCurrent) {
              shouldClose = true;
              dismissDirection = 'up';
            }
            break;
          default:
            break;
        }
        if (shouldClose) {
          break;
        }
      }
    }

    if (shouldClose && dismissDirection) {
      setCurrentSwipeDirection(dismissDirection);
      setDragDismissed(true);
      syncDragStyles(false);
      onDismiss?.(event as PointerEvent | TouchEvent, { direction: dismissDirection });
    } else {
      dragOffset = { x: resolvedInitialTransform.x, y: resolvedInitialTransform.y };
      setCurrentSwipeDirection(undefined);
      syncDragStyles(false);
      updateSwipeProgress(0, progressDetails);
    }
  }

  function handleMove(event: SwipeDismissMoveEvent) {
    const currentPos = getPrimaryPointerPosition(event);
    if (!currentPos) {
      return;
    }

    let endAfterMove = false;

    if (!('touches' in event)) {
      const hasPrimaryButton = hasPrimaryMouseButton(event.buttons);
      if (hasPrimaryButton) {
        sawPrimaryButtonsOnMove = true;
      }

      // Cancel the swipe if a non-primary button takes over the interaction.
      if (event.buttons !== 0 && !hasPrimaryButton) {
        cancelSwipeInteraction(event);
        return;
      }

      // A `buttons: 0` pointermove means the primary button was already released, so the gesture is
      // over even if no pointerup reached us. Treat it as the release instead of cancelling.
      if (event.buttons === 0 && sawPrimaryButtonsOnMove) {
        if (!isSwipingCurrent) {
          handleEnd(event);
          return;
        }
        endAfterMove = true;
      }
    }

    if (!isSwiping() && pendingSwipe) {
      if (!isTouchLikeEvent(event) && event.defaultPrevented) {
        resetPendingSwipeState();
        return;
      }

      const { primaryDirection } = getDirectionFlags();
      const allowedToStart = canStart
        ? canStart(currentPos, { nativeEvent: event as PointerEvent | TouchEvent, direction: primaryDirection })
        : true;

      if (allowedToStart) {
        const pendingStartPos = pendingSwipeStartPos;
        let ignoreScrollableOnStart = false;
        if (isTouchLikeEvent(event)) {
          const element = elementRef.current;
          if (pendingStartPos && element) {
            const target = getTargetAtPoint(currentPos, event as unknown as Event);
            const doc = ownerDocument(element);
            const body = doc.body;
            const scrollTarget = body ? findGestureScrollableTouchTarget(target, body) : null;

            if (scrollTarget && (contains(element, scrollTarget) || contains(scrollTarget, element))) {
              const deltaX = currentPos.x - pendingStartPos.x;
              const deltaY = currentPos.y - pendingStartPos.y;
              const canSwipeFromEdge = canSwipeFromScrollEdgeOnPendingMove(scrollTarget, deltaX, deltaY);

              if (canSwipeFromEdge === false) {
                return;
              }

              if (canSwipeFromEdge === true) {
                ignoreScrollableOnStart = true;
              }
            }
          }
        }

        const started = startSwipeAtPosition(event, currentPos, {
          ignoreScrollableTarget: ignoreScrollableOnStart,
          ignoreScrollableAncestors: ignoreScrollableOnStart,
        });
        if (started) {
          if (pendingStartPos && ignoreScrollableOnStart) {
            clearPendingSwipeStartState();
            dragStartPos = pendingStartPos;
            swipeCancelBaseline = pendingStartPos;
            lastMovePos = pendingStartPos;
            isFirstPointerMove = false;
          } else {
            clearPendingSwipeStartState();
            swipeFromScrollable = false;
          }
        }
      }
    }

    const previousPos = lastMovePos;
    const movement =
      previousPos === null ? { x: 0, y: 0 } : { x: currentPos.x - previousPos.x, y: currentPos.y - previousPos.y };

    lastMovePos = currentPos;
    handleMoveCore(event, currentPos, movement);

    if (endAfterMove && !('touches' in event)) {
      handleEnd(event);
    }
  }

  // Feeds a native touchmove into the swipe pipeline. Used by consumers that claim the gesture
  // in a capture-phase listener and stop it from reaching Solid's delegated touch handlers.
  function moveNative(nativeEvent: TouchEvent, currentTarget: HTMLElement) {
    handleMove({
      touches: nativeEvent.touches,
      currentTarget,
      defaultPrevented: nativeEvent.defaultPrevented,
      timeStamp: nativeEvent.timeStamp,
    });
  }

  function getDragStyles(): JSX.CSSProperties {
    // Read `isSwipingCurrent`, not the lagging `isSwiping()` signal, to match the imperative writer
    // `syncDragStyles`. Otherwise a read that happens before `setSwiping(true)` commits observes the
    // transform it just wrote as stripped, flashing the popup to its resting position for a frame.
    const swiping = isSwipingCurrent;
    const deltaX = dragOffset.x - initialTransform.x;
    const deltaY = dragOffset.y - initialTransform.y;

    if (!swiping && deltaX === 0 && deltaY === 0 && !dragDismissed()) {
      return {
        [movementCssVars.x]: '0px',
        [movementCssVars.y]: '0px',
      } as JSX.CSSProperties;
    }

    return {
      transition: swiping ? 'none' : undefined,
      transform: swiping ? getDragTransform(dragOffset, initialTransform.scale) : undefined,
      [movementCssVars.x]: `${deltaX}px`,
      [movementCssVars.y]: `${deltaY}px`,
    } as JSX.CSSProperties;
  }

  function getPointerProps() {
    if (!enabled()) {
      return {};
    }

    return {
      onPointerDown: handleStart,
      onPointerMove: handleMove,
      onPointerUp: handleEnd,
      onPointerCancel: handleEnd,
    };
  }

  function getTouchProps() {
    if (!enabled()) {
      return {};
    }

    return {
      onTouchStart: handleStart,
      onTouchMove: handleMove,
      onTouchEnd: handleEnd,
      onTouchCancel: handleEnd,
    };
  }

  return {
    swiping: isSwiping,
    swipeDirection: currentSwipeDirection,
    dragDismissed,
    getPointerProps,
    getTouchProps,
    moveNative,
    getDragStyles,
    reset,
  };
}
