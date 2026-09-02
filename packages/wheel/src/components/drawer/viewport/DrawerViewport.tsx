/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, createMemo, onCleanup, splitProps, type JSX } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { useDrawerPortalContext } from '../portal/DrawerPortalContext';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext';
import { useDrawerVirtualKeyboardContext } from '../virtual-keyboard-provider/DrawerVirtualKeyboardContext';
import { getSnapPointSwipeMovement, useDrawerSnapPoints } from '../root/useDrawerSnapPoints';
import { clamp } from '../../internals/clamp';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping, TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';
import { popupStateMapping as baseMapping } from '../../utils/popupStateMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { useSwipeDismiss, type SwipeDirection, type UseSwipeDismissProgressDetails } from '../utils/useSwipeDismiss';
import { findScrollableTouchTarget, type ScrollAxis } from '../utils/scrollable';
import { getElementAtPoint } from '../utils/getElementAtPoint';
import { activeElement, contains, getTarget } from '../../floating-ui-solid/utils/element';
import { BASE_UI_SWIPE_IGNORE_SELECTOR } from '../../internals/constants';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { DrawerPopupCssVars } from '../popup/DrawerPopupCssVars';
import { DrawerPopupDataAttributes } from '../popup/DrawerPopupDataAttributes';
import { DrawerBackdropCssVars } from '../backdrop/DrawerBackdropCssVars';
import { DRAWER_CONTENT_ATTRIBUTE } from '../content/DrawerContentDataAttributes';
import { DrawerViewportContext, type DrawerViewportContextValue } from './DrawerViewportContext';
import { DrawerViewportDataAttributes } from './DrawerViewportDataAttributes';

const MIN_SWIPE_THRESHOLD = 10;
const FAST_SWIPE_VELOCITY = 0.5;
const SNAP_VELOCITY_THRESHOLD = 0.5;
const SNAP_VELOCITY_MULTIPLIER = 300;
const MAX_SNAP_VELOCITY = 4;
const MIN_SWIPE_RELEASE_VELOCITY = 0.2;
const MAX_SWIPE_RELEASE_VELOCITY = 4;
const MIN_SWIPE_RELEASE_DURATION_MS = 80;
const MAX_SWIPE_RELEASE_DURATION_MS = 360;
const MIN_SWIPE_RELEASE_SCALAR = 0.1;
const MAX_SWIPE_RELEASE_SCALAR = 1;
const DRAWER_CONTENT_SELECTOR = `[${DRAWER_CONTENT_ATTRIBUTE}]`;

interface TouchScrollState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  scrollTarget: HTMLElement | null;
  hasCrossAxisScrollableContent: boolean;
  allowSwipe: boolean | null;
  preserveNativeCrossAxisScroll: boolean;
}

const stateAttributesMapping: StateAttributesMapping<DrawerViewportState> = {
  ...baseMapping,
  ...transitionStatusMapping,
  nested(value) {
    return value ? { [DrawerViewportDataAttributes.nested]: '' } : null;
  },
};

/**
 * A positioning container for the drawer popup that can be made scrollable.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream renders through `Dialog.Viewport` (wrapping it, since Drawer shares
 * `DialogStore`). This Solid port's Drawer owns a separate `DrawerStore` (see `DrawerStore`'s doc
 * comment), so this renders its own `<div>` directly instead — structurally equivalent, but without
 * needing to suppress a `data-nested-dialog-open` attribute inherited from `Dialog.Viewport`
 * (Drawer never maps that attribute name here in the first place).
 */
