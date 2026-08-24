/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createComputed, createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerDocument } from '../../base-utils/owner';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { FloatingUIOpenChangeDetails, HTMLProps } from '../../internals/types';
import { useFloatingTree } from '../components/FloatingTree';
import type { FloatingTreeStore } from '../components/FloatingTreeStore';
import type { Delay, FloatingContext, FloatingRootContext } from '../types';
import { contains, getTarget } from '../utils/element';
import { isMouseLikePointerType } from '../utils/event';
import {
  applySafePolygonPointerEventsMutation,
  clearSafePolygonPointerEventsMutation,
  useHoverInteractionSharedState,
} from './useHoverInteractionSharedState';
import type { HandleClose, HandleCloseContextBase } from './useHoverShared';
import {
  getDelay,
  getRestMs,
  isClickLikeOpenEvent as isClickLikeOpenEventShared,
  isInsideEnabledTrigger,
  resolveHandleCloseContextBase,
} from './useHoverShared';

export interface UseHoverReferenceInteractionProps {
  enabled?: Accessor<boolean> | undefined;
  /**
   * Deviation: kept as upstream's plain (non-`Accessor`) signature — this is
   * usually a stable factory result (e.g. `safePolygon()`), read once at hook
   * setup rather than re-read reactively.
   */
  handleClose?: HandleClose | null | undefined;
  restMs?: Accessor<number> | undefined;
  delay?: Accessor<Delay> | undefined;
  move?: Accessor<boolean> | undefined;
  mouseOnly?: Accessor<boolean> | undefined;
  externalTree?: FloatingTreeStore | undefined;
  /**
   * Whether the hook controls the active trigger. When false, the props are
   * returned under the `trigger` key so they can be applied to inactive
   * triggers via `getTriggerProps`.
   * @default true
   */
  isActiveTrigger?: Accessor<boolean> | undefined;
  triggerElementRef?: { readonly current: Element | null } | undefined;
  getHandleCloseContext?: (() => HandleCloseContextBase | null) | undefined;
  isClosing?: (() => boolean) | undefined;
  /**
   * Called before each hover-driven open attempt (immediate, delayed, and rest-ms
   * paths). Return `false` to veto; any other return value permits the open.
   */
  shouldOpen?: (() => boolean) | undefined;
  /**
   * Regression workaround (#5152): also cancels a pending hover-open from the
   * trigger's `mouseout`, backing up a `mouseleave` that Chrome can drop during
   * a fast pointer sweep and leave a submenu stuck open.
   *
   * WARNING: only enable on single-trigger, hover-driven roots (e.g.
   * `Menu.SubmenuTrigger`). It skips the `isClickLikeOpenEvent()` and
   * `isInsideEnabledTrigger()` checks `mouseleave` applies, so on a
   * multi-trigger or click-driven root it cancels legitimate opens/closes.
   * @default false
   */
  guardStaleOpen?: Accessor<boolean> | undefined;
}

const EMPTY_REF: { readonly current: Element | null } = { current: null };

/**
 * Provides hover interactions that should be attached to reference or trigger
 * elements.
 *
 * Solid port of upstream's `useHoverReferenceInteraction`.
 *
 * Reactivity notes:
 * - Upstream's `store.select(key)` is a deliberate *non-subscribing* snapshot
 *   read (as opposed to `store.useState(key)`, which subscribes). The Solid
 *   equivalent is simply calling the corresponding `store.useState(key)`
 *   accessor: inside event handlers (fired async, outside any tracked scope)
 *   that's automatically an untracked read; the one place upstream reads a
 *   snapshot *synchronously inside the effect body* (resolving the target
 *   trigger element) is wrapped in `untrack()` below to preserve upstream's
 *   deliberate exclusion of `domReferenceElement` from this effect's rerun
 *   triggers (this hook is built for stable, per-trigger usage — e.g.
 *   `Menu.SubmenuTrigger` — where the resolved trigger doesn't change during
 *   the hook's lifetime; `triggerElementRef`/`isActiveTrigger` are the levers
 *   that do cause a reattachment).
 * - `enabled`/`move`/`isActiveTrigger`/`guardStaleOpen` are read at the top of
 *   the listener-attachment effect (tracked), matching upstream's dependency
 *   array; `delay`/`restMs`/`mouseOnly` are read fresh inside the event
 *   handlers themselves (naturally untracked, like upstream's
 *   `useValueAsRef`-boxed values) so changing them doesn't tear down and
 *   reattach the native listeners.
 */
