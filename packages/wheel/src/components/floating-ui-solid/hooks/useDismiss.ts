/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, onCleanup, type Accessor } from 'solid-js';
import {
  getComputedStyle,
  getParentNode,
  isElement,
  isHTMLElement,
  isLastTraversableNode,
  isShadowRoot,
} from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { ownerDocument } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { componentRuntime } from '../../base-utils/runtime';
import { platform } from '../../base-utils/platform/index';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useFloatingTree } from '../components/FloatingTree';
import { FloatingTreeStore } from '../components/FloatingTreeStore';
import type { ElementProps, FloatingContext, FloatingRootContext } from '../types';
import { createAttribute } from '../utils/createAttribute';
import { contains, getTarget, isEventTargetWithin, isRootElement } from '../utils/element';
import { getNodeChildren } from '../utils/nodes';

type PressType = 'intentional' | 'sloppy';

/**
 * Normalizes the `bubbles` prop into per-behavior booleans.
 * Ported unchanged (framework-neutral) from upstream, which also reuses it
 * for a test-only `capture` concept — this fork has no `capture` option, the
 * document listeners here are always attached in the capture phase.
 */
export function normalizeProp(
  normalizable?: boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined },
) {
  return {
    escapeKey:
      typeof normalizable === 'boolean' ? normalizable : (normalizable?.escapeKey ?? false),
    outsidePress:
      typeof normalizable === 'boolean' ? normalizable : (normalizable?.outsidePress ?? true),
  };
}

export interface UseDismissProps {
  /**
   * Whether the Hook is enabled, including all internal effects and event
   * handlers.
   * @default true
   */
  enabled?: Accessor<boolean> | undefined;
  /**
   * Whether to dismiss the floating element upon pressing the `esc` key.
   * @default true
   */
  escapeKey?: Accessor<boolean> | undefined;
  /**
   * Whether to dismiss the floating element upon pressing the reference
   * element. You likely want to ensure the `move` option in the `useHover()`
   * Hook has been disabled when this is in use.
   *
   * A lazy getter invoked when handling reference press events.
   * @default false
   */
  referencePress?: Accessor<boolean> | undefined;
  /**
   * Whether to dismiss the floating element upon pressing outside of the
   * floating element.
   * If you have another element, like a toast, that is rendered outside the
   * floating element's tree and don't want the floating element to close
   * when pressing it, you can guard the check like so:
   * ```jsx
   * useDismiss(context, {
   *   outsidePress: () => (event) => !event.target.closest('.toast'),
   * });
   * ```
   * @default true
   */
  outsidePress?: Accessor<boolean | ((event: MouseEvent | TouchEvent) => boolean)> | undefined;
  /**
   * The type of event to use to determine an outside "press".
   * - `intentional` requires the user to click outside intentionally, firing on `pointerup` for mouse, and requiring minimal `touchmove`s for touch.
   * - `sloppy` fires on `pointerdown` for mouse, while for touch it fires on `touchend` (within 1 second) or while scrolling away after `touchstart`.
   * @default 'sloppy'
   */
  outsidePressEvent?: Accessor<PressType | { mouse: PressType; touch: PressType }> | undefined;
  /**
   * Determines whether event listeners bubble upwards through a tree of
   * floating elements.
   */
  bubbles?:
    | Accessor<boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined }>
    | undefined;
  /**
   * External FloatingTree to use when the one provided by context can't be used.
   */
  externalTree?: FloatingTreeStore | undefined;
}

/**
 * Closes the floating element when a dismissal is requested — by default, when
 * the user presses the `escape` key or outside of the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 *
 * Solid port of upstream's `useDismiss`. Upstream memoizes `reference`/
 * `floating` via `useMemo` and gates the whole returned `ElementProps` object
 * on `enabled` (`enabled ? { reference, floating, trigger } : {}`); here the
 * hook body runs once, so `reference`/`floating` are stable plain objects and
 * every handler starts with an `enabled()` check instead — same observable
 * behavior (fully inert while disabled) without needing to re-run hook setup.
 *
 * `React.useRef`s that hold mutable, non-rendered bookkeeping (drag/press
 * state, composition flags, the current pointer type) become plain `let`
 * bindings closed over by the hook's functions; `React.useEffect`'s
 * dependency array collapses to whatever accessors are read directly inside
 * `createEffect`, which is why `store.state.open`/`enabled()`/`escapeKey()`/
 * `bubbles()` are read at the top of the effect instead of being captured
 * once outside it.
 */