export function DrawerViewport(componentProps: DrawerViewport.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const keepMounted = useDrawerPortalContext();
  const store = useDrawerRootContext();

  const swipeDirection = store.useState('swipeDirection');
  const frontmostHeight = store.useState('frontmostHeight');
  const snapToSequentialPoints = store.useState('snapToSequentialPoints');

  const providerContext = useDrawerProviderContext(true);
  const {
    snapPoints,
    resolvedSnapPoints,
    activeSnapPoint,
    activeSnapPointOffset,
    popupHeight,
  } = useDrawerSnapPoints();

  function setActiveSnapPoint(
    ...args: Parameters<NonNullable<(typeof store.context)['setActiveSnapPoint']>>
  ) {
    store.context.setActiveSnapPoint?.(...args);
  }

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const nested = store.useState('nested');
  const nestedOpenDrawerCount = store.useState('nestedOpenDrawerCount');
  const viewportElement = store.useState('viewportElement');
  const popupElementState = store.useState('popupElement');

  const visualStateStore = providerContext?.visualStateStore;
  const nestedDrawerOpen = () => nestedOpenDrawerCount() > 0;
  const scrollAxis = (): ScrollAxis =>
    swipeDirection() === 'left' || swipeDirection() === 'right' ? 'horizontal' : 'vertical';
  const isVerticalScrollAxis = () => scrollAxis() === 'vertical';
  const crossScrollAxis = (): ScrollAxis => (isVerticalScrollAxis() ? 'horizontal' : 'vertical');

  const [swipeRelease, setSwipeRelease] = useSignal<number | null>(null, 'swipeRelease');

  let pendingSwipeCloseSnapPoint: ReturnType<typeof activeSnapPoint> | undefined;
  let resetSwipeFn: (() => void) | null = null;
  const controlledDismissFrame = createAnimationFrame();

  let swipingCurrent = false;
  let nestedSwipeActive = false;
  let lastPointerType: string = '';
  let ignoreNextTouchStartFromPen = false;
  let ignoreTouchSwipe = false;
  let touchScrollState: TouchScrollState | null = null;

  const virtualKeyboard = useDrawerVirtualKeyboardContext();

  const snapPointRange = createMemo(() => {
    const points = snapPoints();
    if (!points || points.length < 2) {
      return null;
    }

    const direction = swipeDirection();
    if (direction !== 'down' && direction !== 'up') {
      return null;
    }

    const resolved = resolvedSnapPoints();
    if (resolved.length < 2) {
      return null;
    }

    const offsets = resolved
      .map((point) => point.offset)
      .filter((offset) => Number.isFinite(offset))
      .sort((a, b) => a - b);

    if (offsets.length < 2) {
      return null;
    }

    const minOffset = offsets[0];
    const nextOffset = offsets[1];
    const maxOffset = offsets[offsets.length - 1];
    let range = nextOffset - minOffset;
    if (!Number.isFinite(range) || range <= 0) {
      const fallbackRange = maxOffset - minOffset;
      if (!Number.isFinite(fallbackRange) || fallbackRange <= 0) {
        return null;
      }
      range = fallbackRange;
    }

    return { minOffset, range };
  });

  const snapPointProgress = createMemo(() => {
    const range = snapPointRange();
    const offset = activeSnapPointOffset();
    if (!range || offset === null) {
      return null;
    }

    return clamp((offset - range.minOffset) / range.range, 0, 1);
  });

  const swipeDirections = createMemo<SwipeDirection[]>(() => {
    const points = snapPoints();
    const direction = swipeDirection();
    if (points && points.length > 0 && (direction === 'down' || direction === 'up')) {
      return direction === 'down' ? ['down', 'up'] : ['up', 'down'];
    }

    return [direction];
  });

  function setSwipeDismissed(dismissed: boolean) {
    setSwipeDismissedElements(store.context.popupRef.current, store.context.backdropRef.current, dismissed);
  }

  function clearSwipeRelease() {
    setSwipeDismissed(false);
    store.context.popupRef.current?.removeAttribute(TransitionStatusDataAttributes.endingStyle);
    setSwipeRelease(null);
  }

  function finishNestedSwipe() {
    if (!nestedSwipeActive) {
      return;
    }

    nestedSwipeActive = false;
    store.context.parentStore?.context.onNestedSwipingChange?.(false);
  }

  function applySwipeProgress({
    resolvedProgress,
    shouldTrackProgress,
    notifyParent,
  }: {
    resolvedProgress: number;
    shouldTrackProgress: boolean;
    notifyParent: boolean;
  }) {
    const isActive = open() && !nested() && shouldTrackProgress;
    const swipeProgress = isActive ? resolvedProgress : 0;
    const nestedSwipeProgress = open() && shouldTrackProgress ? resolvedProgress : 0;

    if (notifyParent) {
      store.context.parentStore?.context.onNestedSwipeProgressChange?.(nestedSwipeProgress);

      if (nestedSwipeProgress <= 0) {
        finishNestedSwipe();
      }
    }

    visualStateStore?.set({
      swipeProgress,
      frontmostHeight: swipeProgress > 0 ? frontmostHeight() : 0,
    });

    const backdropElement = store.context.backdropRef.current;
    if (!backdropElement) {
      return;
    }

    if (!isActive || swipeProgress <= 0) {
      backdropElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
      backdropElement.style.removeProperty(DrawerPopupCssVars.height);
      return;
    }

    backdropElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, `${swipeProgress}`);
    if (frontmostHeight() > 0) {
      backdropElement.style.setProperty(DrawerPopupCssVars.height, `${frontmostHeight()}px`);
    } else {
      backdropElement.style.removeProperty(DrawerPopupCssVars.height);
    }
  }

  function resolveSwipeRelease({
    direction,
    deltaX,
    deltaY,
    velocityX,
    velocityY,
    releaseVelocityX,
    releaseVelocityY,
  }: {
    direction: SwipeDirection | undefined;
    deltaX: number;
    deltaY: number;
    velocityX: number;
    velocityY: number;
    releaseVelocityX: number;
    releaseVelocityY: number;
  }): number | null {
    if (!direction) {
      return null;
    }

    const popupElement = store.context.popupRef.current;
    if (!popupElement) {
      return null;
    }

    const size = direction === 'left' || direction === 'right' ? popupElement.offsetWidth : popupElement.offsetHeight;
    if (!Number.isFinite(size) || size <= 0) {
      return null;
    }

    const axisDelta = direction === 'left' || direction === 'right' ? deltaX : deltaY;
    const points = snapPoints();
    const snapPointBaseOffset = points && points.length > 0 ? (activeSnapPointOffset() ?? 0) : 0;
    let baseOffset = 0;
    if (direction === 'down') {
      baseOffset = snapPointBaseOffset;
    } else if (direction === 'up') {
      baseOffset = -snapPointBaseOffset;
    }

    const translation = baseOffset + axisDelta;
    const translationAlongDirection = direction === 'left' || direction === 'up' ? -translation : translation;
    const remainingDistance = Math.max(0, size - translationAlongDirection);
    if (!Number.isFinite(remainingDistance) || remainingDistance <= 0) {
      return null;
    }

    const axisVelocity = direction === 'left' || direction === 'right' ? releaseVelocityX : releaseVelocityY;
    const fallbackVelocity = direction === 'left' || direction === 'right' ? velocityX : velocityY;
    const resolvedVelocity = Math.abs(axisVelocity) > 0 && Number.isFinite(axisVelocity) ? axisVelocity : fallbackVelocity;
    const directionalVelocity = direction === 'left' || direction === 'up' ? -resolvedVelocity : resolvedVelocity;
    if (!Number.isFinite(directionalVelocity) || directionalVelocity <= MIN_SWIPE_RELEASE_VELOCITY) {
      return null;
    }

    const clampedVelocity = clamp(directionalVelocity, MIN_SWIPE_RELEASE_VELOCITY, MAX_SWIPE_RELEASE_VELOCITY);
    const durationMs = clamp(remainingDistance / clampedVelocity, MIN_SWIPE_RELEASE_DURATION_MS, MAX_SWIPE_RELEASE_DURATION_MS);
    if (!Number.isFinite(durationMs)) {
      return null;
    }

    const normalizedDuration =
      (durationMs - MIN_SWIPE_RELEASE_DURATION_MS) / (MAX_SWIPE_RELEASE_DURATION_MS - MIN_SWIPE_RELEASE_DURATION_MS);
    const durationScalar = clamp(
      MIN_SWIPE_RELEASE_SCALAR + normalizedDuration * (MAX_SWIPE_RELEASE_SCALAR - MIN_SWIPE_RELEASE_SCALAR),
      MIN_SWIPE_RELEASE_SCALAR,
      MAX_SWIPE_RELEASE_SCALAR,
    );
    if (!Number.isFinite(durationScalar) || durationScalar <= 0) {
      return null;
    }

    return durationScalar;
  }

  function updateNestedSwipeActive(details?: UseSwipeDismissProgressDetails) {
    if (nestedSwipeActive || !details) {
      return;
    }

    const direction = details.direction ?? swipeDirection();
    const delta = direction === 'left' || direction === 'right' ? details.deltaX : details.deltaY;
    if (!Number.isFinite(delta) || Math.abs(delta) < MIN_SWIPE_THRESHOLD) {
      return;
    }

    nestedSwipeActive = true;
    store.context.parentStore?.context.onNestedSwipingChange?.(true);
  }

  const swipe = useSwipeDismiss({
    enabled: () => mounted() && !nestedDrawerOpen(),
    directions: swipeDirections,
    elementRef: store.context.popupRef,
    ignoreSelectorWhenTouch: false,
    ignoreScrollableAncestors: true,
    movementCssVars: {
      x: DrawerPopupCssVars.swipeMovementX,
      y: DrawerPopupCssVars.swipeMovementY,
    },
    onSwipeStart(event) {
      if ('touches' in event || ('pointerType' in event && event.pointerType === 'touch')) {
        return;
      }

      const popupElement = store.context.popupRef.current;
      if (!popupElement) {
        return;
      }

      const doc = ownerDocument(popupElement);
      const selection = doc.getSelection?.();
      if (!selection || selection.isCollapsed) {
        return;
      }

      const anchorElement = isElement(selection.anchorNode)
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
      const focusElement = isElement(selection.focusNode)
        ? selection.focusNode
        : selection.focusNode?.parentElement;

      if (!contains(popupElement, anchorElement ?? null) && !contains(popupElement, focusElement ?? null)) {
        return;
      }

      selection.removeAllRanges();
    },
    onSwipingChange(swiping) {
      swipingCurrent = swiping;
      setBackdropSwipingAttribute(store.context.backdropRef.current, swiping);

      if (!swiping) {
        finishNestedSwipe();
      }
    },
    swipeThreshold({ element, direction }) {
      return getBaseSwipeThreshold(element, direction);
    },
    canStart(position, details) {
      const popupElement = store.context.popupRef.current;
      if (!popupElement) {
        return false;
      }

      const doc = popupElement.ownerDocument;
      const elementAtPoint = getElementAtPoint(doc, position.x, position.y);
      if (!elementAtPoint || !contains(popupElement, elementAtPoint)) {
        return false;
      }

      const nativeEvent = details.nativeEvent;
      const touchLike =
        'touches' in nativeEvent || ('pointerType' in nativeEvent && nativeEvent.pointerType === 'touch');
      if (touchLike && shouldIgnoreSwipeForTextSelection(doc, popupElement)) {
        return false;
      }

      if (nativeEvent.type === 'touchstart' && isSwipeIgnoredTarget(elementAtPoint)) {
        return false;
      }

      return true;
    },
    onProgress(progress, details) {
      updateNestedSwipeActive(details);

      const hasSnapPoints = Boolean(snapPoints() && snapPoints()!.length > 0);
      if (swipingCurrent && swipeDirection() === 'down' && hasSnapPoints && details && Number.isFinite(details.deltaY)) {
        const popupElement = store.context.popupRef.current;
        if (popupElement) {
          popupElement.style.removeProperty('transform');
          popupElement.style.setProperty(
            DrawerPopupCssVars.swipeMovementY,
            `${getSnapPointSwipeMovement(activeSnapPointOffset() ?? 0, details.deltaY)}px`,
          );
        }
      }

      const currentDirection = details?.direction ?? swipe.swipeDirection();
      const isDismissSwipe = currentDirection === undefined || currentDirection === swipeDirection();
      const isVerticalSwipe = swipeDirection() === 'down' || swipeDirection() === 'up';
      const shouldTrackProgress =
        (hasSnapPoints && isVerticalSwipe) ||
        !hasSnapPoints ||
        swipeDirection() === 'left' ||
        swipeDirection() === 'right' ||
        isDismissSwipe;

      let resolvedProgress = progress;
      const range = snapPointRange();
      const height = popupHeight();
      if (range && height > 0) {
        if (details && Number.isFinite(details.deltaY)) {
          const baseOffset = activeSnapPointOffset() ?? range.minOffset;
          const nextOffset = clamp(baseOffset + details.deltaY, 0, height);

          resolvedProgress = clamp((nextOffset - range.minOffset) / range.range, 0, 1);
        } else if (snapPointProgress() !== null) {
          resolvedProgress = snapPointProgress()!;
        } else if (currentDirection === 'down' || currentDirection === 'up') {
          const displacement = progress * height;
          const baseOffset = activeSnapPointOffset() ?? range.minOffset;
          const nextOffset = currentDirection === 'down' ? baseOffset + displacement : baseOffset - displacement;

          resolvedProgress = clamp((nextOffset - range.minOffset) / range.range, 0, 1);
        }
      }

      applySwipeProgress({ resolvedProgress, shouldTrackProgress, notifyParent: true });
    },
    onRelease({ event, deltaX, deltaY, direction, velocityX, velocityY, releaseVelocityX, releaseVelocityY }) {
      const swipeReleasePayload = { deltaX, deltaY, velocityX, velocityY, releaseVelocityX, releaseVelocityY };

      function startSwipeRelease(resolvedDirection: SwipeDirection) {
        const popupElement = store.context.popupRef.current;
        if (!popupElement) {
          return;
        }

        finishNestedSwipe();
        setSwipeDismissed(true);

        popupElement.style.removeProperty('transition');
        popupElement.setAttribute(TransitionStatusDataAttributes.endingStyle, '');
        setSwipeRelease(resolveSwipeRelease({ direction: resolvedDirection, ...swipeReleasePayload }));
      }

      const points = snapPoints();
      if (!points || points.length === 0) {
        if (!direction) {
          clearSwipeRelease();
          return undefined;
        }

        const element = store.context.popupRef.current;
        if (!element) {
          clearSwipeRelease();
          return undefined;
        }

        const baseThreshold = getBaseSwipeThreshold(element, direction);
        const delta = direction === 'left' || direction === 'right' ? deltaX : deltaY;
        if (!Number.isFinite(delta)) {
          clearSwipeRelease();
          return undefined;
        }

        const directionalDelta = direction === 'left' || direction === 'up' ? -delta : delta;
        if (directionalDelta <= 0) {
          clearSwipeRelease();
          return false;
        }

        const velocity = direction === 'left' || direction === 'right' ? velocityX : velocityY;
        const directionalVelocity = direction === 'left' || direction === 'up' ? -velocity : velocity;
        if (directionalVelocity >= FAST_SWIPE_VELOCITY && directionalDelta > 0) {
          startSwipeRelease(direction);
          return true;
        }

        const shouldClose = directionalDelta > baseThreshold;
        if (shouldClose) {
          startSwipeRelease(direction);
        } else {
          clearSwipeRelease();
        }
        return shouldClose;
      }

      const direction2 = swipeDirection();
      if (direction2 !== 'down' && direction2 !== 'up') {
        clearSwipeRelease();
        return undefined;
      }

      const height = popupHeight();
      const resolved = resolvedSnapPoints();
      if (!height || resolved.length === 0) {
        clearSwipeRelease();
        return undefined;
      }

      const dragDelta = direction2 === 'down' ? deltaY : -deltaY;
      if (!Number.isFinite(dragDelta)) {
        clearSwipeRelease();
        return undefined;
      }

      const dragDirection = Math.sign(dragDelta);
      const releaseDirectionalVelocity = direction2 === 'down' ? releaseVelocityY : -releaseVelocityY;
      const fallbackDirectionalVelocity = direction2 === 'down' ? velocityY : -velocityY;
      let resolvedDirectionalVelocity = Number.isFinite(releaseDirectionalVelocity)
        ? releaseDirectionalVelocity
        : fallbackDirectionalVelocity;
      if (dragDirection !== 0 && Math.abs(dragDelta) >= MIN_SWIPE_THRESHOLD && Number.isFinite(resolvedDirectionalVelocity)) {
        const velocityDirection = Math.sign(resolvedDirectionalVelocity);
        if (velocityDirection !== 0 && velocityDirection !== dragDirection) {
          resolvedDirectionalVelocity = fallbackDirectionalVelocity;
        }
      }

      const currentOffset = activeSnapPointOffset() ?? 0;
      const dragTargetOffset = clamp(currentOffset + dragDelta, 0, height);
      const velocityOffset =
        Number.isFinite(resolvedDirectionalVelocity) && Math.abs(resolvedDirectionalVelocity) >= SNAP_VELOCITY_THRESHOLD
          ? clamp(resolvedDirectionalVelocity, -MAX_SNAP_VELOCITY, MAX_SNAP_VELOCITY) * SNAP_VELOCITY_MULTIPLIER
          : 0;
      const targetOffset = snapToSequentialPoints() ? dragTargetOffset : clamp(dragTargetOffset + velocityOffset, 0, height);
      const snapPointEventDetails = createChangeEventDetails(REASONS.swipe, event);
      const closeFromSnapPoints = () => {
        pendingSwipeCloseSnapPoint = activeSnapPoint();
        setActiveSnapPoint(null, snapPointEventDetails);
        startSwipeRelease(direction2);
        return true;
      };

      if (snapToSequentialPoints()) {
        const orderedSnapPoints = [...resolved].sort((first, second) => first.offset - second.offset);
        if (orderedSnapPoints.length === 0) {
          clearSwipeRelease();
          return false;
        }

        let currentIndex = 0;
        let closestDistance = Math.abs(currentOffset - orderedSnapPoints[0].offset);
        for (let index = 1; index < orderedSnapPoints.length; index += 1) {
          const distance = Math.abs(currentOffset - orderedSnapPoints[index].offset);
          if (distance < closestDistance) {
            closestDistance = distance;
            currentIndex = index;
          }
        }

        let targetSnapPoint = orderedSnapPoints[0];
        closestDistance = Math.abs(targetOffset - targetSnapPoint.offset);
        for (const snapPoint of orderedSnapPoints) {
          const distance = Math.abs(targetOffset - snapPoint.offset);
          if (distance < closestDistance) {
            closestDistance = distance;
            targetSnapPoint = snapPoint;
          }
        }

        const velocityDirection = Math.sign(resolvedDirectionalVelocity);
        const shouldAdvance =
          dragDirection !== 0 &&
          velocityDirection !== 0 &&
          velocityDirection === dragDirection &&
          Math.abs(resolvedDirectionalVelocity) >= SNAP_VELOCITY_THRESHOLD;
        let effectiveTargetOffset = targetOffset;

        if (shouldAdvance) {
          const adjacentIndex = clamp(currentIndex + dragDirection, 0, orderedSnapPoints.length - 1);
          if (adjacentIndex !== currentIndex) {
            const adjacentPoint = orderedSnapPoints[adjacentIndex];
            const shouldForceAdjacent =
              dragDirection > 0 ? targetOffset < adjacentPoint.offset : targetOffset > adjacentPoint.offset;
            if (shouldForceAdjacent) {
              targetSnapPoint = adjacentPoint;
              effectiveTargetOffset = adjacentPoint.offset;
            }
          } else if (dragDirection > 0) {
            return closeFromSnapPoints();
          }
        }

        const closeOffset = height;
        const closeDistance = Math.abs(effectiveTargetOffset - closeOffset);
        const snapDistance = Math.abs(effectiveTargetOffset - targetSnapPoint.offset);
        if (closeDistance < snapDistance) {
          return closeFromSnapPoints();
        }

        setActiveSnapPoint(targetSnapPoint.value, snapPointEventDetails);
        clearSwipeRelease();
        return false;
      }

      if (resolvedDirectionalVelocity >= FAST_SWIPE_VELOCITY && dragDelta > 0) {
        return closeFromSnapPoints();
      }

      let closestSnapPoint = resolved[0];
      let closestDistance = Math.abs(targetOffset - closestSnapPoint.offset);

      for (const snapPoint of resolved) {
        const distance = Math.abs(targetOffset - snapPoint.offset);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSnapPoint = snapPoint;
        }
      }

      const closeOffset = height;
      const closeDistance = Math.abs(targetOffset - closeOffset);
      if (closeDistance < closestDistance) {
        return closeFromSnapPoints();
      }

      setActiveSnapPoint(closestSnapPoint.value, snapPointEventDetails);
      clearSwipeRelease();
      return false;
    },
    onDismiss(event) {
      visualStateStore?.set({ swipeProgress: 0, frontmostHeight: 0 });

      const backdropElement = store.context.backdropRef.current;
      if (backdropElement) {
        backdropElement.style.setProperty(DrawerBackdropCssVars.swipeProgress, '0');
        backdropElement.style.removeProperty(DrawerPopupCssVars.height);
      }

      const dismissEventDetails = createChangeEventDetails(REASONS.swipe, event);
      store.setOpen(false, dismissEventDetails);

      if (dismissEventDetails.isCanceled) {
        const pendingSnapPoint = pendingSwipeCloseSnapPoint;
        if (pendingSnapPoint !== undefined) {
          setActiveSnapPoint(pendingSnapPoint, createChangeEventDetails(REASONS.swipe, event));
        }

        pendingSwipeCloseSnapPoint = undefined;
        resetSwipeFn?.();
        clearSwipeRelease();
        return;
      }

      // In controlled mode, the effective open state may not have changed yet
      // (openProp takes precedence over state.open). Proceed optimistically with the
      // dismiss animation, then check on the next frame whether the parent accepted or
      // rejected the close.
      if (store.useState('open')()) {
        controlledDismissFrame.request(() => {
          if (store.useState('open')()) {
            const pendingSnapPoint = pendingSwipeCloseSnapPoint;
            if (pendingSnapPoint !== undefined) {
              setActiveSnapPoint(pendingSnapPoint, createChangeEventDetails(REASONS.swipe, event));
            }
            pendingSwipeCloseSnapPoint = undefined;
            clearSwipeRelease();
            resetSwipeFn?.();
          } else {
            pendingSwipeCloseSnapPoint = undefined;
          }
        });
        return;
      }

      pendingSwipeCloseSnapPoint = undefined;
      setSwipeDismissed(true);
    },
  });

  const swipePointerProps = swipe.getPointerProps;
  const swipeTouchProps = swipe.getTouchProps;
  const moveSwipeNative = swipe.moveNative;
  resetSwipeFn = swipe.reset;

  createEffect(() => {
    const rootElement = viewportElement() ?? popupElementState();
    if (!rootElement) {
      return;
    }

    const resolvedRootElement: HTMLElement = rootElement;
    const doc = ownerDocument(resolvedRootElement);
    const win = ownerWindow(doc);

    function handleNativeTouchMove(event: TouchEvent) {
      virtualKeyboard?.onTouchMove(event);

      if (ignoreTouchSwipe) {
        return;
      }

      const touchState = touchScrollState;
      const touch = event.touches[0];
      if (!touch || !touchState) {
        return;
      }

      const drawerAxisDelta = isVerticalScrollAxis() ? touch.clientY - touchState.lastY : touch.clientX - touchState.lastX;

      if (isEventOnRangeInput(event, win)) {
        touchState.allowSwipe = false;
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      if (event.touches.length === 2) {
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      const allowTouchMove = shouldIgnoreSwipeForTextSelection(doc, resolvedRootElement);

      if (allowTouchMove || !open() || !mounted() || nestedDrawerOpen()) {
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      if (preserveNativeCrossAxisScrollOnMove(touchState, touch, isVerticalScrollAxis())) {
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      const scrollTarget = touchState.scrollTarget;
      if (!scrollTarget || scrollTarget === doc.documentElement || scrollTarget === doc.body) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
        moveSwipeNative(event, resolvedRootElement);
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      const hasScrollableContent = hasScrollableContentOnAxis(scrollTarget, scrollAxis());
      if (!hasScrollableContent) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();
        updateTouchScrollPosition(touchState, touch);
        return;
      }

      const delta = drawerAxisDelta;
      if (delta !== 0) {
        const canSwipeFromScrollEdge = canSwipeFromScrollEdgeOnMove(scrollTarget, scrollAxis(), swipeDirection(), delta);

        if (!touchState.allowSwipe) {
          if (!event.cancelable) {
            touchState.allowSwipe = false;
          } else if (canSwipeFromScrollEdge) {
            touchState.allowSwipe = true;
            event.preventDefault();
          } else {
            touchState.allowSwipe = false;
          }
        } else if (event.cancelable) {
          event.preventDefault();
        }
      }

      if (touchState.allowSwipe === true) {
        event.stopPropagation();
        moveSwipeNative(event, resolvedRootElement);
      }

      updateTouchScrollPosition(touchState, touch);
    }

    onCleanup(addEventListener(doc, 'touchmove', handleNativeTouchMove, { passive: false, capture: true }));
  });

  createEffect(() => {
    const range = snapPointRange();
    if (!range || swipe.swiping()) {
      return;
    }

    const resolvedProgress = !open() || nested() ? 0 : (snapPointProgress() ?? 0);
    applySwipeProgress({ resolvedProgress, shouldTrackProgress: true, notifyParent: false });
  });

  createEffect(() => {
    if (!open()) {
      store.context.parentStore?.context.onNestedSwipeProgressChange?.(0);
    }

    onCleanup(() => {
      store.context.parentStore?.context.onNestedSwipeProgressChange?.(0);
    });
  });

  createEffect(() => {
    if (open()) {
      // Skip `resetSwipe` while `Drawer.SwipeArea` is driving the open: it zeroes the popup's
      // `--swipe-movement-*` (via `syncDragStyles(false)`), flashing it fully open for a frame.
      if (!store.state.swipeAreaActive) {
        resetSwipeFn?.();
      }
      clearSwipeRelease();
    }
  });

  onCleanup(() => {
    const backdropElement = store.context.backdropRef.current;
    visualStateStore?.set({ swipeProgress: 0, frontmostHeight: 0 });
    setBackdropSwipingAttribute(backdropElement, false);
    const currentBackdrop = store.context.backdropRef.current;
    if (currentBackdrop !== backdropElement) {
      setBackdropSwipingAttribute(currentBackdrop, false);
    }
    finishNestedSwipe();
  });

  const swipeProviderValue: DrawerViewportContextValue = {
    get swiping() {
      return swipe.swiping();
    },
    getDragStyles: swipe.getDragStyles,
    get swipeStrength() {
      return swipeRelease();
    },
    setSwipeDismissed,
  };

  function resetTouchTrackingState() {
    ignoreTouchSwipe = false;
    touchScrollState = null;
    lastPointerType = '';
    ignoreNextTouchStartFromPen = false;
  }

  const nestedOpenDrawerCountState = nestedOpenDrawerCount;

  const state: DrawerViewport.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return store.useState('transitionStatus')();
    },
    get nested() {
      return nested();
    },
    get nestedDialogOpen() {
      return nestedOpenDrawerCountState() > 0;
    },
  };

  const shouldRender = () => keepMounted || mounted();

  return (
    <DrawerViewportContext.Provider value={swipeProviderValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Drawer-Viewport',
        slot: 'drawer-viewport',
        enabled: shouldRender,
        state,
        stateAttributesMapping,
        props: [
          () => ({
            role: 'presentation',
            hidden: !mounted(),
            style: {
              'pointer-events': !open() ? 'none' : undefined,
            },
          }),
          () => ({
            onPointerDown(event: PointerEvent) {
              lastPointerType = event.pointerType;
              ignoreNextTouchStartFromPen = event.pointerType === 'pen';

              if (!open() || !mounted() || nestedDrawerOpen()) {
                return;
              }

              const doc = ownerDocument(event.currentTarget as Element | null);
              const elementAtPoint = getElementAtPoint(doc, event.clientX, event.clientY);
              if (isSwipeIgnoredTarget(elementAtPoint) || isDrawerContentTarget(elementAtPoint)) {
                return;
              }

              if (event.pointerType === 'touch') {
                return;
              }

              swipePointerProps().onPointerDown?.(event);
            },
            onPointerMove(event: PointerEvent) {
              if (event.pointerType === 'touch') {
                return;
              }
              swipePointerProps().onPointerMove?.(event);
            },
            onPointerUp(event: PointerEvent) {
              if (lastPointerType === event.pointerType) {
                lastPointerType = '';
              }
              if (event.pointerType === 'touch') {
                return;
              }
              swipePointerProps().onPointerUp?.(event);
            },
            onPointerCancel(event: PointerEvent) {
              if (lastPointerType === event.pointerType) {
                lastPointerType = '';
              }
              if (event.pointerType === 'touch') {
                return;
              }
              swipePointerProps().onPointerCancel?.(event);
            },
            onTouchStart(event: TouchEvent) {
              const startedFromPenPointerDown = lastPointerType === 'pen' && ignoreNextTouchStartFromPen;
              if (startedFromPenPointerDown) {
                ignoreNextTouchStartFromPen = false;
                ignoreTouchSwipe = false;
                touchScrollState = null;
                return;
              }

              if (!open() || !mounted() || nestedDrawerOpen()) {
                ignoreTouchSwipe = false;
                touchScrollState = null;
                return;
              }

              const touch = event.touches[0];
              if (!touch) {
                return;
              }

              if (isEventOnRangeInput(event, ownerWindow(event.currentTarget as Node | null))) {
                ignoreTouchSwipe = false;
                touchScrollState = null;
                return;
              }

              const doc = ownerDocument(event.currentTarget as Element | null);
              const elementAtPoint = getElementAtPoint(doc, touch.clientX, touch.clientY);
              const rootElement = viewportElement() ?? popupElementState();
              const eventTarget = getTarget(event);
              const target = isElement(eventTarget) ? eventTarget : null;
              if (rootElement && target && !contains(rootElement, target)) {
                ignoreTouchSwipe = true;
                touchScrollState = null;
                return;
              }

              virtualKeyboard?.onTouchStart(event);

              ignoreTouchSwipe = isSwipeIgnoredTarget(elementAtPoint);
              if (ignoreTouchSwipe) {
                touchScrollState = null;
                return;
              }

              let scrollTarget: HTMLElement | null = null;
              let hasCrossAxisScrollableContent = false;
              if (rootElement && target) {
                scrollTarget = findScrollableTouchTarget(target, rootElement, scrollAxis());
                hasCrossAxisScrollableContent =
                  findScrollableTouchTarget(target, rootElement, crossScrollAxis()) != null;
              }

              let allowSwipe: boolean | null = null;
              if (scrollTarget) {
                const canSwipeFromEdge = isAtSwipeStartEdge(scrollTarget, scrollAxis(), swipeDirection());
                allowSwipe = canSwipeFromEdge ? null : false;
              }

              touchScrollState = {
                startX: touch.clientX,
                startY: touch.clientY,
                lastX: touch.clientX,
                lastY: touch.clientY,
                scrollTarget,
                hasCrossAxisScrollableContent,
                allowSwipe,
                preserveNativeCrossAxisScroll: false,
              };

              swipeTouchProps().onTouchStart?.(event);
            },
            onTouchEnd(event: TouchEvent) {
              virtualKeyboard?.onTouchEnd(event);
              resetTouchTrackingState();
              swipeTouchProps().onTouchEnd?.(event);
            },
            onTouchCancel(event: TouchEvent) {
              virtualKeyboard?.onTouchCancel();
              resetTouchTrackingState();
              swipeTouchProps().onTouchCancel?.(event);
            },
          }),
          elementProps,
        ],
        ref: (el: HTMLElement | null) => {
          store.set('viewportElement', el);
        },
        children: () => local.children as JSX.Element,
      })}
    </DrawerViewportContext.Provider>
  );
}

