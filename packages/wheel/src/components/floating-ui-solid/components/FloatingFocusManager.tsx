/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createEffect, createMemo, onCleanup, untrack, Show, type JSX } from 'solid-js';
import { getNodeName, isHTMLElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { mergeRefs } from '../../base-utils/mergeRefs';
import { platform } from '../../base-utils/platform/index';
import { createTimeout } from '../../base-utils/createTimeout';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { FocusGuard } from '../../utils/FocusGuard';
import { resolveRef } from '../../utils/resolveRef';
import { isElementVisible } from '../../internals/composite/composite';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { CLICK_TRIGGER_IDENTIFIER } from '../../internals/constants';
import type { FloatingUIOpenChangeDetails } from '../../internals/types';
import {
  activeElement,
  contains,
  getTarget,
  isTypeableCombobox,
  getFloatingFocusElement,
  isTypeableElement,
} from '../utils/element';
import { isVirtualClick, isVirtualPointerEvent, stopEvent } from '../utils/event';
import {
  tabbable,
  focusable,
  isOutsideEvent,
  isTabbable,
  getNextTabbable,
  getPreviousTabbable,
  type FocusableElement,
} from '../utils/tabbable';
import { getNodeAncestors, getNodeChildren } from '../utils/nodes';
import { createAttribute } from '../utils/createAttribute';
import { enqueueFocus } from '../utils/enqueueFocus';
import { markOthers } from '../utils/markOthers';
import { usePortalContext } from './FloatingPortal';
import { useFloatingTree } from './FloatingTree';
import type { FloatingTreeStore } from './FloatingTreeStore';
import type { FloatingContext, FloatingRootContext } from '../types';

/**
 * The type of interaction that triggered an event (`mouse`, `touch`, `pen`,
 * `keyboard`, or `''` for programmatic/unknown). Not yet shared anywhere in
 * this port (upstream's home is `@base-ui/utils/useEnhancedClickHandler`,
 * whose click-handling logic hasn't been ported yet); scoped here until that
 * lands, matching `useFocus.ts`'s existing pattern of a locally-scoped
 * stand-in for a not-yet-ported shared dependency.
 */
export type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard' | '';

function getEventType(event: Event, lastInteractionType: InteractionType = ''): InteractionType {
  const win = ownerWindow(getTarget(event) as Node | null);
  if (event instanceof win.KeyboardEvent) {
    return 'keyboard';
  }
  if (event instanceof win.FocusEvent) {
    // Focus events can be caused by a preceding pointer interaction (e.g., focusout on outside press).
    // Prefer the last known pointer type if provided, else treat as keyboard.
    return lastInteractionType || 'keyboard';
  }
  if ('pointerType' in event) {
    return ((event as PointerEvent).pointerType as InteractionType) || 'keyboard';
  }
  if ('touches' in event) {
    return 'touch';
  }
  if (event instanceof win.MouseEvent) {
    // onClick events may not contain pointer events, and will fall through to here
    return lastInteractionType || (event.detail === 0 ? 'keyboard' : 'mouse');
  }
  return '';
}

const LIST_LIMIT = 20;
let previouslyFocusedElements: WeakRef<Element>[] = [];

function clearDisconnectedPreviouslyFocusedElements() {
  previouslyFocusedElements = previouslyFocusedElements.filter((entry) => {
    return entry.deref()?.isConnected;
  });
}

function addPreviouslyFocusedElement(element: Element | null | undefined) {
  clearDisconnectedPreviouslyFocusedElements();
  if (element && getNodeName(element) !== 'body') {
    previouslyFocusedElements.push(new WeakRef(element));
    if (previouslyFocusedElements.length > LIST_LIMIT) {
      previouslyFocusedElements = previouslyFocusedElements.slice(-LIST_LIMIT);
    }
  }
}

function getPreviouslyFocusedElement() {
  clearDisconnectedPreviouslyFocusedElements();
  return previouslyFocusedElements[previouslyFocusedElements.length - 1]?.deref();
}

function getFirstTabbableElement(container: Element | null) {
  if (!container) {
    return null;
  }

  if (isTabbable(container)) {
    return container;
  }

  return tabbable(container)[0] || container;
}

function handleTabIndex(floatingFocusElement: HTMLElement) {
  if (
    floatingFocusElement.hasAttribute('tabindex') &&
    !floatingFocusElement.hasAttribute('data-tabindex')
  ) {
    return;
  }

  if (!floatingFocusElement.getAttribute('role')?.includes('dialog')) {
    return;
  }

  const focusableElements = focusable(floatingFocusElement);
  const tabbableContent = focusableElements.filter((element) => {
    const dataTabIndex = element.getAttribute('data-tabindex') || '';
    return (
      isTabbable(element) ||
      (element.hasAttribute('data-tabindex') && !dataTabIndex.startsWith('-'))
    );
  });
  const tabIndex = floatingFocusElement.getAttribute('tabindex');

  if (tabbableContent.length === 0) {
    if (tabIndex !== '0') {
      floatingFocusElement.setAttribute('tabindex', '0');
      // Mark our own write so the externally-managed early-return above doesn't
      // mistake it for a user-authored `tabindex` and freeze management.
      floatingFocusElement.setAttribute('data-tabindex', '0');
    }
  } else if (
    tabIndex !== '-1' ||
    (floatingFocusElement.hasAttribute('data-tabindex') &&
      floatingFocusElement.getAttribute('data-tabindex') !== '-1')
  ) {
    floatingFocusElement.setAttribute('tabindex', '-1');
    floatingFocusElement.setAttribute('data-tabindex', '-1');
  }
}

type MaybeElementRef = HTMLElement | { current: HTMLElement | null } | null | undefined;

export interface FloatingFocusManagerProps {
  children?: JSX.Element;
  /**
   * The floating context returned from `useFloatingRootContext`.
   */
  context: FloatingRootContext | FloatingContext;
  /**
   * The interaction type used to open the floating element.
   */
  openInteractionType?: InteractionType | null | undefined;
  /**
   * Whether or not the focus manager should be disabled. Useful to delay focus
   * management until after a transition completes or some other conditional
   * state.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Determines the element to focus when the floating element is opened.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (first tabbable element or floating element).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
   *   Return an element to focus, `true` to use default behavior, `null` to fallback to default behavior,
   *   or `false`/`undefined` to do nothing.
   * @default true
   */
  initialFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((openType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
  /**
   * Determines the element to focus when the floating element is closed.
   *
   * - `false`: Do not move focus.
   * - `true`: Move focus based on the default behavior (reference or previously focused element).
   * - a `{ current }` box: Move focus to the boxed element.
   * - `function`: Called with the interaction type (`mouse`, `touch`, `pen`, or `keyboard`).
   *   Return an element to focus, `true` to use the default behavior, `null` to fallback to default behavior,
   *   or `false`/`undefined` to do nothing.
   * @default true
   */
  returnFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
  /**
   * Determines where focus should be restored if focus inside the floating element is lost
   * (such as due to the removal of the currently focused element from the DOM).
   *
   * - `true`: restore to the nearest tabbable element inside the floating tree (previous
   *   tabbable if possible, otherwise the last tabbable, then the floating element itself)
   * - `'popup'`: restore directly to the floating element (container) itself
   * - `false`: do not restore focus
   * @default false
   */
  restoreFocus?: boolean | 'popup' | undefined;
  /**
   * Determines if focus is "modal", meaning focus is fully trapped inside the
   * floating element and outside content cannot be accessed. This includes
   * screen reader virtual cursors.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * Determines whether `focusout` event listeners that control whether the
   * floating element should be closed if the focus moves outside of it are
   * attached to the reference and floating elements. This affects non-modal
   * focus management.
   * @default true
   */
  closeOnFocusOut?: boolean | undefined;
  /**
   * Overrides the element to focus when tabbing forward out of the floating element.
   */
  nextFocusableElement?: MaybeElementRef;
  /**
   * Overrides the element to focus when tabbing backward out of the floating element.
   */
  previousFocusableElement?: MaybeElementRef;
  /**
   * Ref to the focus guard preceding the floating element content.
   * Can be useful to focus the popup programmatically.
   */
  beforeContentFocusGuardRef?: ((el: HTMLSpanElement) => void) | undefined;
  /**
   * External FloatingTree to use when the one provided by context can't be used.
   */
  externalTree?: FloatingTreeStore | undefined;
  /**
   * Additional elements that should be treated as part of the floating subtree
   * even if they are rendered outside the floating element itself.
   */
  getInsideElements?: (() => Array<Element | null | undefined>) | undefined;
}

/**
 * Provides focus management for the floating element.
 * @see https://floating-ui.com/docs/FloatingFocusManager
 * @internal
 *
 * Solid port of upstream's `FloatingFocusManager`. Notable deviations:
 *
 * - Upstream reads most options through `useValueAsRef`-wrapped refs purely
 *   so effect closures (recreated only when their dependency array changes)
 *   can see the *latest* prop value at event time without adding it to the
 *   array. Solid props are already a reactive proxy, so any option read
 *   inside a nested callback (`props.modal`, `props.returnFocus`, etc.) is
 *   already "always fresh" the same way — no ref-wrapping needed.
 * - Because of that, each `createEffect` below only tracks the reads that
 *   upstream's dependency array uses to *decide whether to reattach DOM
 *   listeners* (the `disabled`/gating flags and the reference/floating/
 *   floating-focus DOM node identities). Dependencies that upstream lists
 *   only because they're read inside a handler closure (`modal`,
 *   `closeOnFocusOut`, `restoreFocus`, `nextFocusableElement`,
 *   `previousFocusableElement`, `tree`, `portalContext`, `store`, stable
 *   callbacks) are read live at their point of use instead: recreating a
 *   DOM listener when only an option (not a DOM node) changes would be
 *   observably identical to just reading the option fresh, so this avoids
 *   pointless listener churn while keeping identical runtime behavior.
 */
export function FloatingFocusManager(props: FloatingFocusManagerProps): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const initialFocus = () => (props.initialFocus === undefined ? true : props.initialFocus);
  const returnFocus = () => (props.returnFocus === undefined ? true : props.returnFocus);
  const restoreFocus = () => (props.restoreFocus === undefined ? false : props.restoreFocus);
  const modal = () => (props.modal === undefined ? true : props.modal);
  const closeOnFocusOut = () => (props.closeOnFocusOut === undefined ? true : props.closeOnFocusOut);
  const openInteractionType = (): InteractionType | null =>
    props.openInteractionType === undefined ? '' : props.openInteractionType;

  // `context`/`externalTree` are treated as stable for the component's
  // lifetime, matching upstream's mental model (and `useFloating`'s own
  // `options.rootContext`/`options.externalTree` handling) — read once at
  // setup rather than re-derived reactively.
  const store = untrack(() => {
    const ctx = props.context;
    return 'rootStore' in ctx ? ctx.rootStore : ctx;
  });

  const open = store.useState('open');
  const domReference = store.useState('domReferenceElement');
  const floating = store.useState('floatingElement');
  const { events, dataRef } = store.context;

  const getNodeId = () => dataRef.current.floatingContext?.nodeId;

  const ignoreInitialFocus = () => initialFocus() === false;
  // A typeable combobox reference (e.g. input/textarea) with `initialFocus={false}`
  // has different focus semantics: focus is not trapped inside the floating element,
  // so in the modal case the guards are not rendered, but `aria-hidden` is still
  // applied to the outside nodes.
  const isUntrappedTypeableCombobox = createMemo(
    () => isTypeableCombobox(domReference()) && ignoreInitialFocus(),
  );

  const tree = useFloatingTree(untrack(() => props.externalTree));
  const portalContext = usePortalContext();

  let preventReturnFocus = false;
  let isPointerDown = false;
  let pointerDownOutside = false;
  let lastFocusedTabbable: FocusableElement | null = null;
  let closeType: InteractionType = '';
  let lastInteractionType: InteractionType = '';

  let beforeGuardEl: HTMLSpanElement | null = null;
  let afterGuardEl: HTMLSpanElement | null = null;

  const mergedBeforeGuardRef = mergeRefs<HTMLSpanElement>(
    (el) => {
      beforeGuardEl = el;
    },
    // `beforeContentFocusGuardRef` is a ref-callback prop (read once at
    // setup to build the merged ref), not reactive state to track.
    props.beforeContentFocusGuardRef,
    portalContext
      ? (el) => {
          portalContext.beforeInsideRef.current = el;
        }
      : undefined,
  );
  const mergedAfterGuardRef = mergeRefs<HTMLSpanElement>(
    (el) => {
      afterGuardEl = el;
    },
    portalContext
      ? (el) => {
          portalContext.afterInsideRef.current = el;
        }
      : undefined,
  );

  const blurTimeout = createTimeout();
  const pointerDownTimeout = createTimeout();
  const restoreFocusFrame = createAnimationFrame();

  const isInsidePortal = portalContext != null;
  const floatingFocusElement = createMemo(() => getFloatingFocusElement(floating()));

  function getTabbableContent(
    container: Element | null = floatingFocusElement(),
  ): FocusableElement[] {
    return container ? tabbable(container) : [];
  }

  function getResolvedInsideElements(): Element[] {
    return props.getInsideElements?.().filter((element): element is Element => element != null) ?? [];
  }

  // Prevent Tab from escaping the modal when there are no tabbable elements.
  createEffect(() => {
    const isDisabled = disabled();
    const isModal = modal();
    const untrappedCombobox = isUntrappedTypeableCombobox();
    const ffe = floatingFocusElement();
    if (isDisabled || !isModal) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab') {
        // The focus guards have nothing to focus, so we need to stop the event.
        if (
          contains(ffe, activeElement(ownerDocument(ffe))) &&
          getTabbableContent(ffe).length === 0 &&
          !untrappedCombobox
        ) {
          stopEvent(event);
        }
      }
    }

    const doc = ownerDocument(ffe);
    onCleanup(addEventListener(doc, 'keydown', onKeyDown));
  });

  // Track pointer/keyboard interactions to disambiguate focus and outside presses.
  createEffect(() => {
    const isDisabled = disabled();
    const isOpen = open();
    if (isDisabled || !isOpen) {
      return;
    }

    const floatingEl = floating();
    const domRef = domReference();
    const ffe = floatingFocusElement();
    const doc = ownerDocument(ffe);

    function clearPointerDownOutside() {
      pointerDownOutside = false;
    }

    function onPointerDown(event: PointerEvent) {
      const target = getTarget(event) as Element | null;
      const insideElements = getResolvedInsideElements();
      const pointerTargetInside =
        contains(floatingEl, target) ||
        contains(domRef, target) ||
        contains(portalContext?.portalNode() ?? null, target) ||
        insideElements.some((element) => element === target || contains(element, target));
      pointerDownOutside = !pointerTargetInside;
      lastInteractionType = (event.pointerType as InteractionType) || 'keyboard';

      if (target?.closest(`[${CLICK_TRIGGER_IDENTIFIER}]`)) {
        isPointerDown = true;
        // Reset on the next tick so a single click on a click-trigger doesn't
        // permanently suppress focus-out closing for the lifetime of the instance.
        pointerDownTimeout.start(0, () => {
          isPointerDown = false;
        });
      }
    }

    function onKeyDown() {
      lastInteractionType = 'keyboard';
    }

    onCleanup(
      mergeCleanups(
        addEventListener(doc, 'pointerdown', onPointerDown, true),
        addEventListener(doc, 'pointerup', clearPointerDownOutside, true),
        addEventListener(doc, 'pointercancel', clearPointerDownOutside, true),
        addEventListener(doc, 'keydown', onKeyDown, true),
        // Avoid a stale `true` leaking into the next open (e.g. keep-mounted popups)
        // if the popup dismissed between pointerdown and pointerup.
        clearPointerDownOutside,
      ),
    );
  });

  // Close on focus out and restore focus within the floating tree when needed.
  createEffect(() => {
    const isDisabled = disabled();
    const shouldCloseOnFocusOut = closeOnFocusOut();
    if (isDisabled || !shouldCloseOnFocusOut) {
      return;
    }

    const domRef = domReference();
    const floatingEl = floating();
    const ffe = floatingFocusElement();
    const doc = ownerDocument(ffe);

    // In Safari, buttons lose focus when pressing them.
    function handlePointerDown() {
      isPointerDown = true;
      pointerDownTimeout.start(0, () => {
        isPointerDown = false;
      });
    }

    function handleFocusIn(event: FocusEvent) {
      const target = getTarget(event) as FocusableElement | null;
      if (isTabbable(target)) {
        lastFocusedTabbable = target;
      }
    }

    function handleFocusOutside(event: FocusEvent) {
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      const currentTarget = event.currentTarget as Element | null;
      const target = getTarget(event) as HTMLElement | null;
      const isModal = modal();

      // When focus is lost to the body (e.g. on a backdrop press), record the element that
      // had focus so a confirmation dialog opened while the body is focused can return focus
      // to it. Scoped to `modal` to avoid non-modal popups polluting the shared stack.
      if (isModal && relatedTarget == null && target != null && contains(floatingEl, target)) {
        addPreviouslyFocusedElement(target);
      }

      // Reads inside this callback are deliberately untracked: it runs later
      // (at actual focusout time), and every option read here (`restoreFocus`,
      // `isUntrappedTypeableCombobox`, etc.) is meant to reflect its value at
      // that moment, not to make this effect re-run when it changes — see the
      // component-level doc comment above.
      queueMicrotask(() => {
        const nodeId = getNodeId();
        const triggers = store.context.triggerElements;
        const insideElements = getResolvedInsideElements();
        const untrappedCombobox = isUntrappedTypeableCombobox();
        const restore = restoreFocus();

        const isRelatedFocusGuard =
          relatedTarget?.hasAttribute(createAttribute('focus-guard')) &&
          [
            beforeGuardEl,
            afterGuardEl,
            portalContext?.beforeInsideRef.current ?? null,
            portalContext?.afterInsideRef.current ?? null,
            portalContext?.beforeOutsideRef.current ?? null,
            portalContext?.afterOutsideRef.current ?? null,
            resolveRef(props.previousFocusableElement),
            resolveRef(props.nextFocusableElement),
          ].includes(relatedTarget);

        const movedToUnrelatedNode = !(
          contains(domRef, relatedTarget) ||
          contains(floatingEl, relatedTarget) ||
          contains(relatedTarget, floatingEl) ||
          contains(portalContext?.portalNode() ?? null, relatedTarget) ||
          insideElements.some(
            (element) => element === relatedTarget || contains(element, relatedTarget),
          ) ||
          triggers.hasMatchingElement((trigger) => contains(trigger, relatedTarget)) ||
          isRelatedFocusGuard ||
          (!!tree &&
            (getNodeChildren(tree.nodesRef.current, nodeId).find(
              (node) =>
                contains(node.context?.elements.floating() ?? null, relatedTarget) ||
                contains(node.context?.elements.domReference() ?? null, relatedTarget),
            ) ||
              getNodeAncestors(tree.nodesRef.current, nodeId).find(
                (node) =>
                  [
                    node.context?.elements.floating() ?? null,
                    getFloatingFocusElement(node.context?.elements.floating() ?? null),
                  ].includes(relatedTarget) ||
                  node.context?.elements.domReference() === relatedTarget,
              )))
        );

        if (currentTarget === domRef && ffe) {
          handleTabIndex(ffe);
        }

        // Restore focus to the previously focused tabbable element to prevent
        // focus from being lost outside the floating tree.
        if (
          restore &&
          currentTarget !== domRef &&
          !isElementVisible(target) &&
          activeElement(doc) === doc.body
        ) {
          // Let the portal's effect know that focus is still inside the
          // floating tree.
          if (isHTMLElement(ffe)) {
            ffe.focus();
            // If explicitly requested to restore focus to the popup container, do not search
            // for the next/previous tabbable element.
            if (restore === 'popup') {
              // If the focused element is removed on pointerdown, the browser
              // tries to move focus to it right after the `.focus()` call above,
              // but because it's removed in the same tick, focus is lost instead.
              // Re-focusing asynchronously (next frame) wins that race.
              restoreFocusFrame.request(() => {
                ffe.focus();
              });
              return;
            }
          }

          const tabbableContent = getTabbableContent(ffe) as Array<Element | null>;
          const prevTabbable = lastFocusedTabbable;
          const nodeToFocus =
            (prevTabbable && tabbableContent.includes(prevTabbable) ? prevTabbable : null) ||
            tabbableContent[tabbableContent.length - 1] ||
            ffe;

          if (isHTMLElement(nodeToFocus)) {
            nodeToFocus.focus();
          }
        }

        // https://github.com/floating-ui/floating-ui/issues/3060
        if (dataRef.current.insideReactTree) {
          dataRef.current.insideReactTree = false;
          return;
        }

        // Focus did not move inside the floating tree, and there are no tabbable
        // portal guards to handle closing.
        if (
          (untrappedCombobox ? true : !isModal) &&
          relatedTarget &&
          movedToUnrelatedNode &&
          !isPointerDown &&
          // For an "untrapped" typeable combobox (input role=combobox with
          // initialFocus=false), re-opening the popup and tabbing out should still close it even
          // when the previously focused element (e.g. the next tabbable outside the popup) is
          // focused again. Otherwise, the popup remains open on the second Tab sequence:
          // click input -> Tab (closes) -> click input -> Tab.
          // Allow closing when `isUntrappedTypeableCombobox` regardless of the previously focused element.
          (untrappedCombobox || relatedTarget !== getPreviouslyFocusedElement())
        ) {
          preventReturnFocus = true;
          store.setOpen(false, createChangeEventDetails(REASONS.focusOut, event));
        }
      });
    }

    function markInsideReactTree() {
      if (pointerDownOutside) {
        return;
      }
      dataRef.current.insideReactTree = true;
      blurTimeout.start(0, () => {
        dataRef.current.insideReactTree = false;
      });
    }

    const domReferenceElement = isHTMLElement(domRef) ? domRef : null;
    if (!floatingEl && !domReferenceElement) {
      return;
    }

    onCleanup(
      mergeCleanups(
        domReferenceElement && addEventListener(domReferenceElement, 'focusout', handleFocusOutside),
        domReferenceElement &&
          addEventListener(domReferenceElement, 'pointerdown', handlePointerDown),
        floatingEl && addEventListener(floatingEl, 'focusin', handleFocusIn),
        floatingEl && addEventListener(floatingEl, 'focusout', handleFocusOutside),
        floatingEl &&
          portalContext &&
          addEventListener(floatingEl, 'focusout', markInsideReactTree, true),
      ),
    );
  });

  // Hide everything outside the floating tree from assistive tech while open.
  createEffect(() => {
    const isDisabled = disabled();
    const floatingEl = floating();
    const isOpen = open();
    if (isDisabled || !floatingEl || !isOpen) {
      return;
    }

    const isModal = modal();
    const untrappedCombobox = isUntrappedTypeableCombobox();

    // Don't hide portals nested within the parent portal.
    const portalNodes = Array.from(
      portalContext?.portalNode()?.querySelectorAll(`[${createAttribute('portal')}]`) ?? [],
    );

    const ancestors = tree ? getNodeAncestors(tree.nodesRef.current, getNodeId()) : [];
    const rootAncestorComboboxDomReference = ancestors.find((node) =>
      isTypeableCombobox(node.context?.elements.domReference() ?? null),
    )?.context?.elements.domReference();

    const controlInsideElements = [
      floatingEl,
      ...portalNodes,
      beforeGuardEl,
      afterGuardEl,
      portalContext?.beforeOutsideRef.current ?? null,
      portalContext?.afterOutsideRef.current ?? null,
      ...getResolvedInsideElements(),
    ];
    const insideElements = [
      ...controlInsideElements,
      rootAncestorComboboxDomReference,
      resolveRef(props.previousFocusableElement),
      resolveRef(props.nextFocusableElement),
      untrappedCombobox ? domReference() : null,
    ].filter((x): x is Element => x != null);

    const ariaHiddenCleanup = markOthers(insideElements, {
      ariaHidden: isModal || untrappedCombobox,
      mark: false,
    });

    const markerInsideElements = [floatingEl, ...portalNodes].filter(
      (x): x is Element => x != null,
    );
    const markerCleanup = markOthers(markerInsideElements);

    onCleanup(() => {
      markerCleanup();
      ariaHiddenCleanup();
    });
  });

  // Focus the initial element when the floating element opens.
  createEffect(() => {
    const isOpen = open();
    const isDisabled = disabled();
    const ffe = floatingFocusElement();
    if (!isOpen || isDisabled || !isHTMLElement(ffe)) {
      return;
    }

    const doc = ownerDocument(ffe);
    const previouslyFocusedElement = activeElement(doc);

    // Wait for any store-sync effects to run first (e.g. `tabIndex` writes).
    // Reads inside are deliberately untracked/fresh at focus-time (see the
    // component-level doc comment above).
    queueMicrotask(() => {
      const initialFocusValueOrFn = initialFocus();
      const resolvedInitialFocus =
        typeof initialFocusValueOrFn === 'function'
          ? initialFocusValueOrFn(openInteractionType() || '')
          : initialFocusValueOrFn;

      // `null` should fallback to default behavior in case of an empty ref.
      if (resolvedInitialFocus === undefined || resolvedInitialFocus === false) {
        return;
      }

      const focusAlreadyInsideFloatingEl = contains(ffe, previouslyFocusedElement);

      if (focusAlreadyInsideFloatingEl) {
        return;
      }

      let focusableElements: FocusableElement[] | null = null;
      const getDefaultFocusElement = () => {
        if (focusableElements == null) {
          focusableElements = getTabbableContent(ffe);
        }

        return focusableElements[0] || ffe;
      };

      let elToFocus: FocusableElement | null | undefined;
      if (resolvedInitialFocus === true || resolvedInitialFocus === null) {
        elToFocus = getDefaultFocusElement();
      } else {
        elToFocus = resolveRef(resolvedInitialFocus);
      }
      elToFocus = elToFocus || getDefaultFocusElement();

      const hadFocusInside = contains(ffe, activeElement(doc));

      // enqueueFocus returns a rAF-cancel function; we intentionally don't cancel this focus.
      void enqueueFocus(elToFocus ?? null, {
        preventScroll: elToFocus === ffe,
        shouldFocus() {
          // This focus is queued on the next animation frame. If the floating element has closed
          // before it runs — e.g. tabbing out of a kept-mounted popup — don't pull focus back
          // onto the initial element after it has legitimately moved elsewhere.
          if (!open()) {
            return false;
          }

          if (hadFocusInside) {
            return true;
          }

          const currentActiveElement = activeElement(doc);
          const focusMovedInside =
            currentActiveElement !== elToFocus && contains(ffe, currentActiveElement);

          return !focusMovedInside;
        },
      });
    });
  });

  // Track return focus targets and restore focus on unmount/close.
  createEffect(() => {
    const isDisabled = disabled();
    const ffe = floatingFocusElement();
    if (isDisabled || !ffe) {
      return;
    }

    // Snapshotted (not read fresh) because they're only used from `onCleanup`,
    // which runs later — by then `floating`/`domReference` may already have
    // changed (e.g. to `null` once the floating element unmounts), whereas
    // upstream's plain-variable closure captured the value from the render
    // that set up this effect. Matching that requires capturing it now.
    const floatingSnapshot = floating();
    const domReferenceSnapshot = domReference();

    const doc = ownerDocument(ffe);
    const elementFocusedBeforeOpen = activeElement(doc);
    // Only an explicit `null` interaction type represents a programmatic open.
    // `undefined` is normalized to `''` by `openInteractionType()`, so it never
    // reaches here as nullish and is intentionally not treated as programmatic.
    const preferPreviousFocus = openInteractionType() == null;

    addPreviouslyFocusedElement(elementFocusedBeforeOpen);

    function onOpenChangeLocal(details: FloatingUIOpenChangeDetails) {
      if (!details.open) {
        closeType = getEventType(details.nativeEvent, lastInteractionType);
      }

      if (details.reason === REASONS.triggerHover && details.nativeEvent.type === 'mouseleave') {
        preventReturnFocus = true;
      }

      if (details.reason !== REASONS.outsidePress) {
        return;
      }

      if (details.nested) {
        preventReturnFocus = false;
      } else if (
        isVirtualClick(details.nativeEvent as MouseEvent) ||
        isVirtualPointerEvent(details.nativeEvent as PointerEvent)
      ) {
        preventReturnFocus = false;
      } else {
        // On outside press, only return focus to the reference when the browser supports the
        // `focus({ preventScroll })` option; without it, restoring focus scrolls the page.
        // Chrome on Android and Samsung Internet still don't support `preventScroll`
        // (https://issues.chromium.org/issues/41453122), so the runtime check keeps return
        // focus disabled there to avoid the scroll jump.
        let isPreventScrollSupported = false;
        ownerDocument(ffe)
          .createElement('div')
          .focus({
            get preventScroll() {
              isPreventScrollSupported = true;
              return false;
            },
          });

        preventReturnFocus = !isPreventScrollSupported;
      }
    }

    events.on('openchange', onOpenChangeLocal);

    function getReturnElement() {
      const returnFocusValueOrFn = returnFocus();
      let resolvedReturnFocusValue =
        typeof returnFocusValueOrFn === 'function'
          ? returnFocusValueOrFn(closeType)
          : returnFocusValueOrFn;

      // `null` should fallback to default behavior in case of an empty ref.
      if (resolvedReturnFocusValue === undefined || resolvedReturnFocusValue === false) {
        return null;
      }

      if (resolvedReturnFocusValue === null) {
        resolvedReturnFocusValue = true;
      }

      const domRef = domReferenceSnapshot;
      const referenceReturnElement = domRef?.isConnected ? domRef : null;
      const previousReturnElement =
        elementFocusedBeforeOpen?.isConnected && getNodeName(elementFocusedBeforeOpen) !== 'body'
          ? elementFocusedBeforeOpen
          : null;

      let defaultReturnElement = preferPreviousFocus
        ? previousReturnElement || referenceReturnElement
        : referenceReturnElement || previousReturnElement;

      if (!defaultReturnElement) {
        defaultReturnElement = getPreviouslyFocusedElement() || null;
      }

      if (typeof resolvedReturnFocusValue === 'boolean') {
        return defaultReturnElement;
      }

      return resolveRef(resolvedReturnFocusValue) || defaultReturnElement || null;
    }

    onCleanup(() => {
      events.off('openchange', onOpenChangeLocal);

      const activeEl = activeElement(doc);
      const insideElements = getResolvedInsideElements();
      const isFocusInsideFloatingTree =
        contains(floatingSnapshot, activeEl) ||
        insideElements.some((element) => element === activeEl || contains(element, activeEl)) ||
        (!!tree &&
          getNodeChildren(tree.nodesRef.current, getNodeId(), false).some((node) =>
            contains(node.context?.elements.floating() ?? null, activeEl),
          ));

      const returnFocusValueOrFn = returnFocus();
      const returnElement = getReturnElement();

      queueMicrotask(() => {
        // `returnElement` if it is tabbable, otherwise its first tabbable child,
        // otherwise `returnElement` itself (which may not be tabbable at all).
        const tabbableReturnElement = getFirstTabbableElement(returnElement);
        const hasExplicitReturnFocus = typeof returnFocusValueOrFn !== 'boolean';

        if (
          returnFocusValueOrFn &&
          !preventReturnFocus &&
          isHTMLElement(tabbableReturnElement) &&
          // If the focus moved somewhere else after mount, avoid returning focus
          // since it likely entered a different element which should be
          // respected: https://github.com/floating-ui/floating-ui/issues/2607
          (!hasExplicitReturnFocus && tabbableReturnElement !== activeEl && activeEl !== doc.body
            ? isFocusInsideFloatingTree
            : true)
        ) {
          const focusOptions: FocusOptions & { focusVisible?: boolean } = { preventScroll: true };
          if (closeType === 'keyboard') {
            focusOptions.focusVisible = true;
          }
          tabbableReturnElement.focus(focusOptions);
        }

        preventReturnFocus = false;
      });
    });
  });

  // Safari may randomly scroll to the bottom of the page if an input inside a popup has focus
  // when the popup unmounts from the DOM.
  // By blurring it before the popup unmounts, we can prevent this behavior.
  createEffect(() => {
    const isOpen = open();
    const floatingEl = floating();
    if (!platform.engine.webkit || isOpen || !floatingEl) {
      return;
    }

    const activeEl = activeElement(ownerDocument(floatingEl));
    if (!isHTMLElement(activeEl) || !isTypeableElement(activeEl)) {
      return;
    }

    if (contains(floatingEl, activeEl)) {
      activeEl.blur();
    }
  });

  // Synchronize the focus manager state (modal, closeOnFocusOut, open, etc.) to the
  // FloatingPortal context, which uses it to decide whether to render its own guards.
  createEffect(() => {
    const isDisabled = disabled();
    if (isDisabled || !portalContext) {
      return;
    }

    portalContext.setFocusManagerState({
      modal: modal(),
      closeOnFocusOut: closeOnFocusOut(),
      open: open(),
      onOpenChange: store.setOpen,
      domReference: domReference(),
    });

    onCleanup(() => {
      portalContext.setFocusManagerState(null);
    });
  });

  // Keep the floating element tabIndex in sync and clear stale focus records.
  createEffect(() => {
    const isDisabled = disabled();
    const ffe = floatingFocusElement();
    if (isDisabled || !ffe) {
      return;
    }
    handleTabIndex(ffe);
    onCleanup(() => {
      queueMicrotask(clearDisconnectedPreviouslyFocusedElements);
    });
  });

  const shouldRenderGuards = createMemo(
    () => !disabled() && (modal() ? !isUntrappedTypeableCombobox() : true) && (isInsidePortal || modal()),
  );

  function handleBeforeGuardFocus(event: FocusEvent) {
    if (modal()) {
      const els = getTabbableContent();
      // enqueueFocus returns a rAF-cancel function we don't need here.
      void enqueueFocus(els[els.length - 1] ?? null);
    } else if (portalContext?.portalNode()) {
      preventReturnFocus = false;
      if (isOutsideEvent(event, portalContext.portalNode() ?? undefined)) {
        const nextTabbable = getNextTabbable(domReference());
        nextTabbable?.focus();
      } else {
        resolveRef(props.previousFocusableElement ?? portalContext.beforeOutsideRef)?.focus();
      }
    }
  }

  function handleAfterGuardFocus(event: FocusEvent) {
    if (modal()) {
      // enqueueFocus returns a rAF-cancel function we don't need here.
      void enqueueFocus(getTabbableContent()[0] ?? null);
    } else if (portalContext?.portalNode()) {
      if (closeOnFocusOut()) {
        preventReturnFocus = true;
      }

      if (isOutsideEvent(event, portalContext.portalNode() ?? undefined)) {
        const prevTabbable = getPreviousTabbable(domReference());
        prevTabbable?.focus();
      } else {
        resolveRef(props.nextFocusableElement ?? portalContext.afterOutsideRef)?.focus();
      }
    }
  }

  return (
    <>
      <Show when={shouldRenderGuards()}>
        <FocusGuard data-type="inside" ref={mergedBeforeGuardRef} onFocus={handleBeforeGuardFocus} />
      </Show>
      {props.children}
      <Show when={shouldRenderGuards()}>
        <FocusGuard data-type="inside" ref={mergedAfterGuardRef} onFocus={handleAfterGuardFocus} />
      </Show>
    </>
  );
}
