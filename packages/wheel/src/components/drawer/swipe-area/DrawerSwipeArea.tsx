/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, onCleanup, splitProps, type JSX } from 'solid-js';
import { ownerDocument } from '../../base-utils/owner';
import { NOOP } from '../../base-utils/empty';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getDisplacement, getElementTransform, useSwipeDismiss, type SwipeDirection } from '../utils/useSwipeDismiss';
import { DrawerPopupCssVars } from '../popup/DrawerPopupCssVars';
import { DrawerPopupDataAttributes } from '../popup/DrawerPopupDataAttributes';
import { DrawerBackdropCssVars } from '../backdrop/DrawerBackdropCssVars';
import type { DrawerSwipeDirection } from '../store/DrawerStore';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { createTriggerRegistration } from '../../utils/popups';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext';
import { DrawerSwipeAreaDataAttributes } from './DrawerSwipeAreaDataAttributes';

const DEFAULT_SWIPE_OPEN_RATIO = 0.5;
const MIN_SWIPE_START_DISTANCE = 1;
const VELOCITY_THRESHOLD = 0.1;
const FALLBACK_SWIPE_OPEN_THRESHOLD = 40;

const SWIPE_AREA_OPEN_HOOK: Record<string, string> = { [DrawerSwipeAreaDataAttributes.open]: '' };
const SWIPE_AREA_CLOSED_HOOK: Record<string, string> = { [DrawerSwipeAreaDataAttributes.closed]: '' };
const SWIPE_AREA_SWIPING_HOOK: Record<string, string> = { [DrawerSwipeAreaDataAttributes.swiping]: '' };
const SWIPE_AREA_DISABLED_HOOK: Record<string, string> = { [DrawerSwipeAreaDataAttributes.disabled]: '' };

const stateAttributesMapping: StateAttributesMapping<DrawerSwipeAreaState> = {
  open(value) {
    return value ? SWIPE_AREA_OPEN_HOOK : SWIPE_AREA_CLOSED_HOOK;
  },
  swiping(value) {
    return value ? SWIPE_AREA_SWIPING_HOOK : null;
  },
  swipeDirection(value) {
    return value ? { [DrawerSwipeAreaDataAttributes.swipeDirection]: value } : null;
  },
  disabled(value) {
    return value ? SWIPE_AREA_DISABLED_HOOK : null;
  },
};

const oppositeSwipeDirection: Record<DrawerSwipeDirection, DrawerSwipeDirection> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

function resolveTouchAction(direction: DrawerSwipeDirection) {
  return direction === 'left' || direction === 'right' ? 'pan-y' : 'pan-x';
}

/**
 * An invisible area that listens for swipe gestures to open the drawer.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 */
