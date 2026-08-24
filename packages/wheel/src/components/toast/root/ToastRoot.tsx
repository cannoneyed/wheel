/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createSignal, createEffect, onCleanup, onMount, splitProps, type JSX } from 'solid-js';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerDocument } from '../../base-utils/owner';
import { inertValue } from '../../base-utils/inertValue';
import { activeElement, contains, getTarget } from '../../floating-ui-solid';
import type { BaseUIComponentProps } from '../../internals/types';
import type { ToastObject as ToastObjectType } from '../useToastManager';
import { ToastRootContext } from './ToastRootContext';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { useToastProviderContext } from '../provider/ToastProviderContext';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { renderElement } from '../../internals/renderElement';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { ToastRootCssVars } from './ToastRootCssVars';
import {
  BASE_UI_SWIPE_IGNORE_SELECTOR,
  LEGACY_SWIPE_IGNORE_SELECTOR,
} from '../../internals/constants';
import { getDisplacement, getElementTransform, type SwipeDirection } from '../utils/swipe';

const stateAttributesMapping: StateAttributesMapping<ToastRootState> = {
  ...transitionStatusMapping,
  swipeDirection(value) {
    return value ? { 'data-swipe-direction': value } : null;
  },
};

const SWIPE_THRESHOLD = 40;
const REVERSE_CANCEL_THRESHOLD = 10;
const OPPOSITE_DIRECTION_DAMPING_FACTOR = 0.5;
const MIN_DRAG_THRESHOLD = 1;
const TOAST_SWIPE_IGNORE_SELECTOR = `${BASE_UI_SWIPE_IGNORE_SELECTOR},${LEGACY_SWIPE_IGNORE_SELECTOR}`;

