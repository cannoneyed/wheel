/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { FloatingUIOpenChangeDetails } from '../../internals/types';
import { useFloatingParentNodeId, useFloatingTree } from '../components/FloatingTree';
import type { Delay, ElementProps, FloatingContext, FloatingRootContext } from '../types';
import { contains, getTarget, isInteractiveElement } from '../utils/element';
import type { HandleClose } from './useHoverShared';
import {
  getDelay,
  getRestMs,
  isClickLikeOpenEvent as isClickLikeOpenEventShared,
  isHoverOpenEvent,
  resolveHandleCloseContextBase,
} from './useHoverShared';

export type { HandleCloseContext, HandleClose } from './useHoverShared';

export interface UseHoverProps {
  /**
   * Accepts an event handler that runs on `mousemove` to control when the
   * floating element closes once the cursor leaves the reference element.
   * Deviation: kept as upstream's plain (non-`Accessor`) signature — this is
   * usually a stable factory result (e.g. `safePolygon()`).
   * @default null
   */
  handleClose?: HandleClose | null | undefined;
  /**
   * Waits until the user's cursor is at “rest” over the reference element
   * before changing the `open` state.
   * @default 0
   */
  restMs?: Accessor<number> | undefined;
  /**
   * Waits for the specified time when the event listener runs before changing
   * the `open` state.
   * @default 0
   */
  delay?: Accessor<Delay> | undefined;
  /**
   * Whether moving the cursor over the floating element will open it, without a
   * regular hover event required.
   * @default true
   */
  move?: Accessor<boolean> | undefined;
}

/**
 * Opens the floating element while hovering over the reference element, like
 * CSS `:hover`.
 * @see https://floating-ui.com/docs/useHover
 *
 * Solid port of upstream's `useHover`. This is the classic, monolithic
 * combined hook (kept for public-API/library-consumer parity); Base UI's own
 * components use the split `useHoverReferenceInteraction`/
 * `useHoverFloatingInteraction` pair instead. See the reactivity notes in
 * `useHoverReferenceInteraction.ts` for the `store.select`/`store.useState`
 * translation rule this file also follows.
 */