export function useDismiss(
  context: FloatingRootContext | FloatingContext,
  props: UseDismissProps = {},
): ElementProps {
  const enabled = () => props.enabled?.() ?? true;
  const escapeKey = () => props.escapeKey?.() ?? true;
  const referencePress = () => props.referencePress?.() ?? false;
  const outsidePress = () => props.outsidePress?.() ?? true;
  const outsidePressEnabled = () => outsidePress() !== false;
  const outsidePressEvent = () => props.outsidePressEvent?.() ?? 'sloppy';
  const bubbles = () => props.bubbles?.();

  const store = 'rootStore' in context ? context.rootStore : context;
  const dataRef = store.context.dataRef;

  const tree = useFloatingTree(props.externalTree);

  let pressStartedInside = false;
  let pressStartPrevented = false;
  // Ignore only the very next outside click after dragging from inside to outside.
  let suppressNextOutsideClick = false;
  let isComposing = false;
  let currentPointerType: PointerEvent['pointerType'] = '';

  let touchState: {
    startTime: number;
    startX: number;
    startY: number;
    dismissOnTouchEnd: boolean;
    dismissOnMouseDown: boolean;
  } | null = null;

  const cancelDismissOnEndTimeout = createTimeout();
  const clearInsideReactTreeTimeout = createTimeout();

  function clearInsideReactTree() {
    clearInsideReactTreeTimeout.clear();
    dataRef.current.insideReactTree = false;
  }

  function hasBlockingChild(bubbleKey: '__escapeKeyBubbles' | '__outsidePressBubbles') {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];

    return children.some(
      (child) => child.context?.open() && !child.context.dataRef.current[bubbleKey],
    );
  }

  /**
   * Collects ALL descendant node ids (open or closed) of this instance's
   * tree node. `getNodeChildren` filters to open children, which is exactly
   * what makes it blind to a descendant that closed synchronously during the
   * current event dispatch (see `descendantDismissedDuringEvent`).
   */
  function getDescendantNodeIds(): string[] {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    if (!tree || nodeId == null) {
      return [];
    }
    const nodes = tree.nodesRef.current;
    const result: string[] = [];
    let frontier = [nodeId];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const node of nodes) {
        if (node.id != null && node.parentId != null && frontier.includes(node.parentId)) {
          result.push(node.id);
          next.push(node.id);
        }
      }
      frontier = next;
    }
    return result;
  }

  /**
   * Whether a DESCENDANT instance already dismissed on this very event.
   * In React, a child that closes during the same event dispatch is still
   * observed as open by ancestors (batched state); Solid's writes are
   * synchronous, so `hasBlockingChild` can miss it depending on listener
   * order. Dismissing instances tag the event with their node id (below),
   * making the check order-independent. Sibling popups are unaffected —
   * only descendants block.
   */
  function descendantDismissedDuringEvent(event: Event): boolean {
    const dismissedIds: string[] = (event as any).__baseUIDismissedNodeIds ?? [];
    if (dismissedIds.length === 0) {
      return false;
    }
    const descendantIds = getDescendantNodeIds();
    return dismissedIds.some((id) => descendantIds.includes(id));
  }

  function tagEventAsDismissed(event: Event) {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    if (nodeId == null) {
      return;
    }
    const dismissedIds: string[] = ((event as any).__baseUIDismissedNodeIds ??= []);
    dismissedIds.push(nodeId);
  }

  function isEventWithinOwnElements(event: Event) {
    return (
      isEventTargetWithin(event, store.state.floatingElement) ||
      isEventTargetWithin(event, store.state.domReferenceElement)
    );
  }

  function isEventWithinFloatingTree(event: Event) {
    const nodeId = dataRef.current.floatingContext?.nodeId;
    const targetIsInsideChildren =
      tree &&
      getNodeChildren(tree.nodesRef.current, nodeId).some((node) =>
        isEventTargetWithin(event, node.context?.elements.floating() ?? null),
      );

    return isEventWithinOwnElements(event) || targetIsInsideChildren;
  }

  function closeOnReferencePress(event: MouseEvent | PointerEvent | TouchEvent | KeyboardEvent) {
    if (!enabled() || !referencePress()) {
      return;
    }

    store.setOpen(false, createChangeEventDetails(REASONS.triggerPress, event));
  }

  function closeOnEscapeKeyDown(event: KeyboardEvent) {
    if (!store.state.open || !enabled() || !escapeKey() || event.key !== 'Escape') {
      return;
    }

    // Wait until IME is settled. Pressing `Escape` while composing should
    // close the compose menu, but not the floating element.
    if (isComposing) {
      return;
    }

    const escapeKeyBubbles = normalizeProp(bubbles()).escapeKey;
    if (
      !escapeKeyBubbles &&
      (hasBlockingChild('__escapeKeyBubbles') || descendantDismissedDuringEvent(event))
    ) {
      return;
    }

    const eventDetails = createChangeEventDetails(REASONS.escapeKey, event);

    store.setOpen(false, eventDetails);

    if (!eventDetails.isCanceled) {
      event.preventDefault();
      // Only a NON-bubbling dismissal blocks ancestors (mirrors
      // hasBlockingChild): a bubbling child wants ancestors to close too.
      if (!escapeKeyBubbles) {
        tagEventAsDismissed(event);
      }
    }

    if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
      event.stopPropagation();
    }
  }

  function markInsideReactTree() {
    if (!enabled()) {
      return;
    }

    dataRef.current.insideReactTree = true;
    clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
  }

  function markPressStartedInsideReactTree(event: PointerEvent | MouseEvent) {
    if (!store.state.open || !enabled() || event.button !== 0) {
      return;
    }

    // A portaled descendant is outside the parent's DOM node, but it is still
    // inside the same logical floating tree and must start an inside press.
    if (!isEventWithinFloatingTree(event)) {
      return;
    }

    if (!pressStartedInside) {
      pressStartedInside = true;
      pressStartPrevented = false;
    }
  }

  function markInsidePressStartPrevented(event: PointerEvent | MouseEvent) {
    if (!store.state.open || !enabled()) {
      return;
    }

    if (!event.defaultPrevented) {
      return;
    }

    if (pressStartedInside) {
      pressStartPrevented = true;
    }
  }

  createEffect(() => {
    if (!store.state.open || !enabled()) {
      return;
    }

    const { escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles } = normalizeProp(
      bubbles(),
    );
    dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
    dataRef.current.__outsidePressBubbles = outsidePressBubbles;

    const escapeKeyOn = escapeKey();
    const outsidePressOn = outsidePressEnabled();

    const compositionTimeout = createTimeout();
    const preventedPressSuppressionTimeout = createTimeout();

    function handleCompositionStart() {
      compositionTimeout.clear();
      isComposing = true;
    }

    function handleCompositionEnd() {
      // Safari fires `compositionend` before `keydown`, so we need to wait
      // until the next tick to set `isComposing` to `false`.
      // https://bugs.webkit.org/show_bug.cgi?id=165004
      compositionTimeout.start(
        // 0ms or 1ms don't work in Safari. 5ms appears to consistently work.
        // Only apply to WebKit for the test to remain 0ms.
        platform.engine.webkit ? 5 : 0,
        () => {
          isComposing = false;
        },
      );
    }

    function suppressImmediateOutsideClickAfterPreventedStart() {
      suppressNextOutsideClick = true;
      // Firefox can emit the synthetic outside click in a later task after
      // pointer lock exit, so microtask clearing is too early here.
      preventedPressSuppressionTimeout.start(0, () => {
        suppressNextOutsideClick = false;
      });
    }

    function resetPressStartState() {
      pressStartedInside = false;
      pressStartPrevented = false;
    }

    function getOutsidePressEvent(): PressType {
      const type = currentPointerType as 'pen' | 'mouse' | 'touch' | '';
      const computedType = type === 'pen' || !type ? 'mouse' : type;

      const resolved = outsidePressEvent();

      if (typeof resolved === 'string') {
        return resolved;
      }

      return resolved[computedType];
    }

    function shouldIgnoreEvent(event: Event) {
      const computedOutsidePressEvent = getOutsidePressEvent();
      return (
        (computedOutsidePressEvent === 'intentional' && event.type !== 'click') ||
        (computedOutsidePressEvent === 'sloppy' && event.type === 'click')
      );
    }

    function closeOnPressOutside(event: MouseEvent | PointerEvent | TouchEvent) {
      if (shouldIgnoreEvent(event)) {
        // A new press began outside the floating element and its trigger. Clear any
        // leftover drag-out suppression so this press's eventual click can dismiss.
        if (event.type !== 'click' && !isEventWithinOwnElements(event)) {
          preventedPressSuppressionTimeout.clear();
          suppressNextOutsideClick = false;
        }
        clearInsideReactTree();
        return;
      }

      if (dataRef.current.insideReactTree) {
        clearInsideReactTree();
        return;
      }

      const target = getTarget(event);
      const inertSelector = `[${createAttribute('inert')}]`;
      const targetRoot = isElement(target) ? target.getRootNode() : null;
      const markers = Array.from(
        (isShadowRoot(targetRoot)
          ? targetRoot
          : ownerDocument(store.state.floatingElement)
        ).querySelectorAll(inertSelector),
      );

      const triggers = store.context.triggerElements;

      // If another trigger is clicked, don't close the floating element.
      if (
        target &&
        (triggers.hasElement(target as Element) ||
          triggers.hasMatchingElement((trigger) => contains(trigger, target as Element)))
      ) {
        return;
      }

      let targetRootAncestor = isElement(target) ? target : null;
      while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
        const nextParent = getParentNode(targetRootAncestor);
        if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
          break;
        }

        targetRootAncestor = nextParent;
      }

      // Check if the click occurred on a third-party element injected after the
      // floating element rendered.
      if (
        markers.length &&
        isElement(target) &&
        !isRootElement(target) &&
        // Clicked on a direct ancestor (e.g. FloatingOverlay).
        !contains(target, store.state.floatingElement) &&
        // If the target root element contains none of the markers, then the
        // element was injected after the floating element rendered.
        markers.every((marker) => !contains(targetRootAncestor, marker as Element))
      ) {
        return;
      }

      // Check if the click occurred on the scrollbar
      // Skip for touch events: scrollbars don't receive touch events on most platforms
      if (isHTMLElement(target) && !('touches' in event)) {
        const lastTraversableNode = isLastTraversableNode(target);
        const style = getComputedStyle(target);
        const scrollRe = /auto|scroll/;
        const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
        const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);

        const canScrollX =
          isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
        const canScrollY =
          isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;

        const isRTL = style.direction === 'rtl';

        // Check click position relative to scrollbar.
        // In some browsers it is possible to change the <body> (or window)
        // scrollbar to the left side, but is very rare and is difficult to
        // check for. Plus, for modal dialogs with backdrops, it is more
        // important that the backdrop is checked but not so much the window.
        const pressedVerticalScrollbar =
          canScrollY &&
          (isRTL
            ? event.offsetX <= target.offsetWidth - target.clientWidth
            : event.offsetX > target.clientWidth);

        const pressedHorizontalScrollbar = canScrollX && event.offsetY > target.clientHeight;

        if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
          return;
        }
      }

      if (isEventWithinFloatingTree(event)) {
        return;
      }

      // In intentional mode, a press that starts inside and ends outside gets
      // one suppressed outside click. Run this after inside-target checks so
      // inside clicks don't consume the one-shot suppression.
      if (getOutsidePressEvent() === 'intentional' && suppressNextOutsideClick) {
        preventedPressSuppressionTimeout.clear();
        suppressNextOutsideClick = false;
        return;
      }

      // Synthetic click sequences can omit pointerup/mouseup. Preserve the
      // same drag-out protection when an inside press is still active.
      if (getOutsidePressEvent() === 'intentional' && pressStartedInside) {
        resetPressStartState();
        return;
      }

      const outsidePressValue = outsidePress();
      if (typeof outsidePressValue === 'function' && !outsidePressValue(event)) {
        return;
      }

      if (hasBlockingChild('__outsidePressBubbles')) {
        return;
      }

      store.setOpen(false, createChangeEventDetails(REASONS.outsidePress, event));
      clearInsideReactTree();
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        getOutsidePressEvent() !== 'sloppy' ||
        event.pointerType === 'touch' ||
        !store.state.open ||
        !enabled() ||
        isEventWithinOwnElements(event)
      ) {
        return;
      }

      closeOnPressOutside(event);
    }

    function handleTouchStart(event: TouchEvent) {
      if (
        getOutsidePressEvent() !== 'sloppy' ||
        !store.state.open ||
        !enabled() ||
        isEventWithinOwnElements(event)
      ) {
        return;
      }

      const touch = event.touches[0];
      if (touch) {
        touchState = {
          startTime: componentRuntime.now(),
          startX: touch.clientX,
          startY: touch.clientY,
          dismissOnTouchEnd: false,
          dismissOnMouseDown: true,
        };

        cancelDismissOnEndTimeout.start(1000, () => {
          if (touchState) {
            touchState.dismissOnTouchEnd = false;
            touchState.dismissOnMouseDown = false;
          }
        });
      }
    }

    function addTargetEventListenerOnce<EventType extends Event>(
      event: EventType,
      listener: (event: EventType) => void,
    ) {
      const target = getTarget(event);

      if (!target) {
        return;
      }

      const unsubscribe = addEventListener(target as EventTarget, event.type, () => {
        listener(event);
        unsubscribe();
      });
    }

    function handleTouchStartCapture(event: TouchEvent) {
      currentPointerType = 'touch';
      addTargetEventListenerOnce(event, handleTouchStart);
    }

    function closeOnPressOutsideCapture(event: PointerEvent | MouseEvent) {
      cancelDismissOnEndTimeout.clear();

      if (event.type === 'pointerdown') {
        currentPointerType = (event as PointerEvent).pointerType;
      }

      markPressStartedInsideReactTree(event);

      if (event.type === 'mousedown' && touchState && !touchState.dismissOnMouseDown) {
        return;
      }

      addTargetEventListenerOnce(event, (targetEvent) => {
        if (targetEvent.type === 'pointerdown') {
          handlePointerDown(targetEvent as PointerEvent);
        } else {
          closeOnPressOutside(targetEvent as MouseEvent);
        }
      });
    }

    function handlePressEndCapture(event: PointerEvent | MouseEvent) {
      if (!pressStartedInside) {
        return;
      }

      const pressStartedInsideDefaultPrevented = pressStartPrevented;
      resetPressStartState();

      if (getOutsidePressEvent() !== 'intentional') {
        return;
      }

      if (event.type === 'pointercancel') {
        if (pressStartedInsideDefaultPrevented) {
          suppressImmediateOutsideClickAfterPreventedStart();
        }
        return;
      }

      if (isEventWithinFloatingTree(event)) {
        return;
      }

      // If pointerdown was prevented, no click may be generated for that
      // interaction. However, Firefox may still emit an immediate click after
      // pointerup (e.g. a scrub area with pointer lock), so suppress for
      // one tick to absorb that synthetic click only.
      if (pressStartedInsideDefaultPrevented) {
        suppressImmediateOutsideClickAfterPreventedStart();
        return;
      }

      // Avoid suppressing when outsidePress explicitly ignores this target.
      const outsidePressValue = outsidePress();
      if (typeof outsidePressValue === 'function' && !outsidePressValue(event as MouseEvent)) {
        return;
      }

      preventedPressSuppressionTimeout.clear();
      suppressNextOutsideClick = true;
      clearInsideReactTree();
    }

    function handleTouchMove(event: TouchEvent) {
      if (getOutsidePressEvent() !== 'sloppy' || !touchState || isEventWithinOwnElements(event)) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      const deltaX = Math.abs(touch.clientX - touchState.startX);
      const deltaY = Math.abs(touch.clientY - touchState.startY);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > 5) {
        touchState.dismissOnTouchEnd = true;
      }

      if (distance > 10) {
        closeOnPressOutside(event);
        cancelDismissOnEndTimeout.clear();
        touchState = null;
      }
    }

    function handleTouchMoveCapture(event: TouchEvent) {
      addTargetEventListenerOnce(event, handleTouchMove);
    }

    function handleTouchEnd(event: TouchEvent) {
      if (getOutsidePressEvent() !== 'sloppy' || !touchState || isEventWithinOwnElements(event)) {
        return;
      }

      if (touchState.dismissOnTouchEnd) {
        closeOnPressOutside(event);
      }

      cancelDismissOnEndTimeout.clear();
      touchState = null;
    }

    function handleTouchEndCapture(event: TouchEvent) {
      addTargetEventListenerOnce(event, handleTouchEnd);
    }

    const doc = ownerDocument(store.state.floatingElement);
    const unsubscribe = mergeCleanups(
      escapeKeyOn &&
        mergeCleanups(
          addEventListener(doc, 'keydown', closeOnEscapeKeyDown),
          addEventListener(doc, 'compositionstart', handleCompositionStart),
          addEventListener(doc, 'compositionend', handleCompositionEnd),
        ),
      outsidePressOn &&
        mergeCleanups(
          addEventListener(doc, 'click', closeOnPressOutsideCapture, true),
          addEventListener(doc, 'pointerdown', closeOnPressOutsideCapture, true),
          addEventListener(doc, 'pointerup', handlePressEndCapture, true),
          addEventListener(doc, 'pointercancel', handlePressEndCapture, true),
          addEventListener(doc, 'mousedown', closeOnPressOutsideCapture, true),
          addEventListener(doc, 'mouseup', handlePressEndCapture, true),
          addEventListener(doc, 'touchstart', handleTouchStartCapture, true),
          addEventListener(doc, 'touchmove', handleTouchMoveCapture, true),
          addEventListener(doc, 'touchend', handleTouchEndCapture, true),
        ),
    );

    onCleanup(() => {
      unsubscribe();
      resetPressStartState();
      suppressNextOutsideClick = false;
    });
  });

  // Whenever the resolved `outsidePress` value changes identity (including on
  // setup), drop any stale "inside" bookkeeping — mirrors upstream's
  // `useEffect(clearInsideReactTree, [outsidePress, clearInsideReactTree])`.
  createEffect(() => {
    outsidePress();
    clearInsideReactTree();
  });

  const reference: NonNullable<ElementProps['reference']> = {
    onKeyDown: closeOnEscapeKeyDown,
    onPointerDown: closeOnReferencePress,
    onClick: closeOnReferencePress,
  };

  // NOTE (deviation): upstream attaches these via React's `onXxxCapture`
  // props. Solid's dynamic prop-spread runtime (`assignProp` in
  // solid-js/web) only recognizes the `oncapture:*` namespace for real
  // capture-phase attachment — a literal `onClickCapture` key would be
  // registered as a listener for a nonexistent "clickcapture" DOM event and
  // silently never fire. That would leave `pressStartedInside` (read by
  // `handlePressEndCapture`, driving the whole `outsidePressEvent:
  // 'intentional'` drag/press-then-release suppression logic) permanently
  // `false`, breaking a core, exhaustively-tested behavior — so these use
  // Solid's real `oncapture:` keys instead of upstream's names.
  // Tradeoff: `mergeProps`'s handler-chaining only recognizes `on`+uppercase
  // keys (it doesn't special-case `oncapture:`), so if a future hook also
  // needs an `oncapture:mousedown`-style handler on the same floating
  // element, the two won't compose (last one wins) the way plain `onClick`
  // handlers from multiple hooks do. No currently-ported hook (`useClick`,
  // `useFocus`, `useHoverFloatingInteraction`, ...) attaches capture handlers
  // to the floating element, so this doesn't collide with anything today;
  // flagging it for whoever needs to compose one in here later.
  //
  // Separately, `dataRef.current.insideReactTree` (what these handlers set)
  // exists upstream to catch presses landing on a `createPortal`-ed
  // descendant that's a DOM sibling but still logically part of the same
  // *React* component tree (React's synthetic capture phase follows the
  // component tree, not real DOM position). Solid has no such virtual-tree
  // event system — a Solid `<Portal>` is a real DOM reparent, so
  // `isEventTargetWithin`'s `composedPath()` check already reports "outside"
  // for it exactly like a true capture listener on the floating root would.
  // The mechanism is kept for parity/robustness, but is expected to be a
  // no-op until `FloatingPortal` needs a different signal here.
  const floating: NonNullable<ElementProps['floating']> = {
    onKeyDown: closeOnEscapeKeyDown,
    // `onMouseDown` may be blocked if `event.preventDefault()` is called in
    // `onPointerDown`, such as with a scrub-area style control.
    onPointerDown: markInsidePressStartPrevented,
    onMouseDown: markInsidePressStartPrevented,
    'oncapture:click': markInsideReactTree,
    'oncapture:mousedown': (event: MouseEvent) => {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    'oncapture:pointerdown': (event: PointerEvent) => {
      markInsideReactTree();
      markPressStartedInsideReactTree(event);
    },
    'oncapture:mouseup': markInsideReactTree,
    'oncapture:touchend': markInsideReactTree,
    'oncapture:touchmove': markInsideReactTree,
  };

  return { reference, floating, trigger: reference };
}