export function useHoverReferenceInteraction(
  context: FloatingRootContext | FloatingContext,
  props: UseHoverReferenceInteractionProps = {},
): Accessor<HTMLProps<Element> | undefined> {
  const store = 'rootStore' in context ? context.rootStore : context;

  const enabled = () => props.enabled?.() ?? true;
  const delay = () => props.delay?.() ?? 0;
  const handleClose = props.handleClose ?? null;
  const mouseOnly = () => props.mouseOnly?.() ?? false;
  const restMs = () => props.restMs?.() ?? 0;
  const move = () => props.move?.() ?? true;
  const triggerElementRef = props.triggerElementRef ?? EMPTY_REF;
  const isActiveTrigger = () => props.isActiveTrigger?.() ?? true;
  const getHandleCloseContext = props.getHandleCloseContext;
  const isClosingOption = props.isClosing;
  const shouldOpenOption = props.shouldOpen;
  const guardStaleOpen = () => props.guardStaleOpen?.() ?? false;

  const { dataRef, events } = store.context;

  const tree = useFloatingTree(props.externalTree);

  const instance = useHoverInteractionSharedState(store);
  let isHoverCloseActive = false;

  const domReferenceElement = store.useState('domReferenceElement');
  const openState = store.useState('open');
  const transitionStatus = store.useState('transitionStatus');
  const floatingElement = store.useState('floatingElement');

  const isClickLikeOpenEvent = () =>
    isClickLikeOpenEventShared(dataRef.current.openEvent?.type, instance.interactedInside);

  const checkShouldOpen = () => shouldOpenOption?.() !== false;

  const isOverInactiveTrigger = (
    currentDomReference: Element | null,
    currentTarget: Element,
    target: EventTarget | null,
  ): boolean => {
    const allTriggers = store.context.triggerElements;

    // Fast path for normal usage where handlers are attached directly to triggers.
    if (allTriggers.hasElement(currentTarget)) {
      return !currentDomReference || !contains(currentDomReference, currentTarget);
    }

    // Fallback for delegated/wrapper usage where currentTarget may be outside the trigger map.
    if (!isElement(target)) {
      return false;
    }

    const targetElement = target as Element;
    return (
      allTriggers.hasMatchingElement((trigger) => contains(trigger, targetElement)) &&
      (!currentDomReference || !contains(currentDomReference, targetElement))
    );
  };

  const cleanupMouseMoveHandler = () => {
    if (!instance.handler) {
      return;
    }

    const doc = ownerDocument(domReferenceElement());
    doc.removeEventListener('mousemove', instance.handler);
    instance.handler = undefined;
  };

  const clearPointerEvents = () => {
    clearSafePolygonPointerEventsMutation(instance);
  };

  createComputed(() => {
    if (isActiveTrigger()) {
      instance.handleCloseOptions = handleClose?.__options;
    }
  });

  onCleanup(cleanupMouseMoveHandler);

  // When closing before opening, clear the delay timeouts to cancel it
  // from showing.
  createEffect(() => {
    if (!enabled()) {
      return;
    }

    function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
      if (!details.open) {
        isHoverCloseActive = details.reason === REASONS.triggerHover;
        cleanupMouseMoveHandler();
        instance.openChangeTimeout.clear();
        instance.restTimeout.clear();
        instance.blockMouseMove = true;
        instance.restTimeoutPending = false;
      } else {
        isHoverCloseActive = false;
      }
    }

    events.on('openchange', onOpenChangeLocal);
    onCleanup(() => {
      events.off('openchange', onOpenChangeLocal);
    });
  });

  createEffect(() => {
    if (!enabled()) {
      return;
    }

    // Tracked: reattach the native listeners when any of these change.
    const moveValue = move();
    const isActiveTriggerValue = isActiveTrigger();
    const guardStaleOpenValue = guardStaleOpen();

    function closeWithDelay(event: MouseEvent, runElseBranch = true) {
      const closeDelay = getDelay(delay(), 'close', instance.pointerType);
      if (closeDelay) {
        instance.openChangeTimeout.start(closeDelay, () => {
          store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
          tree?.events.emit('floating.closed', event);
        });
      } else if (runElseBranch) {
        instance.openChangeTimeout.clear();
        store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
        tree?.events.emit('floating.closed', event);
      }
    }

    // Untracked: mirrors upstream's `store.select(...)` snapshot read — this
    // hook intentionally doesn't reattach when the resolved element changes.
    const trigger = untrack(
      () =>
        (triggerElementRef.current as HTMLElement | null) ??
        (isActiveTriggerValue ? (domReferenceElement() as HTMLElement | null) : null),
    );

    if (!isElement(trigger)) {
      return;
    }

    function onMouseEnter(event: MouseEvent) {
      instance.openChangeTimeout.clear();
      instance.blockMouseMove = false;

      if (mouseOnly() && !isMouseLikePointerType(instance.pointerType)) {
        return;
      }

      // Only rest delay is set; there's no fallback delay.
      // This will be handled by `onMouseMove`.
      const restMsValue = getRestMs(restMs());
      const openDelay = getDelay(delay(), 'open', instance.pointerType);
      const eventTarget = getTarget(event);
      const currentTarget = (event.currentTarget as HTMLElement) ?? null;
      const currentDomReference = domReferenceElement();
      let triggerNode = currentTarget;

      // Wrapper/delegated mode: resolve the actual trigger from the event target.
      if (isElement(eventTarget) && !store.context.triggerElements.hasElement(eventTarget)) {
        for (const triggerElement of store.context.triggerElements.elements()) {
          if (contains(triggerElement, eventTarget)) {
            triggerNode = triggerElement as HTMLElement;
            break;
          }
        }
      }

      // Wrapper/delegated mode fallback: if the wrapper contains the active trigger,
      // treat this as re-entering that active trigger.
      if (
        isElement(currentTarget) &&
        isElement(currentDomReference) &&
        !store.context.triggerElements.hasElement(currentTarget) &&
        contains(currentTarget, currentDomReference)
      ) {
        triggerNode = currentDomReference as HTMLElement;
      }

      const isOverInactive =
        triggerNode == null
          ? false
          : isOverInactiveTrigger(currentDomReference, triggerNode, eventTarget);
      const isOpen = openState();
      const isInClosingTransition = isClosingOption?.() ?? transitionStatus() === 'ending';
      const isHoverCloseTransition = !isOpen && isInClosingTransition && isHoverCloseActive;
      const isReenteringSameTriggerDuringCloseTransition =
        !isOverInactive &&
        isElement(triggerNode) &&
        isElement(currentDomReference) &&
        contains(currentDomReference, triggerNode) &&
        isHoverCloseTransition;
      const isRestOnlyDelay = restMsValue > 0 && !openDelay;
      const shouldOpenImmediately =
        (isOverInactive && (isOpen || isHoverCloseTransition)) ||
        isReenteringSameTriggerDuringCloseTransition;

      const shouldOpenNow = !isOpen || isOverInactive;

      // Open immediately when moving between triggers while open, or during
      // a hover-driven close transition (including same-trigger re-entry).
      if (shouldOpenImmediately) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode));
        }
        return;
      }

      if (isRestOnlyDelay) {
        return;
      }

      if (openDelay) {
        instance.openChangeTimeout.start(openDelay, () => {
          if (shouldOpenNow && checkShouldOpen()) {
            store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode));
          }
        });
      } else if (shouldOpenNow) {
        if (checkShouldOpen()) {
          store.setOpen(true, createChangeEventDetails(REASONS.triggerHover, event, triggerNode));
        }
      }
    }

    function onMouseLeave(event: MouseEvent) {
      if (isClickLikeOpenEvent()) {
        clearPointerEvents();
        return;
      }

      cleanupMouseMoveHandler();

      const currentDomReferenceElement = domReferenceElement();
      const doc = ownerDocument(currentDomReferenceElement);
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;

      const handleCloseContextBase = dataRef.current.floatingContext ?? getHandleCloseContext?.();

      if (isInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        return;
      }

      if (handleClose && handleCloseContextBase) {
        if (!openState()) {
          instance.openChangeTimeout.clear();
        }

        const currentTrigger = triggerElementRef.current;

        instance.handler = handleClose({
          ...resolveHandleCloseContextBase(handleCloseContextBase),
          tree,
          x: event.clientX,
          y: event.clientY,
          onClose() {
            clearPointerEvents();
            cleanupMouseMoveHandler();
            if (
              enabled() &&
              !isClickLikeOpenEvent() &&
              currentTrigger === domReferenceElement()
            ) {
              closeWithDelay(event, true);
            }
          },
        });

        doc.addEventListener('mousemove', instance.handler);
        instance.handler(event);

        return;
      }

      const shouldClose =
        instance.pointerType === 'touch'
          ? !contains(floatingElement(), event.relatedTarget as Element | null)
          : true;

      if (shouldClose) {
        closeWithDelay(event);
      }
    }

    // Backup cancellation for Chrome's dropped `mouseleave` — see `guardStaleOpen`.
    function onMouseOut(event: MouseEvent) {
      if (contains(trigger, event.relatedTarget as Element | null)) {
        return; // moved within the trigger's own subtree
      }
      instance.openChangeTimeout.clear();
      instance.restTimeout.clear();
      instance.restTimeoutPending = false;
    }

    const staleOpenGuard = guardStaleOpenValue
      ? addEventListener(trigger, 'mouseout', onMouseOut)
      : undefined;

    if (moveValue) {
      onCleanup(
        mergeCleanups(
          addEventListener(trigger, 'mousemove', onMouseEnter, { once: true }),
          addEventListener(trigger, 'mouseenter', onMouseEnter),
          addEventListener(trigger, 'mouseleave', onMouseLeave),
          staleOpenGuard,
        ),
      );
    } else {
      onCleanup(
        mergeCleanups(
          addEventListener(trigger, 'mouseenter', onMouseEnter),
          addEventListener(trigger, 'mouseleave', onMouseLeave),
          staleOpenGuard,
        ),
      );
    }
  });

  return (): HTMLProps<Element> | undefined => {
    if (!enabled()) {
      return undefined;
    }

    function setPointerRef(event: PointerEvent) {
      instance.pointerType = event.pointerType;
    }

    return {
      onPointerDown: setPointerRef,
      onPointerEnter: setPointerRef,
      onMouseMove(event: MouseEvent) {
        const nativeEvent = event;
        const trigger = event.currentTarget as HTMLElement;

        const currentDomReference = domReferenceElement();
        const currentOpen = openState();
        const isOverInactive = isOverInactiveTrigger(currentDomReference, trigger, event.target);

        if (mouseOnly() && !isMouseLikePointerType(instance.pointerType)) {
          return;
        }

        if (currentOpen && isOverInactive && instance.handleCloseOptions?.blockPointerEvents) {
          const currentFloatingElement = floatingElement();

          if (currentFloatingElement) {
            const scopeElement =
              instance.handleCloseOptions?.getScope?.() ?? trigger.ownerDocument.body;

            applySafePolygonPointerEventsMutation(instance, {
              scopeElement,
              referenceElement: trigger,
              floatingElement: currentFloatingElement,
            });
          }
        }

        const restMsValue = getRestMs(restMs());
        if ((currentOpen && !isOverInactive) || restMsValue === 0) {
          return;
        }

        if (
          !isOverInactive &&
          instance.restTimeoutPending &&
          event.movementX ** 2 + event.movementY ** 2 < 2
        ) {
          return;
        }

        instance.restTimeout.clear();

        function handleMouseMove() {
          instance.restTimeoutPending = false;

          // A delayed hover open should not override a click-like open that happened
          // while the hover delay was pending.
          if (isClickLikeOpenEvent()) {
            return;
          }

          const latestOpen = openState();

          if (!instance.blockMouseMove && (!latestOpen || isOverInactive) && checkShouldOpen()) {
            store.setOpen(
              true,
              createChangeEventDetails(REASONS.triggerHover, nativeEvent, trigger),
            );
          }
        }

        if (instance.pointerType === 'touch') {
          handleMouseMove();
        } else if (isOverInactive && currentOpen) {
          handleMouseMove();
        } else {
          instance.restTimeoutPending = true;
          instance.restTimeout.start(restMsValue, handleMouseMove);
        }
      },
    };
  };
}