export function useHover(
  context: FloatingRootContext | FloatingContext,
  props: UseHoverProps = {},
): ElementProps {
  const delay = () => props.delay?.() ?? 0;
  const handleClose = props.handleClose ?? null;
  const restMs = () => props.restMs?.() ?? 0;
  const move = () => props.move?.() ?? true;

  const store = 'rootStore' in context ? context.rootStore : context;

  const open = store.useState('open');
  const floatingElement = store.useState('floatingElement');
  const domReferenceElement = store.useState('domReferenceElement');
  const { dataRef, events } = store.context;

  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();

  let pointerType: string | undefined;
  let interactedInside = false;
  let handler: ((event: MouseEvent) => void) | undefined;
  let blockMouseMove = true;
  let performedPointerEventsMutation = false;
  let unbindMouseMove: () => void = () => {};
  let restTimeoutPending = false;

  const timeout = createTimeout();
  const restTimeout = createTimeout();

  const isHoverOpen = () => isHoverOpenEvent(dataRef.current.openEvent?.type);

  const isClickLikeOpenEvent = () =>
    isClickLikeOpenEventShared(dataRef.current.openEvent?.type, interactedInside);

  const cleanupMouseMoveHandler = () => {
    unbindMouseMove();
    handler = undefined;
  };

  const clearPointerEvents = () => {
    if (performedPointerEventsMutation) {
      const body = ownerDocument(floatingElement()).body;
      body.style.pointerEvents = '';
      performedPointerEventsMutation = false;
    }
  };

  // When closing before opening, clear the delay timeouts to cancel it
  // from showing.
  createEffect(() => {
    function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
      if (!details.open) {
        timeout.clear();
        restTimeout.clear();
        blockMouseMove = true;
        restTimeoutPending = false;
      }
    }

    events.on('openchange', onOpenChangeLocal);
    onCleanup(() => {
      events.off('openchange', onOpenChangeLocal);
    });
  });

  createEffect(() => {
    if (!handleClose) {
      return;
    }

    if (!open()) {
      return;
    }

    function onLeave(event: MouseEvent) {
      if (isClickLikeOpenEvent()) {
        return;
      }

      if (isHoverOpen()) {
        store.setOpen(
          false,
          createChangeEventDetails(
            REASONS.triggerHover,
            event,
            (event.currentTarget as HTMLElement) ?? undefined,
          ),
        );
      }
    }

    const html = ownerDocument(floatingElement()).documentElement;
    onCleanup(addEventListener(html, 'mouseleave', onLeave));
  });

  // Registering the mouse events on the reference directly to bypass any
  // event-delegation system. If the cursor was on a disabled element and then
  // entered the reference (no gap), a delegated `mouseenter` may not fire.
  createEffect(() => {
    const moveValue = move();
    const domReferenceElementValue = domReferenceElement();
    const floatingElementValue = floatingElement();
    const isOpen = open();

    function closeWithDelay(event: MouseEvent, runElseBranch = true) {
      const closeDelay = getDelay(delay(), 'close', pointerType);
      if (closeDelay && !handler) {
        timeout.start(closeDelay, () =>
          store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event)),
        );
      } else if (runElseBranch) {
        timeout.clear();
        store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
      }
    }

    function handleInteractInside(event: PointerEvent) {
      const target = getTarget(event) as Element | null;
      if (!isInteractiveElement(target)) {
        interactedInside = false;
        return;
      }

      interactedInside = true;
    }

    function getHandleCloseHandler(event: MouseEvent, onClose: () => void) {
      const floatingContext = dataRef.current.floatingContext;
      if (!handleClose || !floatingContext) {
        return null;
      }

      return handleClose({
        ...resolveHandleCloseContextBase(floatingContext),
        tree,
        x: event.clientX,
        y: event.clientY,
        onClose,
      });
    }

    function onReferenceMouseEnter(event: MouseEvent) {
      timeout.clear();
      blockMouseMove = false;

      if (getRestMs(restMs()) > 0 && !getDelay(delay(), 'open')) {
        return;
      }

      const openDelay = getDelay(delay(), 'open', pointerType);
      const trigger = (event.currentTarget as HTMLElement) ?? undefined;

      const domReference = domReferenceElement();

      const isOverInactiveTrigger = domReference && trigger && !contains(domReference, trigger);

      if (openDelay) {
        timeout.start(openDelay, () => {
          if (!open()) {
            store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, trigger));
          }
        });
      } else if (!isOpen || isOverInactiveTrigger) {
        store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, trigger));
      }
    }

    function onReferenceMouseLeave(event: MouseEvent) {
      if (isClickLikeOpenEvent()) {
        clearPointerEvents();
        return;
      }

      unbindMouseMove();

      const doc = ownerDocument(floatingElementValue);
      restTimeout.clear();
      restTimeoutPending = false;

      const triggers = store.context.triggerElements;

      if (event.relatedTarget && triggers.hasElement(event.relatedTarget as Element)) {
        // If the mouse is leaving the reference element to another trigger, don't explicitly close the popup
        // as it will be moved.
        return;
      }

      const closeHandler = getHandleCloseHandler(event, () => {
        clearPointerEvents();
        cleanupMouseMoveHandler();
        if (!isClickLikeOpenEvent()) {
          closeWithDelay(event, true);
        }
      });

      if (closeHandler) {
        // Prevent clearing `onScrollMouseLeave` timeout.
        if (!open()) {
          timeout.clear();
        }

        handler = closeHandler;
        unbindMouseMove = addEventListener(doc, 'mousemove', closeHandler);

        return;
      }

      // Allow interactivity without `safePolygon` on touch devices. With a
      // pointer, a short close delay is an alternative, so it should work
      // consistently.
      const shouldClose =
        pointerType === 'touch'
          ? !contains(floatingElementValue, event.relatedTarget as Element | null)
          : true;
      if (shouldClose) {
        closeWithDelay(event);
      }
    }

    // Ensure the floating element closes after scrolling even if the pointer
    // did not move.
    // https://github.com/floating-ui/floating-ui/discussions/1692
    function onScrollMouseLeave(event: MouseEvent) {
      if (isClickLikeOpenEvent() || !dataRef.current.floatingContext || !open()) {
        return;
      }

      const triggers = store.context.triggerElements;

      if (event.relatedTarget && triggers.hasElement(event.relatedTarget as Element)) {
        // If the mouse is leaving the reference element to another trigger, don't explicitly close the popup
        // as it will be moved.
        return;
      }

      getHandleCloseHandler(event, () => {
        clearPointerEvents();
        cleanupMouseMoveHandler();
        if (!isClickLikeOpenEvent()) {
          closeWithDelay(event);
        }
      })?.(event);
    }

    function onFloatingMouseEnter() {
      timeout.clear();
      clearPointerEvents();
    }

    function onFloatingMouseLeave(event: MouseEvent) {
      if (!isClickLikeOpenEvent()) {
        closeWithDelay(event, false);
      }
    }

    const trigger = domReferenceElementValue as HTMLElement | null;

    if (isElement(trigger)) {
      const floating = floatingElementValue;

      onCleanup(
        mergeCleanups(
          isOpen && addEventListener(trigger, 'mouseleave', onScrollMouseLeave),
          moveValue && addEventListener(trigger, 'mousemove', onReferenceMouseEnter, { once: true }),
          addEventListener(trigger, 'mouseenter', onReferenceMouseEnter),
          addEventListener(trigger, 'mouseleave', onReferenceMouseLeave),
          floating && addEventListener(floating, 'mouseleave', onScrollMouseLeave),
          floating && addEventListener(floating, 'mouseenter', onFloatingMouseEnter),
          floating && addEventListener(floating, 'mouseleave', onFloatingMouseLeave),
          floating && addEventListener(floating, 'pointerdown', handleInteractInside, true),
        ),
      );
    }
  });

  // Block pointer-events of every element other than the reference and floating
  // while the floating element is open and has a `handleClose` handler. Also
  // handles nested floating elements.
  // https://github.com/floating-ui/floating-ui/issues/1722
  createEffect(() => {
    const isOpen = open();
    const domRef = domReferenceElement();
    const floatingEl = floatingElement();

    if (isOpen && handleClose?.__options?.blockPointerEvents && isHoverOpen()) {
      performedPointerEventsMutation = true;

      if (isElement(domRef) && floatingEl) {
        const body = ownerDocument(floatingEl).body;
        const ref = domRef as HTMLElement | SVGSVGElement;

        // Non-reactive: `tree.nodesRef.current` is a plain mutable array,
        // never itself a reactive dependency (matches upstream).
        const parentFloating = untrack(() => {
          const node = tree?.nodesRef.current.find((n) => n.id === parentId);
          return (node?.context?.elements.floating() as HTMLElement | null) ?? null;
        });

        if (parentFloating) {
          parentFloating.style.pointerEvents = '';
        }

        body.style.pointerEvents = 'none';
        ref.style.pointerEvents = 'auto';
        floatingEl.style.pointerEvents = 'auto';

        onCleanup(() => {
          body.style.pointerEvents = '';
          ref.style.pointerEvents = '';
          floatingEl.style.pointerEvents = '';
        });
      }
    }
  });

  createEffect(() => {
    if (!open()) {
      pointerType = undefined;
      restTimeoutPending = false;
      interactedInside = false;
      cleanupMouseMoveHandler();
      clearPointerEvents();
    }
  });

  createEffect(() => {
    // Track option changes so a reference-element swap clears any pending
    // open/close timers scheduled against the previous element.
    domReferenceElement();

    onCleanup(() => {
      cleanupMouseMoveHandler();
      timeout.clear();
      restTimeout.clear();
      interactedInside = false;
    });
  });

  onCleanup(clearPointerEvents);

  function setPointerRef(event: PointerEvent) {
    pointerType = event.pointerType;
  }

  const reference: ElementProps['reference'] = {
    onPointerDown: setPointerRef,
    onPointerEnter: setPointerRef,
    onMouseMove(event: MouseEvent) {
      const nativeEvent = event;
      const trigger = event.currentTarget as HTMLElement;

      // `true` when there are multiple triggers per floating element and user hovers over the one that
      // wasn't used to open the floating element.
      const currentDomReference = domReferenceElement();
      const isOverInactiveTrigger =
        currentDomReference && !contains(currentDomReference, event.target as Element | null);

      function handleMouseMove() {
        if (!blockMouseMove && (!open() || isOverInactiveTrigger)) {
          store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, nativeEvent, trigger));
        }
      }

      if ((open() && !isOverInactiveTrigger) || getRestMs(restMs()) === 0) {
        return;
      }

      // Ignore insignificant movements to account for tremors.
      if (
        !isOverInactiveTrigger &&
        restTimeoutPending &&
        event.movementX ** 2 + event.movementY ** 2 < 2
      ) {
        return;
      }

      restTimeout.clear();

      if (pointerType === 'touch') {
        handleMouseMove();
      } else if (isOverInactiveTrigger) {
        handleMouseMove();
      } else {
        restTimeoutPending = true;
        restTimeout.start(getRestMs(restMs()), handleMouseMove);
      }
    },
  };

  return { reference };
}
