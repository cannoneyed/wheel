/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, untrack, type Accessor } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useFloatingParentNodeId, useFloatingTree } from '../components/FloatingTree';
import type { FloatingContext, FloatingRootContext } from '../types';
import { contains, getTarget, isInteractiveElement } from '../utils/element';
import { getNodeChildren } from '../utils/nodes';
import {
  applySafePolygonPointerEventsMutation,
  clearSafePolygonPointerEventsMutation,
  useHoverInteractionSharedState,
} from './useHoverInteractionSharedState';
import {
  getDelay,
  isClickLikeOpenEvent as isClickLikeOpenEventShared,
  isHoverOpenEvent,
  isInsideEnabledTrigger,
} from './useHoverShared';

export type UseHoverFloatingInteractionProps = {
  /**
   * Whether the Hook is enabled, including all internal Effects and event
   * handlers.
   * @default true
   */
  enabled?: Accessor<boolean> | undefined;
  /**
   * Waits for the specified time when the event listener runs before changing
   * the `open` state.
   * @default 0
   */
  closeDelay?: Accessor<number> | undefined;
  /**
   * Tree node id override for floating elements that participate in the tree
   * without a `FloatingContext`, such as inline nested navigation menus.
   */
  nodeId?: string | undefined;
};

/**
 * Provides hover interactions that should be attached to the floating element.
 *
 * Solid port of upstream's `useHoverFloatingInteraction`. See the reactivity
 * notes in `useHoverReferenceInteraction.ts` for the general
 * `store.select`/`store.useState` translation rule this file also follows.
 */