export function DrawerSwipeArea(componentProps: DrawerSwipeArea.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'swipeDirection',
    'id',
  ]);

  const store = useDrawerRootContext();
  const rootSwipeDirection = store.useState('swipeDirection');
  const frontmostHeight = store.useState('frontmostHeight');
  const providerContext = useDrawerProviderContext(true);

  const [swipeActive, setSwipeActive] = createSignal(false);

  let swipeAreaElement: HTMLDivElement | null = null;
  let openedBySwipe = false;
  const dragDelta = { x: 0, y: 0 };
  let closedOffset: number | null = null;
  let appliedSwipeStyles = false;
  let popupTransition: string | null = null;
  let releaseGuardCleanup: () => void = NOOP;

  const disabled = () => local.disabled ?? false;

  const swipeAreaId = createBaseUiId(() => local.id);
  const registerTrigger = createTriggerRegistration(swipeAreaId, store);

  const open = store.useState('open');

  function resetDragDelta() {
    dragDelta.x = 0;
    dragDelta.y = 0;
  }

  const resolvedSwipeDirection = () => local.swipeDirection ?? oppositeSwipeDirection[rootSwipeDirection()];
  const dismissDirection = () => oppositeSwipeDirection[resolvedSwipeDirection()];
  const enabled = () => !disabled() && (!open() || swipeActive());

  function disableDismissForSwipe() {
    releaseGuardCleanup();
    store.context.outsidePressEnabled.current = false;
  }

  function enableDismissAfterRelease() {
    releaseGuardCleanup();

    const doc = ownerDocument(swipeAreaElement);

    function restore() {
      releaseGuardCleanup = NOOP;
      doc.removeEventListener('pointerdown', restore, true);
      store.context.outsidePressEnabled.current = true;
    }

    // The pointerup that ends a swipe-open gesture synthesizes a `click`. Keep outside-press
    // dismissal disabled until the next *fresh* pointer interaction so it doesn't immediately
    // dismiss the drawer that was just opened.
    releaseGuardCleanup = restore;
    doc.addEventListener('pointerdown', restore, true);
  }

  function resolvePopupSize() {
    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return null;
    }

    const isHorizontal = dismissDirection() === 'left' || dismissDirection() === 'right';
    const size = isHorizontal ? popupElement.offsetWidth : popupElement.offsetHeight;
    if (size <= 0) {
      return null;
    }

    return size;
  }

  function resolveClosedOffset() {
    const offset = resolvePopupSize();
    if (offset == null) {
      return null;
    }

    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return offset;
    }

    const isHorizontal = dismissDirection() === 'left' || dismissDirection() === 'right';
    const transform = getElementTransform(popupElement);
    const transformOffset = isHorizontal ? transform.x : transform.y;
    if (Number.isFinite(transformOffset) && Math.abs(transformOffset) > 0.5) {
      return Math.min(offset, Math.abs(transformOffset));
    }

    return offset;
  }

  function resolveSwipeOpenThreshold() {
    const popupSize = resolvePopupSize();
    if (popupSize == null) {
      return FALLBACK_SWIPE_OPEN_THRESHOLD;
    }

    return popupSize * DEFAULT_SWIPE_OPEN_RATIO;
  }

  function applySwipeMovement() {
    if (!swipeActive()) {
      return;
    }

    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return;
    }

    if (!open() || !store.state.mounted) {
      return;
    }

    if (closedOffset == null) {
      closedOffset = resolveClosedOffset();
    }

    if (!closedOffset || !Number.isFinite(closedOffset) || closedOffset <= 0) {
      return;
    }

    const direction = resolvedSwipeDirection();
    const dismissDir = dismissDirection();
    const displacement = getDisplacement(direction, dragDelta.x, dragDelta.y);
    const clampedDisplacement = Math.max(0, displacement);
    const dampedDisplacement =
      clampedDisplacement > closedOffset
        ? closedOffset + Math.sqrt(clampedDisplacement - closedOffset)
        : clampedDisplacement;
    const remaining = closedOffset - dampedDisplacement;
    const directionSign = dismissDir === 'left' || dismissDir === 'up' ? -1 : 1;
    const movement = remaining * directionSign;
    const isHorizontal = dismissDir === 'left' || dismissDir === 'right';
    const movementX = isHorizontal ? movement : 0;
    const movementY = isHorizontal ? 0 : movement;
    const openProgress = Math.max(0, Math.min(1, clampedDisplacement / closedOffset));
    const backdropProgress = Math.max(0, Math.min(1, 1 - openProgress));

    popupElement.style.setProperty(DrawerPopupCssVars.swipeMovementX, `${movementX}px`);
    popupElement.style.setProperty(DrawerPopupCssVars.swipeMovementY, `${movementY}px`);
    popupElement.setAttribute(DrawerPopupDataAttributes.swiping, '');
    if (popupTransition === null) {
      popupTransition = popupElement.style.transition;
    }
    popupElement.style.transition = 'none';

    const backdropElement = store.context.backdropRef.current;
    if (backdropElement) {
      backdropElement.setAttribute(DrawerPopupDataAttributes.swiping, '');
      backdropElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, `${backdropProgress}`);
      if (openProgress > 0 && frontmostHeight() > 0) {
        backdropElement.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight()}px`);
      } else {
        backdropElement.style.removeProperty(DrawerPopupCssVars.height);
      }
    }

    providerContext?.visualStateStore.set({
      swipeProgress: openProgress,
      frontmostHeight: openProgress > 0 ? frontmostHeight() : 0,
    });
    appliedSwipeStyles = true;
    store.set('swipeAreaActive', true);
  }

  function clearSwipeStyles() {
    const popupElement = store.context.popupRef.current;
    if (popupElement && appliedSwipeStyles) {
      popupElement.style.removeProperty(DrawerPopupCssVars.swipeMovementX);
      popupElement.style.removeProperty(DrawerPopupCssVars.swipeMovementY);
      popupElement.removeAttribute(DrawerPopupDataAttributes.swiping);
    }

    if (popupElement && popupTransition !== null) {
      popupElement.style.transition = popupTransition;
      popupTransition = null;
    }

    const backdropElement = store.context.backdropRef.current;
    if (backdropElement) {
      backdropElement.removeAttribute(DrawerPopupDataAttributes.swiping);
      backdropElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      backdropElement.style.removeProperty(DrawerPopupCssVars.height);
    }

    providerContext?.visualStateStore.set({ swipeProgress: 0, frontmostHeight: 0 });
    appliedSwipeStyles = false;
    store.set('swipeAreaActive', false);
  }

  function openDrawer(event?: PointerEvent | TouchEvent) {
    if (open()) {
      return;
    }
    openedBySwipe = true;
    store.setOpen(true, createChangeEventDetails(REASONS.swipe, event, swipeAreaElement ?? undefined));
  }

  function closeDrawer(event?: PointerEvent | TouchEvent) {
    if (!open()) {
      return;
    }
    store.setOpen(false, createChangeEventDetails(REASONS.swipe, event, swipeAreaElement ?? undefined));
  }

  function resetSwipeInteractionState() {
    openedBySwipe = false;
    closedOffset = null;
    setSwipeActive(false);
  }

  function finishSwipeInteraction() {
    resetSwipeInteractionState();
    enableDismissAfterRelease();
    resetDragDelta();
    clearSwipeStyles();
  }

  const swipe = useSwipeDismiss({
    enabled,
    directions: () => [resolvedSwipeDirection()],
    elementRef: { get current() { return swipeAreaElement; } },
    trackDrag: false,
    movementCssVars: {
      x: DrawerPopupCssVars.swipeMovementX,
      y: DrawerPopupCssVars.swipeMovementY,
    },
    onSwipeStart() {
      disableDismissForSwipe();
      openedBySwipe = false;
      setSwipeActive(true);
      resetDragDelta();
    },
    onProgress(_progress, details) {
      if (!details) {
        return;
      }

      dragDelta.x = details.deltaX;
      dragDelta.y = details.deltaY;

      const direction = resolvedSwipeDirection();
      if (details.direction !== direction) {
        return;
      }

      const displacement = getDisplacement(direction, details.deltaX, details.deltaY);

      if (displacement < MIN_SWIPE_START_DISTANCE && !openedBySwipe) {
        return;
      }

      if (!openedBySwipe) {
        openDrawer();
      }

      applySwipeMovement();
    },
    onRelease({ event, direction, deltaX, deltaY, releaseVelocityX, releaseVelocityY }) {
      const swipeDir = resolvedSwipeDirection();
      const displacement = getDisplacement(swipeDir, deltaX, deltaY);
      const releaseVelocity = getDisplacement(swipeDir, releaseVelocityX, releaseVelocityY);
      const threshold = resolveSwipeOpenThreshold();
      const hasEnoughDistance = threshold != null && displacement >= threshold;
      const hasEnoughVelocity = releaseVelocity >= VELOCITY_THRESHOLD;
      const shouldOpen =
        threshold != null && direction === swipeDir && (hasEnoughDistance || hasEnoughVelocity) && !disabled();

      if (shouldOpen) {
        if (!open()) {
          openDrawer(event);
        }
      } else if (openedBySwipe) {
        closeDrawer(event);
      }

      finishSwipeInteraction();

      return false;
    },
    onCancel: finishSwipeInteraction,
  });

  // The commit that opens the drawer re-renders the popup, resetting `--swipe-movement-*` to `0px`
  // (the viewport isn't swiping). Re-assert after the DOM mutation but before paint.
  createEffect(() => {
    if (swipeActive() && appliedSwipeStyles) {
      applySwipeMovement();
    }
  });

  createEffect(() => {
    if (!enabled()) {
      swipe.reset();
      resetDragDelta();
      clearSwipeStyles();
      resetSwipeInteractionState();
    }
  });

  onCleanup(() => {
    releaseGuardCleanup();
    store.context.outsidePressEnabled.current = true;
  });

  const state: DrawerSwipeAreaState = {
    get open() {
      return open();
    },
    get swiping() {
      return swipe.swiping();
    },
    get swipeDirection() {
      return resolvedSwipeDirection();
    },
    get disabled() {
      return disabled();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Drawer-SwipeArea',
    slot: 'drawer-swipe-area',
    state,
    ref: [
      (el: HTMLDivElement | null) => {
        swipeAreaElement = el;
      },
      registerTrigger,
    ],
    stateAttributesMapping,
    props: [
      // This zero-arg thunk is `renderElement`'s reactive-props convention (see CONVENTIONS.md);
      // the lint rule doesn't special-case that custom API and flags the object literal itself.
      () => ({
        role: 'presentation',
        'aria-hidden': true,
        style: {
          'pointer-events': !enabled() ? 'none' : undefined,
          'touch-action': resolveTouchAction(resolvedSwipeDirection()),
        },
        onPointerDown(event: PointerEvent) {
          if (event.pointerType === 'touch') {
            return;
          }
          swipe.getPointerProps().onPointerDown?.(event);

          // Prevent native text selection/drag gestures from competing with swipe-open dragging.
          if (event.cancelable) {
            event.preventDefault();
          }
        },
        onPointerMove(event: PointerEvent) {
          if (event.pointerType === 'touch') {
            return;
          }
          swipe.getPointerProps().onPointerMove?.(event);
        },
        onPointerUp(event: PointerEvent) {
          if (event.pointerType === 'touch') {
            return;
          }
          swipe.getPointerProps().onPointerUp?.(event);
        },
        onPointerCancel(event: PointerEvent) {
          if (event.pointerType === 'touch') {
            return;
          }
          swipe.getPointerProps().onPointerCancel?.(event);
        },
      }),
      () => swipe.getTouchProps(),
      () => (swipeAreaId() ? { id: swipeAreaId() } : undefined),
      elementProps,
    ],
  });
}

export interface DrawerSwipeAreaProps extends BaseUIComponentProps<'div', DrawerSwipeAreaState> {
  /**
   * Whether the swipe area is disabled.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * The swipe direction that opens the drawer.
   * Defaults to the opposite of `Drawer.Root` `swipeDirection`.
   */
  swipeDirection?: DrawerSwipeDirection | undefined;
}

export interface DrawerSwipeAreaState {
  /**
   * Whether the drawer is currently open.
   */
  open: boolean;
  /**
   * Whether the swipe area is currently being swiped.
   */
  swiping: boolean;
  /**
   * The swipe direction that opens the drawer.
   */
  swipeDirection: SwipeDirection;
  /**
   * Whether the swipe area is disabled.
   */
  disabled: boolean;
}

export namespace DrawerSwipeArea {
  export type Props = DrawerSwipeAreaProps;
  export type State = DrawerSwipeAreaState;
}