export interface DrawerViewportState {
  /**
   * Whether the drawer is currently open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * Whether the drawer is nested within another drawer.
   */
  nested: boolean;
  /**
   * Whether the drawer has nested drawers open.
   */
  nestedDialogOpen: boolean;
}

export interface DrawerViewportProps extends BaseUIComponentProps<'div', DrawerViewportState> {}

export namespace DrawerViewport {
  export type Props = DrawerViewportProps;
  export type State = DrawerViewportState;
}

function setSwipeDismissedElements(popupElement: HTMLElement | null, backdropElement: HTMLElement | null, dismissed: boolean) {
  if (dismissed) {
    popupElement?.setAttribute(DrawerPopupDataAttributes.swipeDismiss, '');
    backdropElement?.setAttribute(DrawerPopupDataAttributes.swipeDismiss, '');
    return;
  }

  popupElement?.removeAttribute(DrawerPopupDataAttributes.swipeDismiss);
  backdropElement?.removeAttribute(DrawerPopupDataAttributes.swipeDismiss);
}

function setBackdropSwipingAttribute(backdropElement: HTMLElement | null, swiping: boolean) {
  if (!backdropElement) {
    return;
  }

  if (swiping) {
    backdropElement.setAttribute(DrawerPopupDataAttributes.swiping, '');
    return;
  }

  backdropElement.removeAttribute(DrawerPopupDataAttributes.swiping);
}