/**
 * Groups all parts of an individual toast.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastRoot(componentProps: ToastRoot.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'toast',
    'swipeDirection',
  ]);

  const isAnchored = () => local.toast.positionerProps?.anchor !== undefined;

  const swipeDirections = (): SwipeDirection[] => {
    if (isAnchored()) {
      return [];
    }
    const swipeDirectionProp = local.swipeDirection ?? ['down', 'right'];
    return Array.isArray(swipeDirectionProp) ? swipeDirectionProp : [swipeDirectionProp];
  };

  const swipeEnabled = () => swipeDirections().length > 0;

  const store = useToastProviderContext();

  const [currentSwipeDirection, setCurrentSwipeDirection] = createSignal<SwipeDirection | undefined>(
    undefined,
  );
  const [isSwiping, setIsSwiping] = createSignal(false);
  const [isRealSwipe, setIsRealSwipe] = createSignal(false);
  const [dragDismissed, setDragDismissed] = createSignal(false);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
  const [initialTransform, setInitialTransform] = createSignal({ x: 0, y: 0, scale: 1 });
  const [titleId, setTitleId] = createSignal<string | undefined>(undefined);
  const [descriptionId, setDescriptionId] = createSignal<string | undefined>(undefined);
  const [lockedDirection, setLockedDirection] = createSignal<'horizontal' | 'vertical' | null>(null);

  let rootRef: HTMLDivElement | undefined;
  let dragStartPos = { x: 0, y: 0 };
  let initialTransformSnapshot = { x: 0, y: 0, scale: 1 };
  let intendedSwipeDirection: SwipeDirection | undefined;
  let maxSwipeDisplacement = 0;
  let cancelledSwipe = false;
  let swipeCancelBaseline = { x: 0, y: 0 };
  let isFirstPointerMove = false;
  let dragOffsetSnapshot = { x: 0, y: 0 };
  let activePointerId: number | null = null;
  let dragAbortController: AbortController | null = null;

  const domIndex = store.useState('toastIndex', () => local.toast.id);
  const visibleIndex = store.useState('toastVisibleIndex', () => local.toast.id);
  const offsetY = store.useState('toastOffsetY', () => local.toast.id);
  const focused = store.useState('focused');
  const expanded = store.useState('expanded');

  createOpenChangeComplete({
    open: () => local.toast.transitionStatus !== 'ending',
    getElement: () => rootRef,
    onComplete() {
      if (local.toast.transitionStatus === 'ending') {
        store.removeToast(local.toast.id);
      }
    },
  });

  // Recalculates the natural height of the toast and updates it in the toast manager.
  // Deviation: upstream calls `ReactDOM.flushSync` here to avoid a visual flicker when invoked from
  // observer callbacks; Solid's store writes are already synchronous, so the `flushSync` parameter
  // is accepted (for call-site parity with `Toast.Content`) but has no effect.
  function recalculateHeight(_flushSync: boolean = false) {
    const element = rootRef;
    if (!element) {
      return;
    }

    const previousHeight = element.style.height;
    element.style.height = 'auto';

    const height = element.offsetHeight;

    element.style.height = previousHeight;

    store.updateToastInternal(local.toast.id, {
      ref: element,
      height,
      ...(local.toast.transitionStatus === 'starting' ? { transitionStatus: undefined } : {}),
    });
  }

  onMount(() => {
    recalculateHeight();
  });

  onCleanup(() => {
    dragAbortController?.abort();
  });

  function setResolvedDragOffset(nextDragOffset: { x: number; y: number }) {
    dragOffsetSnapshot = nextDragOffset;
    setDragOffset(nextDragOffset);
  }

  function applyDirectionalDamping(deltaX: number, deltaY: number) {
    let newDeltaX = deltaX;
    let newDeltaY = deltaY;

    const directions = swipeDirections();

    if (!directions.includes('left') && !directions.includes('right')) {
      newDeltaX =
        deltaX > 0
          ? deltaX ** OPPOSITE_DIRECTION_DAMPING_FACTOR
          : -(Math.abs(deltaX) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
    } else {
      if (!directions.includes('right') && deltaX > 0) {
        newDeltaX = deltaX ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
      }

      if (!directions.includes('left') && deltaX < 0) {
        newDeltaX = -(Math.abs(deltaX) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
      }
    }

    if (!directions.includes('up') && !directions.includes('down')) {
      newDeltaY =
        deltaY > 0
          ? deltaY ** OPPOSITE_DIRECTION_DAMPING_FACTOR
          : -(Math.abs(deltaY) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
    } else {
      if (!directions.includes('down') && deltaY > 0) {
        newDeltaY = deltaY ** OPPOSITE_DIRECTION_DAMPING_FACTOR;
      }

      if (!directions.includes('up') && deltaY < 0) {
        newDeltaY = -(Math.abs(deltaY) ** OPPOSITE_DIRECTION_DAMPING_FACTOR);
      }
    }

    return { x: newDeltaX, y: newDeltaY };
  }

  function handleSwipeEnd(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    activePointerId = null;
    dragAbortController?.abort();
    dragAbortController = null;
    setIsSwiping(false);
    setIsRealSwipe(false);
    setLockedDirection(null);

    const resolvedInitialTransform = initialTransformSnapshot;

    if (event.type === 'pointercancel' || cancelledSwipe) {
      setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
      setCurrentSwipeDirection(undefined);
      return;
    }

    let shouldClose = false;
    const resolvedDragOffset = dragOffsetSnapshot;
    const deltaX = resolvedDragOffset.x - resolvedInitialTransform.x;
    const deltaY = resolvedDragOffset.y - resolvedInitialTransform.y;
    let dismissDirection: SwipeDirection | undefined;

    for (const direction of swipeDirections()) {
      switch (direction) {
        case 'right':
          if (deltaX > SWIPE_THRESHOLD) {
            shouldClose = true;
            dismissDirection = 'right';
          }
          break;
        case 'left':
          if (deltaX < -SWIPE_THRESHOLD) {
            shouldClose = true;
            dismissDirection = 'left';
          }
          break;
        case 'down':
          if (deltaY > SWIPE_THRESHOLD) {
            shouldClose = true;
            dismissDirection = 'down';
          }
          break;
        case 'up':
          if (deltaY < -SWIPE_THRESHOLD) {
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

    if (shouldClose) {
      setCurrentSwipeDirection(dismissDirection);
      setDragDismissed(true);
      store.closeToast(local.toast.id);
    } else {
      setResolvedDragOffset({ x: resolvedInitialTransform.x, y: resolvedInitialTransform.y });
      setCurrentSwipeDirection(undefined);
    }
  }

  function handlePointerDown(event: PointerEvent) {
    if (event.button !== 0) {
      return;
    }

    if (event.pointerType === 'touch') {
      store.pauseTimers();
    }

    const target = getTarget(event) as HTMLElement | null;

    const isInteractiveElement = target
      ? target.closest(`button,a,input,textarea,[role="button"],${TOAST_SWIPE_IGNORE_SELECTOR}`)
      : false;

    if (isInteractiveElement) {
      return;
    }

    cancelledSwipe = false;
    intendedSwipeDirection = undefined;
    maxSwipeDisplacement = 0;
    activePointerId = event.pointerId;
    dragStartPos = { x: event.clientX, y: event.clientY };
    swipeCancelBaseline = dragStartPos;

    if (rootRef) {
      const transform = getElementTransform(rootRef);
      initialTransformSnapshot = transform;
      setInitialTransform(transform);
      setResolvedDragOffset({
        x: transform.x,
        y: transform.y,
      });
    }

    store.setHovering(true);
    setIsSwiping(true);
    setIsRealSwipe(false);
    setLockedDirection(null);
    isFirstPointerMove = true;

    const element = rootRef;
    if (element) {
      dragAbortController?.abort();
      const controller = new AbortController();
      dragAbortController = controller;

      const doc = ownerDocument(element);
      doc.addEventListener('pointerup', handleSwipeEnd, { signal: controller.signal });
      doc.addEventListener('pointercancel', handleSwipeEnd, { signal: controller.signal });

      element.setPointerCapture?.(event.pointerId);
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    // Prevent text selection on Safari
    event.preventDefault();

    if (isFirstPointerMove) {
      // Adjust the starting position to the current position on the first move
      // to account for the delay between pointerdown and the first pointermove on iOS.
      dragStartPos = { x: event.clientX, y: event.clientY };
      isFirstPointerMove = false;
    }

    const { clientY, clientX, movementX, movementY } = event;

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

    const directions = swipeDirections();

    if (!isRealSwipe()) {
      const movementDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (movementDistance >= MIN_DRAG_THRESHOLD) {
        setIsRealSwipe(true);
        if (lockedDirection() === null) {
          const hasHorizontal = directions.includes('left') || directions.includes('right');
          const hasVertical = directions.includes('up') || directions.includes('down');
          if (hasHorizontal && hasVertical) {
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            setLockedDirection(absX > absY ? 'horizontal' : 'vertical');
          }
        }
      }
    }

    let candidate: SwipeDirection | undefined;
    if (!intendedSwipeDirection) {
      const locked = lockedDirection();
      if (locked === 'vertical') {
        if (deltaY > 0) {
          candidate = 'down';
        } else if (deltaY < 0) {
          candidate = 'up';
        }
      } else if (locked === 'horizontal') {
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

      if (candidate && directions.includes(candidate)) {
        intendedSwipeDirection = candidate;
        maxSwipeDisplacement = getDisplacement(candidate, deltaX, deltaY);
        setCurrentSwipeDirection(candidate);
      }
    } else {
      const direction = intendedSwipeDirection;
      const currentDisplacement = getDisplacement(direction, cancelDeltaX, cancelDeltaY);

      if (currentDisplacement > SWIPE_THRESHOLD) {
        cancelledSwipe = false;
        setCurrentSwipeDirection(direction);
      } else if (
        !(directions.includes('left') && directions.includes('right')) &&
        !(directions.includes('up') && directions.includes('down')) &&
        maxSwipeDisplacement - currentDisplacement >= REVERSE_CANCEL_THRESHOLD
      ) {
        // Mark that a change-of-mind has occurred
        cancelledSwipe = true;
      }
    }

    const dampedDelta = applyDirectionalDamping(deltaX, deltaY);
    let newOffsetX = initialTransformSnapshot.x;
    let newOffsetY = initialTransformSnapshot.y;

    const locked = lockedDirection();
    if (locked === 'horizontal') {
      if (directions.includes('left') || directions.includes('right')) {
        newOffsetX += dampedDelta.x;
      }
    } else if (locked === 'vertical') {
      if (directions.includes('up') || directions.includes('down')) {
        newOffsetY += dampedDelta.y;
      }
    } else {
      if (directions.includes('left') || directions.includes('right')) {
        newOffsetX += dampedDelta.x;
      }

      if (directions.includes('up') || directions.includes('down')) {
        newOffsetY += dampedDelta.y;
      }
    }

    setResolvedDragOffset({ x: newOffsetX, y: newOffsetY });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (!rootRef || !contains(rootRef, activeElement(ownerDocument(rootRef)) as HTMLElement | null)) {
        return;
      }

      store.closeToast(local.toast.id);
    }
  }

  createEffect(() => {
    if (!swipeEnabled()) {
      return;
    }

    const element = rootRef;
    if (!element) {
      return;
    }

    function preventDefaultTouchStart(event: TouchEvent) {
      if (activePointerId === null || !contains(element, getTarget(event) as HTMLElement | null)) {
        return;
      }

      // Solid's pointermove preventDefault is not enough on iOS; this
      // non-passive touchmove listener blocks native scrolling while dragging.
      event.preventDefault();
    }

    onCleanup(addEventListener(element, 'touchmove', preventDefaultTouchStart, { passive: false }));
  });

  function getDragStyles(): JSX.CSSProperties {
    const offset = dragOffset();
    const initial = initialTransform();

    if (!isSwiping() && offset.x === initial.x && offset.y === initial.y && !dragDismissed()) {
      return {
        [ToastRootCssVars.swipeMovementX]: '0px',
        [ToastRootCssVars.swipeMovementY]: '0px',
      };
    }

    const deltaX = offset.x - initial.x;
    const deltaY = offset.y - initial.y;

    return {
      transition: isSwiping() ? 'none' : undefined,
      // While swiping, freeze the element at its current visual transform so it doesn't snap to the
      // end position.
      transform: isSwiping()
        ? `translateX(${offset.x}px) translateY(${offset.y}px) scale(${initial.scale})`
        : undefined,
      [ToastRootCssVars.swipeMovementX]: `${deltaX}px`,
      [ToastRootCssVars.swipeMovementY]: `${deltaY}px`,
    } as JSX.CSSProperties;
  }

  const isHighPriority = () => local.toast.priority === 'high';

  const toastRootContextValue: ToastRootContext = {
    get toast() {
      return local.toast;
    },
    getRootElement: () => rootRef,
    titleId,
    setTitleId,
    descriptionId,
    setDescriptionId,
    swiping: isSwiping,
    swipeDirection: currentSwipeDirection,
    recalculateHeight,
    index: domIndex,
    visibleIndex,
    expanded,
  };

  const state: ToastRootState = {
    get transitionStatus() {
      return local.toast.transitionStatus;
    },
    get expanded() {
      return expanded();
    },
    get limited() {
      return local.toast.limited || false;
    },
    get type() {
      return local.toast.type;
    },
    get swiping() {
      return isSwiping();
    },
    get swipeDirection() {
      return currentSwipeDirection();
    },
  };

  return (
    <ToastRootContext.Provider value={toastRootContextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Toast-Root',
        slot: 'toast-root',
        ref: (el: HTMLDivElement) => {
          rootRef = el;
        },
        state,
        stateAttributesMapping,
        props: [
          () => ({
            role: isHighPriority() ? 'alertdialog' : 'dialog',
            tabIndex: 0,
            'aria-modal': false,
            'aria-labelledby': titleId(),
            'aria-describedby': descriptionId(),
            'aria-hidden': isHighPriority() && !focused() ? true : undefined,
            onPointerDown: swipeEnabled() ? handlePointerDown : undefined,
            onPointerMove: swipeEnabled() ? handlePointerMove : undefined,
            onPointerUp: swipeEnabled() ? handleSwipeEnd : undefined,
            onPointerCancel: swipeEnabled() ? handleSwipeEnd : undefined,
            onKeyDown: handleKeyDown,
            inert: inertValue(local.toast.limited),
            style: {
              ...getDragStyles(),
              [ToastRootCssVars.index as string]:
                local.toast.transitionStatus === 'ending' ? domIndex() : visibleIndex(),
              [ToastRootCssVars.offsetY as string]: `${offsetY()}px`,
              [ToastRootCssVars.height as string]: local.toast.height
                ? `${local.toast.height}px`
                : undefined,
            },
          }),
          elementProps,
        ],
      })}
    </ToastRootContext.Provider>
  );
}

export type ToastRootToastObject<Data extends object = any> = ToastObjectType<Data>;

export interface ToastRootState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether the toasts in the viewport are expanded.
   */
  expanded: boolean;
  /**
   * Whether the toast was limited because the toast limit was exceeded.
   */
  limited: boolean;
  /**
   * The type of the toast.
   */
  type: string | undefined;
  /**
   * Whether the toast is being swiped.
   */
  swiping: boolean;
  /**
   * The direction the toast is being swiped.
   */
  swipeDirection: 'up' | 'down' | 'left' | 'right' | undefined;
}

export interface ToastRootProps extends BaseUIComponentProps<'div', ToastRootState> {
  /**
   * The toast to render.
   */
  toast: ToastRootToastObject<any>;
  /**
   * Direction(s) in which the toast can be swiped to dismiss.
   * @default ['down', 'right']
   */
  swipeDirection?:
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | ('up' | 'down' | 'left' | 'right')[]
    | undefined;
}

export namespace ToastRoot {
  export type ToastObject<Data extends object = any> = ToastRootToastObject<Data>;
  export type State = ToastRootState;
  export type Props = ToastRootProps;
}