export function useHoverFloatingInteraction(
  context: FloatingRootContext | FloatingContext,
  parameters: UseHoverFloatingInteractionProps = {},
): void {
  const enabled = () => parameters.enabled?.() ?? true;
  const closeDelay = () => parameters.closeDelay?.() ?? 0;
  const nodeIdProp = parameters.nodeId;

  const store = 'rootStore' in context ? context.rootStore : context;

  const open = store.useState('open');
  const floatingElement = store.useState('floatingElement');
  const domReferenceElement = store.useState('domReferenceElement');
  const { dataRef } = store.context;

  const tree = useFloatingTree();
  const parentId = useFloatingParentNodeId();
  const instance = useHoverInteractionSharedState(store);

  const childClosedTimeout = createTimeout();

  const isClickLikeOpenEvent = () =>
    isClickLikeOpenEventShared(dataRef.current.openEvent?.type, instance.interactedInside);

  const isHoverOpen = () => isHoverOpenEvent(dataRef.current.openEvent?.type);

  const clearPointerEvents = () => {
    clearSafePolygonPointerEventsMutation(instance);
  };

  createEffect(() => {
    if (!open()) {
      instance.pointerType = undefined;
      instance.restTimeoutPending = false;
      instance.interactedInside = false;
      clearPointerEvents();
    }
  });

  onCleanup(clearPointerEvents);

  // Block pointer-events of every element other than the reference and floating
  // while the floating element is open and has a `handleClose` handler. Also
  // handles nested floating elements.
  // https://github.com/floating-ui/floating-ui/issues/1722
  createEffect(() => {
    if (!enabled()) {
      return;
    }

    const isOpen = open();
    const domRef = domReferenceElement();
    const floating = floatingElement();

    if (
      isOpen &&
      instance.handleCloseOptions?.blockPointerEvents &&
      isHoverOpen() &&
      isElement(domRef) &&
      floating
    ) {
      const ref = domRef as HTMLElement | SVGSVGElement;
      const floatingEl = floating;
      const doc = ownerDocument(floating);

      // Non-reactive: `tree.nodesRef.current` is a plain mutable array, never
      // itself a reactive dependency (matches upstream).
      const parentFloating = untrack(() => {
        const node = tree?.nodesRef.current.find((n) => n.id === parentId);
        return (node?.context?.elements.floating() as HTMLElement | null) ?? null;
      });

      if (parentFloating) {
        parentFloating.style.pointerEvents = '';
      }

      // A keep-mounted submenu can appear in the tree before it opens, so a
      // cached scope or parent lookup may resolve to the submenu itself. That
      // would not shield sibling items in the parent menu.
      const cachedScopeElement =
        instance.pointerEventsScopeElement !== floatingEl
          ? instance.pointerEventsScopeElement
          : null;
      const parentScopeElement = parentFloating !== floatingEl ? parentFloating : null;
      const scopeElement =
        instance.handleCloseOptions?.getScope?.() ??
        cachedScopeElement ??
        parentScopeElement ??
        (ref.closest('[data-rootownerid]') as HTMLElement | SVGSVGElement | null) ??
        doc.body;

      applySafePolygonPointerEventsMutation(instance, {
        scopeElement,
        referenceElement: ref,
        floatingElement: floatingEl,
      });

      onCleanup(() => {
        clearPointerEvents();
      });
    }
  });

  createEffect(() => {
    if (!enabled()) {
      return;
    }

    function hasParentChildren() {
      return !!(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);
    }

    function closeWithDelay(event: MouseEvent) {
      const delayValue = getDelay(closeDelay(), 'close', instance.pointerType);
      const close = () => {
        store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
        tree?.events.emit('floating.closed', event);
      };

      if (delayValue) {
        instance.openChangeTimeout.start(delayValue, close);
      } else {
        instance.openChangeTimeout.clear();
        close();
      }
    }

    function handleInteractInside(event: PointerEvent) {
      const target = getTarget(event) as Element | null;
      if (!isInteractiveElement(target)) {
        instance.interactedInside = false;
        return;
      }

      instance.interactedInside = target?.closest('[aria-haspopup]') != null;
    }

    function onFloatingMouseEnter() {
      instance.openChangeTimeout.clear();
      childClosedTimeout.clear();
      tree?.events.off('floating.closed', onNodeClosed);
      clearPointerEvents();
    }

    function onFloatingMouseLeave(event: MouseEvent) {
      if (hasParentChildren() && tree) {
        tree.events.on('floating.closed', onNodeClosed);
        return;
      }

      if (isInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
        // If the mouse is leaving the reference element to another trigger, don't explicitly close the popup
        // as it will be moved.
        return;
      }

      const currentNodeId = dataRef.current.floatingContext?.nodeId ?? nodeIdProp;
      const relatedTarget = event.relatedTarget;
      const isMovingIntoDescendantFloating =
        tree &&
        currentNodeId &&
        isElement(relatedTarget) &&
        getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node) =>
          contains(node.context?.elements.floating() ?? null, relatedTarget),
        );

      if (isMovingIntoDescendantFloating) {
        return;
      }

      // If the safePolygon handler is active, let it handle the close logic.
      if (instance.handler) {
        instance.handler(event);
        return;
      }

      clearPointerEvents();
      if (isHoverOpen() && !isClickLikeOpenEvent()) {
        closeWithDelay(event);
      }
    }

    function onNodeClosed(event: MouseEvent) {
      if (!tree || !parentId || hasParentChildren()) {
        return;
      }
      // Allow the mouseenter event to fire in case child was closed because mouse moved into parent.
      childClosedTimeout.start(0, () => {
        tree.events.off('floating.closed', onNodeClosed);
        store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
        tree.events.emit('floating.closed', event);
      });
    }

    const floating = floatingElement();
    if (floating) {
      onCleanup(
        mergeCleanups(
          addEventListener(floating, 'mouseenter', onFloatingMouseEnter),
          addEventListener(floating, 'mouseleave', onFloatingMouseLeave),
          addEventListener(floating, 'pointerdown', handleInteractInside, true),
        ),
      );
    }

    onCleanup(() => {
      tree?.events.off('floating.closed', onNodeClosed);
    });
  });
}