function isSwipeIgnoredTarget(target: Element | null): boolean {
  return Boolean(target?.closest(BASE_UI_SWIPE_IGNORE_SELECTOR));
}

function isDrawerContentTarget(target: Element | null): boolean {
  return Boolean(target?.closest(DRAWER_CONTENT_SELECTOR));
}

function getBaseSwipeThreshold(element: HTMLElement, direction: SwipeDirection): number {
  const size = direction === 'left' || direction === 'right' ? element.offsetWidth : element.offsetHeight;
  return Math.max(size * 0.5, MIN_SWIPE_THRESHOLD);
}

function isRangeInput(
  target: EventTarget | null | undefined,
  win: ReturnType<typeof ownerWindow>,
): target is HTMLInputElement {
  return target instanceof win.HTMLInputElement && target.type === 'range';
}

function isTextSelectionControl(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!isElement(target)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

function hasExpandedSelectionWithinTarget(selection: Selection, target: Element): boolean {
  const anchorElement = isElement(selection.anchorNode) ? selection.anchorNode : selection.anchorNode?.parentElement;
  const focusElement = isElement(selection.focusNode) ? selection.focusNode : selection.focusNode?.parentElement;

  return (
    selection.containsNode(target, true) ||
    contains(target, anchorElement ?? null) ||
    contains(target, focusElement ?? null)
  );
}

function shouldIgnoreSwipeForTextSelection(doc: Document, rootElement: HTMLElement): boolean {
  const activeEl = activeElement(doc);
  const activeElementWithinRoot = Boolean(activeEl && contains(rootElement, activeEl));

  if (activeElementWithinRoot && isTextSelectionControl(activeEl)) {
    const { selectionStart, selectionEnd } = activeEl as HTMLInputElement;
    if (selectionStart != null && selectionEnd != null && selectionStart < selectionEnd) {
      return true;
    }
  }

  const selection = doc.getSelection?.();
  if (!selection || selection.isCollapsed) {
    return false;
  }

  return hasExpandedSelectionWithinTarget(selection, rootElement);
}

function isEventOnRangeInput(event: TouchEvent, win: ReturnType<typeof ownerWindow>): boolean {
  const composedPath = event.composedPath();
  if (composedPath) {
    return composedPath.some((pathTarget) => isRangeInput(pathTarget, win));
  }

  return isRangeInput(getTarget(event), win);
}

function updateTouchScrollPosition(touchState: TouchScrollState, touch: Touch): void {
  touchState.lastX = touch.clientX;
  touchState.lastY = touch.clientY;
}

function preserveNativeCrossAxisScrollOnMove(touchState: TouchScrollState, touch: Touch, isVerticalScrollAxis: boolean): boolean {
  if (touchState.preserveNativeCrossAxisScroll) {
    return true;
  }

  if (touchState.allowSwipe === true || !touchState.hasCrossAxisScrollableContent) {
    return false;
  }

  const drawerAxisGestureDelta = isVerticalScrollAxis ? touch.clientY - touchState.startY : touch.clientX - touchState.startX;
  const crossAxisGestureDelta = isVerticalScrollAxis ? touch.clientX - touchState.startX : touch.clientY - touchState.startY;
  const absDrawerAxisGestureDelta = Math.abs(drawerAxisGestureDelta);
  const absCrossAxisGestureDelta = Math.abs(crossAxisGestureDelta);

  if (absCrossAxisGestureDelta < 6 || absCrossAxisGestureDelta <= absDrawerAxisGestureDelta + 2) {
    return false;
  }

  touchState.preserveNativeCrossAxisScroll = true;
  return true;
}

function hasScrollableContentOnAxis(scrollTarget: HTMLElement, axis: ScrollAxis): boolean {
  return axis === 'vertical'
    ? scrollTarget.scrollHeight > scrollTarget.clientHeight
    : scrollTarget.scrollWidth > scrollTarget.clientWidth;
}

function getScrollMetrics(scrollTarget: HTMLElement, axis: ScrollAxis) {
  if (axis === 'vertical') {
    const max = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
    return { offset: scrollTarget.scrollTop, max };
  }

  const max = Math.max(0, scrollTarget.scrollWidth - scrollTarget.clientWidth);
  return { offset: scrollTarget.scrollLeft, max };
}

function isAtSwipeStartEdge(scrollTarget: HTMLElement, axis: ScrollAxis, direction: SwipeDirection): boolean {
  const { offset, max } = getScrollMetrics(scrollTarget, axis);
  const dismissFromStartEdge = shouldDismissFromStartEdge(direction, axis);
  if (dismissFromStartEdge === null) {
    return false;
  }

  return dismissFromStartEdge ? offset <= 0 : offset >= max;
}

function canSwipeFromScrollEdgeOnMove(scrollTarget: HTMLElement, axis: ScrollAxis, direction: SwipeDirection, delta: number): boolean {
  const { offset, max } = getScrollMetrics(scrollTarget, axis);
  const dismissFromStartEdge = shouldDismissFromStartEdge(direction, axis);
  if (dismissFromStartEdge === null) {
    return false;
  }

  const movingTowardDismiss = dismissFromStartEdge ? delta > 0 : delta < 0;
  if (!movingTowardDismiss) {
    return false;
  }

  return dismissFromStartEdge ? offset <= 0 : offset >= max;
}

function shouldDismissFromStartEdge(direction: SwipeDirection, axis: ScrollAxis): boolean | null {
  if (axis === 'vertical') {
    if (direction === 'down') {
      return true;
    }
    if (direction === 'up') {
      return false;
    }
    return null;
  }

  if (direction === 'right') {
    return true;
  }
  if (direction === 'left') {
    return false;
  }

  return null;
}
