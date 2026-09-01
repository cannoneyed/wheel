/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, onCleanup, splitProps, Show, type JSX } from 'solid-js';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerWindow } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import {
  safePolygon,
  useClick,
  useFloatingRootContext,
  useFloatingTree,
  useHoverReferenceInteraction,
  type HandleCloseContextBase,
} from '../../floating-ui-solid';
import {
  applySafePolygonPointerEventsMutation,
  clearSafePolygonPointerEventsMutation,
  useHoverInteractionSharedState,
} from '../../floating-ui-solid/hooks/useHoverInteractionSharedState';
import {
  getTabbableAfterElement,
  getNextTabbable,
  getPreviousTabbable,
  isOutsideEvent,
} from '../../floating-ui-solid/utils/tabbable';
import { contains } from '../../floating-ui-solid/utils/element';
import { stopEvent } from '../../floating-ui-solid/utils/event';
import type { BaseUIComponentProps, NativeButtonProps, HTMLProps } from '../../internals/types';
import { useNavigationMenuItemContext } from '../item/NavigationMenuItemContext';
import {
  useNavigationMenuRootContext,
  useNavigationMenuTreeContext,
} from '../root/NavigationMenuRootContext';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { ownerVisuallyHidden, PATIENT_CLICK_THRESHOLD } from '../../internals/constants';
import { FocusGuard } from '../../utils/FocusGuard';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping';
import { TransitionStatusDataAttributes } from '../../internals/stateAttributesMapping';
import { isOutsideMenuEvent } from '../utils/isOutsideMenuEvent';
import { createCompositeItem } from '../../internals/composite/item/createCompositeItem';
import { renderElement } from '../../internals/renderElement';
import { createButton } from '../../internals/use-button/createButton';
import { createAnimationsFinished } from '../../internals/createAnimationsFinished';
import { getCssDimensions } from '../../utils/getCssDimensions';
import type { NavigationMenuRoot } from '../root/NavigationMenuRoot';
import { NAVIGATION_MENU_TRIGGER_IDENTIFIER } from '../utils/constants';
import { setSharedFixedSize } from '../utils/setSharedFixedSize';
import { useNavigationMenuDismissContext } from '../list/NavigationMenuDismissContext';
import { NavigationMenuPopupCssVars } from '../popup/NavigationMenuPopupCssVars';
import { NavigationMenuPositionerCssVars } from '../positioner/NavigationMenuPositionerCssVars';
import { mergeProps } from '../../merge-props/mergeProps';
import { useDirection } from '../../internals/direction-context/DirectionContext';

const DEFAULT_SIZE = { width: 0, height: 0 };

function getPlacementFromElements(
  domReferenceElement: Element,
  floatingElement: HTMLElement,
): HandleCloseContextBase['placement'] {
  const referenceRect = domReferenceElement.getBoundingClientRect();
  const floatingRect = floatingElement.getBoundingClientRect();
  const referenceCenterX = referenceRect.left + referenceRect.width / 2;
  const referenceCenterY = referenceRect.top + referenceRect.height / 2;
  const floatingCenterX = floatingRect.left + floatingRect.width / 2;
  const floatingCenterY = floatingRect.top + floatingRect.height / 2;
  const deltaX = floatingCenterX - referenceCenterX;
  const deltaY = floatingCenterY - referenceCenterY;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? 'right' : 'left';
  }

  return deltaY >= 0 ? 'bottom' : 'top';
}

function getHandleCloseContext(
  domReferenceElement: Element,
  floatingElement: HTMLElement,
  nodeId: string | undefined,
): HandleCloseContextBase {
  return {
    placement: getPlacementFromElements(domReferenceElement, floatingElement),
    elements: {
      domReference: () => domReferenceElement,
      floating: () => floatingElement,
    },
    nodeId,
  };
}

/**
 * Opens the navigation menu popup when hovered or clicked, revealing the
 * associated content.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuTrigger(componentProps: NavigationMenuTrigger.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'nativeButton',
    'disabled',
  ]);

  const nativeButton = () => componentProps.nativeButton ?? true;
  const disabled = () => componentProps.disabled ?? false;

  const {
    value,
    setValue,
    mounted,
    open,
    positionerElement,
    setActivationDirection,
    setFloatingRootContext,
    popupElement,
    viewportElement,
    transitionStatus,
    rootRef,
    beforeOutsideRef,
    afterOutsideRef,
    afterInsideRef,
    beforeInsideRef,
    prevTriggerElementRef,
    popupAutoSizeResetRef,
    currentContentRef,
    delay,
    closeDelay,
    orientation,
    setViewportInert,
    nested,
  } = useNavigationMenuRootContext();
  const itemContext = useNavigationMenuItemContext();
  const nodeId = useNavigationMenuTreeContext();
  const tree = useFloatingTree();
  const dismissContext = useNavigationMenuDismissContext();
  const direction = useDirection();

  const stickIfOpenTimeout = createTimeout();
  const focusFrame = createAnimationFrame();
  const mutationFrame = createAnimationFrame();
  const resizeFrame = createAnimationFrame();
  const sizeFrame = createAnimationFrame();

  const [triggerElement, setTriggerElement] = useSignal<HTMLElement | null>(null, 'triggerElement');
  const [stickIfOpen, setStickIfOpen] = useSignal(true, 'stickIfOpen');
  const [pointerType, setPointerType] = useSignal<'mouse' | 'touch' | 'pen' | ''>('', 'pointerType');

  const triggerElementRef: { current: HTMLElement | null } = { current: null };
  let allowFocus = false;
  let prevSize = DEFAULT_SIZE;
  let skipAutoSizeSync = false;

  const isActiveItem = () => open() && value() === itemContext.value;
  const interactionsEnabled = () => (positionerElement() != null || value() == null) && !disabled();
  const hoverFloatingElement = () => positionerElement() || viewportElement();
  const hoverInteractionsEnabled = () =>
    (hoverFloatingElement() != null || value() == null) && !disabled();

  const runOnceAnimationsFinish = createAnimationsFinished(popupElement, () => false, () => false);

  const handleTriggerElement = (element: HTMLElement | null) => {
    triggerElementRef.current = element;
    setTriggerElement(element);
  };

  const cancelAutoSizeReset = (force = false) => {
    if (!force && popupAutoSizeResetRef.current.owner !== itemContext.value) {
      return;
    }

    popupAutoSizeResetRef.current.abortController?.abort();
    popupAutoSizeResetRef.current.abortController = null;
    popupAutoSizeResetRef.current.owner = null;
  };

  createEffect(() => {
    if (isActiveItem()) {
      return;
    }

    mutationFrame.cancel();
    sizeFrame.cancel();
    cancelAutoSizeReset();
  });

  function setAutoSizes() {
    const popup = popupElement();
    if (!popup) {
      return;
    }

    popup.style.setProperty(NavigationMenuPopupCssVars.popupWidth, 'auto');
    popup.style.setProperty(NavigationMenuPopupCssVars.popupHeight, 'auto');
  }

  function clearFixedSizes() {
    const popup = popupElement();
    const positioner = positionerElement();
    if (!popup || !positioner) {
      return;
    }

    popup.style.removeProperty(NavigationMenuPopupCssVars.popupWidth);
    popup.style.removeProperty(NavigationMenuPopupCssVars.popupHeight);
    positioner.style.removeProperty(NavigationMenuPositionerCssVars.positionerWidth);
    positioner.style.removeProperty(NavigationMenuPositionerCssVars.positionerHeight);
  }

  function scheduleAutoSizeReset() {
    cancelAutoSizeReset(true);

    const abortController = new AbortController();
    popupAutoSizeResetRef.current.abortController = abortController;
    popupAutoSizeResetRef.current.owner = itemContext.value;

    runOnceAnimationsFinish(() => {
      if (
        popupAutoSizeResetRef.current.abortController !== abortController ||
        popupAutoSizeResetRef.current.owner !== itemContext.value
      ) {
        return;
      }

      popupAutoSizeResetRef.current.abortController = null;
      popupAutoSizeResetRef.current.owner = null;
      setAutoSizes();
    }, abortController.signal);
  }

  function handleValueChange(
    currentWidth: number,
    currentHeight: number,
    options: { syncPositioner?: boolean | undefined } = {},
  ) {
    const popup = popupElement();
    const positioner = positionerElement();
    if (!popup || !positioner) {
      return;
    }

    cancelAutoSizeReset(true);
    const { syncPositioner = false } = options;

    clearFixedSizes();

    const { width, height } = getCssDimensions(popup);
    const measuredWidth = width || prevSize.width;
    const measuredHeight = height || prevSize.height;

    if (currentHeight === 0 || currentWidth === 0) {
      currentWidth = measuredWidth;
      currentHeight = measuredHeight;
    }

    popup.style.setProperty(NavigationMenuPopupCssVars.popupWidth, `${currentWidth}px`);
    popup.style.setProperty(NavigationMenuPopupCssVars.popupHeight, `${currentHeight}px`);
    positioner.style.setProperty(
      NavigationMenuPositionerCssVars.positionerWidth,
      `${syncPositioner ? currentWidth : measuredWidth}px`,
    );
    positioner.style.setProperty(
      NavigationMenuPositionerCssVars.positionerHeight,
      `${syncPositioner ? currentHeight : measuredHeight}px`,
    );

    sizeFrame.request(() => {
      if (!isActiveItem()) {
        return;
      }

      popup.style.setProperty(NavigationMenuPopupCssVars.popupWidth, `${measuredWidth}px`);
      popup.style.setProperty(NavigationMenuPopupCssVars.popupHeight, `${measuredHeight}px`);

      if (syncPositioner) {
        positioner.style.setProperty(
          NavigationMenuPositionerCssVars.positionerWidth,
          `${measuredWidth}px`,
        );
        positioner.style.setProperty(
          NavigationMenuPositionerCssVars.positionerHeight,
          `${measuredHeight}px`,
        );
      }

      scheduleAutoSizeReset();
    });
  }

  function handleInterruptedMutationResize(currentWidth: number, currentHeight: number) {
    const popup = popupElement();
    const positioner = positionerElement();
    if (!popup || !positioner) {
      return;
    }

    sizeFrame.cancel();
    mutationFrame.cancel();
    cancelAutoSizeReset(true);

    if (currentWidth === 0 || currentHeight === 0) {
      return;
    }

    setSharedFixedSize(popup, positioner, currentWidth, currentHeight);

    mutationFrame.request(() => {
      mutationFrame.request(() => {
        clearFixedSizes();

        const { width, height } = getCssDimensions(popup);
        const measuredWidth = width || currentWidth || prevSize.width;
        const measuredHeight = height || currentHeight || prevSize.height;

        setSharedFixedSize(popup, positioner, currentWidth, currentHeight);

        sizeFrame.request(() => {
          if (!isActiveItem()) {
            return;
          }

          setSharedFixedSize(popup, positioner, measuredWidth, measuredHeight);
          scheduleAutoSizeReset();
        });
      });
    });
  }

  function syncCurrentSize() {
    const popup = popupElement();
    const positioner = positionerElement();
    if (!popup || !positioner) {
      return;
    }

    sizeFrame.cancel();
    cancelAutoSizeReset(true);

    clearFixedSizes();

    const { width, height } = getCssDimensions(popup);

    if (width === 0 || height === 0) {
      return;
    }

    prevSize = { width, height };
    setAutoSizes();
    positioner.style.setProperty(NavigationMenuPositionerCssVars.positionerWidth, `${width}px`);
    positioner.style.setProperty(NavigationMenuPositionerCssVars.positionerHeight, `${height}px`);
  }

  function getMutationBaseline() {
    const popup = popupElement();
    if (!popup) {
      return { size: prevSize, syncPositioner: false };
    }

    const popupWidth = popup.style.getPropertyValue(NavigationMenuPopupCssVars.popupWidth);
    const popupHeight = popup.style.getPropertyValue(NavigationMenuPopupCssVars.popupHeight);
    const isResizing =
      popupWidth !== '' && popupWidth !== 'auto' && popupHeight !== '' && popupHeight !== 'auto';

    if (!isResizing) {
      return { size: prevSize, syncPositioner: false };
    }

    return {
      size: {
        width: popup.offsetWidth || prevSize.width,
        height: popup.offsetHeight || prevSize.height,
      },
      syncPositioner: true,
    };
  }

  createEffect(() => {
    if (open()) {
      return;
    }
    stickIfOpenTimeout.clear();
    mutationFrame.cancel();
    resizeFrame.cancel();
    sizeFrame.cancel();
    cancelAutoSizeReset(true);
    skipAutoSizeSync = false;
    setPointerType('');
  });

  createEffect(() => {
    if (!mounted()) {
      prevSize = DEFAULT_SIZE;
    }
  });

  createEffect(() => {
    const popup = popupElement();
    if (!popup || typeof ResizeObserver !== 'function') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      prevSize = { width: popup.offsetWidth, height: popup.offsetHeight };
    });

    resizeObserver.observe(popup);

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  createEffect(() => {
    if (!open() || !isActiveItem() || !popupElement() || !positionerElement()) {
      return;
    }

    const win = ownerWindow(positionerElement());
    function handleResize() {
      resizeFrame.cancel();
      resizeFrame.request(syncCurrentSize);
    }

    const unsubscribe = addEventListener(win, 'resize', handleResize);

    onCleanup(() => {
      resizeFrame.cancel();
      unsubscribe();
    });
  });

  createEffect(() => {
    const observedElement = currentContentRef.current;
    const popup = popupElement();

    if (!observedElement || !popup || !isActiveItem() || typeof MutationObserver !== 'function') {
      return;
    }

    const mutationObserver = new MutationObserver(() => {
      if (
        transitionStatus() === 'starting' ||
        popup.hasAttribute(TransitionStatusDataAttributes.startingStyle)
      ) {
        syncCurrentSize();
        return;
      }

      const { size, syncPositioner } = getMutationBaseline();

      if (syncPositioner) {
        handleInterruptedMutationResize(size.width, size.height);
        return;
      }

      handleValueChange(size.width, size.height);
    });

    mutationObserver.observe(observedElement, {
      childList: true,
      subtree: true,
      characterData: true,
      // `keepMounted` submenu switches update dimensions by toggling hidden
      // content rather than inserting or removing content nodes.
      attributes: true,
      attributeFilter: ['hidden'],
    });

    onCleanup(() => {
      mutationObserver.disconnect();
    });
  });

  createEffect(() => {
    if (isActiveItem() && open() && popupElement() && allowFocus) {
      allowFocus = false;
      focusFrame.request(() => {
        beforeOutsideRef.current?.focus();
      });
    }

    onCleanup(() => {
      focusFrame.cancel();
    });
  });

  createEffect(() => {
    if (isActiveItem() && open() && popupElement()) {
      const hasNestedMenu = currentContentRef.current?.querySelector('[data-nested]') != null;

      if (transitionStatus() === 'starting' && hasNestedMenu) {
        // Inline nested menus can reveal their default content after the
        // top-level content enters the viewport. Defer once so the opening
        // size is measured from the final nested content, not the shell.
        sizeFrame.request(syncCurrentSize);
        onCleanup(() => {
          sizeFrame.cancel();
        });
        return;
      }

      if (skipAutoSizeSync) {
        skipAutoSizeSync = false;
        return;
      }

      const popup = popupElement();
      if (popup) {
        const { width, height } = getCssDimensions(popup);
        handleValueChange(width, height);
      }
    }
  });

  function handleOpenChange(
    nextOpen: boolean,
    eventDetails: NavigationMenuRoot.ChangeEventDetails,
  ) {
    const isHover = eventDetails.reason === REASONS.triggerHover;

    if (!interactionsEnabled()) {
      return;
    }

    if (pointerType() === 'touch' && isHover) {
      return;
    }

    if (!nextOpen && value() !== itemContext.value) {
      return;
    }

    if (isHover) {
      // Only allow "patient" clicks to close the popup if it's open.
      // If they clicked within 500ms of the popup opening, keep it open.
      setStickIfOpen(true);
      stickIfOpenTimeout.clear();
      stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
        setStickIfOpen(false);
      });
    }

    if (nextOpen) {
      setValue(itemContext.value, eventDetails);
    } else {
      setValue(null, eventDetails);
      setPointerType('');
    }
  }

  const context = useFloatingRootContext({
    open,
    onOpenChange: handleOpenChange,
    elements: {
      reference: triggerElement,
      floating: hoverFloatingElement,
    },
  });

  const hoverInteractionState = useHoverInteractionSharedState(context);
  const shouldBlockSafePolygonPointerEvents = () => pointerType() !== 'touch';

  createEffect(() => {
    if (!open()) {
      context.context.dataRef.current.openEvent = undefined;
      hoverInteractionState.pointerType = undefined;
      hoverInteractionState.interactedInside = false;
      hoverInteractionState.restTimeoutPending = false;
      hoverInteractionState.openChangeTimeout.clear();
      hoverInteractionState.restTimeout.clear();
      clearSafePolygonPointerEventsMutation(hoverInteractionState);
    }
  });

  function getInlineHandleCloseContext(): HandleCloseContextBase | null {
    const floatingEl = hoverFloatingElement();
    if (!nested || positionerElement() || !triggerElementRef.current || !floatingEl) {
      return null;
    }

    return getHandleCloseContext(triggerElementRef.current, floatingEl, nodeId);
  }

  function getScope() {
    if (!nested || !positionerElement()) {
      return triggerElementRef.current?.closest('ul') ?? null;
    }

    return null;
  }

  const hoverProps = useHoverReferenceInteraction(context, {
    enabled: hoverInteractionsEnabled,
    move: () => false,
    handleClose: safePolygon({
      blockPointerEvents: shouldBlockSafePolygonPointerEvents(),
      getScope,
    }),
    restMs: () => (mounted() && positionerElement() ? 0 : delay()),
    delay: () => ({ close: closeDelay() }),
    triggerElementRef,
    getHandleCloseContext: getInlineHandleCloseContext,
  });

  const click = useClick(context, {
    enabled: interactionsEnabled,
    stickIfOpen,
    toggle: isActiveItem,
  });

  const referenceProps = () => mergeProps(click.reference, hoverProps());

  createEffect(() => {
    if (isActiveItem()) {
      setFloatingRootContext(context);
      prevTriggerElementRef.current = triggerElement();
    }
  });

  function handleActivation(event: MouseEvent | KeyboardEvent) {
    const currentTarget = isHTMLElement(event.currentTarget) ? event.currentTarget : null;
    const prevTriggerRect = prevTriggerElementRef.current?.getBoundingClientRect();
    const triggerEl = triggerElement();

    if (mounted() && prevTriggerRect && triggerEl) {
      const nextTriggerRect = triggerEl.getBoundingClientRect();
      const isMovingRight = nextTriggerRect.left > prevTriggerRect.left;
      const isMovingDown = nextTriggerRect.top > prevTriggerRect.top;

      if (orientation() === 'horizontal' && nextTriggerRect.left !== prevTriggerRect.left) {
        setActivationDirection(isMovingRight ? 'right' : 'left');
      } else if (orientation() === 'vertical' && nextTriggerRect.top !== prevTriggerRect.top) {
        setActivationDirection(isMovingDown ? 'down' : 'up');
      }
    }

    // Reset the `openEvent` to `undefined` when the active item changes so that a
    // `click` -> `hover` on new trigger -> `hover` back to old trigger doesn't unexpectedly
    // cause the popup to remain stuck open when leaving the old trigger.
    if (event.type !== 'click' && value() != null) {
      context.context.dataRef.current.openEvent = undefined;
    }

    if (pointerType() === 'touch' && event.type !== 'click') {
      return;
    }

    // Keyboard open events reach this activation path after `onKeyDown` has already set
    // the value with the `listNavigation` reason.
    if (value() != null && event.type !== 'keydown') {
      setValue(
        itemContext.value,
        createChangeEventDetails(
          event.type === 'mouseenter' ? REASONS.triggerHover : REASONS.triggerPress,
          event,
        ),
      );
    }

    if (
      event.type === 'mouseenter' &&
      shouldBlockSafePolygonPointerEvents() &&
      (!nested || !positionerElement()) &&
      hoverFloatingElement() &&
      currentTarget
    ) {
      const applyPointerEventsMutation = () => {
        const scopeElement = getScope() ?? currentTarget.ownerDocument.body;

        applySafePolygonPointerEventsMutation(hoverInteractionState, {
          scopeElement,
          referenceElement: currentTarget,
          floatingElement: hoverFloatingElement()!,
        });
      };

      if (value() != null && value() !== itemContext.value) {
        queueMicrotask(applyPointerEventsMutation);
      } else {
        applyPointerEventsMutation();
      }
    }
  }

  function handleOpenEvent(event: MouseEvent | KeyboardEvent) {
    if (disabled()) {
      return;
    }

    const popup = popupElement();
    const positioner = positionerElement();

    if (!popup || !positioner) {
      handleActivation(event);
      return;
    }

    const { width, height } = getCssDimensions(popup);
    const shouldSkipAutoSizeSync =
      value() != null &&
      value() !== itemContext.value &&
      (event.type === 'click' || pointerType() !== 'touch');

    handleActivation(event);

    if (shouldSkipAutoSizeSync) {
      skipAutoSizeSync = true;
    }

    handleValueChange(width, height);
  }

  const state: NavigationMenuTriggerState = {
    get open() {
      return isActiveItem();
    },
  };

  function handleSetPointerType(event: PointerEvent) {
    setPointerType(event.pointerType as 'mouse' | 'touch' | 'pen' | '');
  }

  function handleTriggerPointerDown(event: PointerEvent) {
    handleSetPointerType(event);
    clearSafePolygonPointerEventsMutation(hoverInteractionState);
  }

  const defaultProps = (): HTMLProps => ({
    tabIndex: 0,
    onMouseEnter: handleOpenEvent,
    onClick: handleOpenEvent,
    onPointerEnter: handleSetPointerType,
    onPointerDown: handleTriggerPointerDown,
    'aria-expanded': isActiveItem(),
    'aria-controls': isActiveItem() ? popupElement()?.id : undefined,
    [NAVIGATION_MENU_TRIGGER_IDENTIFIER]: '',
    onFocus() {
      if (!isActiveItem()) {
        return;
      }
      setViewportInert(false);
    },
    onMouseMove() {
      allowFocus = false;
    },
    onKeyDown(event: KeyboardEvent) {
      allowFocus = true;

      // For nested (submenu) triggers, don't intercept arrow keys that are used for
      // navigation in the parent content. The arrow keys should be handled by the
      // parent's CompositeRoot for navigating between items.
      if (nested) {
        return;
      }

      const verticalOpenKey = direction() === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const openHorizontal = orientation() === 'horizontal' && event.key === 'ArrowDown';
      const openVertical = orientation() === 'vertical' && event.key === verticalOpenKey;

      if (openHorizontal || openVertical) {
        setValue(itemContext.value, createChangeEventDetails(REASONS.listNavigation, event));
        handleOpenEvent(event);
        stopEvent(event);
      }
    },
    onBlur(event: FocusEvent) {
      const positioner = positionerElement();
      const popup = popupElement();
      if (
        positioner &&
        popup &&
        isOutsideMenuEvent(
          {
            currentTarget: event.currentTarget as HTMLElement,
            relatedTarget: event.relatedTarget as HTMLElement | null,
          },
          { popupElement: popup, rootRef, tree, nodeId },
        )
      ) {
        setValue(null, createChangeEventDetails(REASONS.focusOut, event));
      }
    },
  });

  const { getButtonProps, buttonRef } = createButton({ disabled, native: nativeButton });
  const { compositeProps, compositeRef } = createCompositeItem<never>({});

  const referenceElement = hoverFloatingElement;

  return (
    <>
      {renderElement('button', componentProps, {
        defaultClass: 'wheel-NavigationMenu-Trigger',
        slot: 'navigation-menu-trigger',
        state,
        ref: [compositeRef, handleTriggerElement, buttonRef],
        // Deviation: upstream lists these in `[referenceProps, dismissProps.reference,
        // defaultProps, elementProps, getButtonProps]` order. React's batched state updates mean
        // the exact handler-execution order between `referenceProps` (from `useClick`, which
        // performs the initial closed -> open transition) and `defaultProps` (`handleOpenEvent`,
        // which performs the already-open item-switch transition) doesn't matter there — neither
        // handler observes the other's state write mid-event. Solid's signal writes apply
        // synchronously, so with upstream's array order (`mergeProps` runs the rightmost/later
        // entry's handler first — see its doc comment), `defaultProps.onClick` would run first,
        // switch `value` to this trigger's item, and then `referenceProps`'s `useClick` handler
        // would read the *already switched* `isActiveItem`/`toggle` state and misinterpret an
        // item-switch click as "the active trigger was clicked again" — closing the menu instead
        // of switching to it (reproduced empirically: clicking a second, already-visible trigger
        // closed the whole menu instead of switching panels). Moving `defaultProps` before
        // `referenceProps` makes `useClick`'s handler run first (observing the pre-click state, as
        // upstream's batching effectively guarantees) and `handleOpenEvent` run second.
        props: [
          compositeProps,
          defaultProps,
          () => dismissContext?.()?.reference ?? {},
          referenceProps,
          elementProps,
          getButtonProps,
        ],
        stateAttributesMapping: pressableTriggerOpenStateMapping,
      })}
      <Show when={isActiveItem()}>
        <FocusGuard
          ref={(el) => {
            beforeOutsideRef.current = el;
          }}
          onFocus={(event) => {
            const referenceEl = referenceElement();
            if (referenceEl && isOutsideEvent(event, referenceEl)) {
              beforeInsideRef.current?.focus();
            } else {
              const prevTabbable = getPreviousTabbable(triggerElement());
              prevTabbable?.focus();
            }
          }}
        />
        <span aria-owns={viewportElement()?.id} style={ownerVisuallyHidden} />
        <FocusGuard
          ref={(el) => {
            afterOutsideRef.current = el;
          }}
          onFocus={(event) => {
            const referenceEl = referenceElement();
            if (referenceEl && isOutsideEvent(event, referenceEl)) {
              setViewportInert(false);
              const elementToFocus = afterInsideRef.current || triggerElement();
              elementToFocus?.focus();
            } else {
              let nextTabbable = getNextTabbable(triggerElement());

              if (
                nested &&
                !positionerElement() &&
                referenceEl &&
                nextTabbable &&
                contains(referenceEl, nextTabbable)
              ) {
                nextTabbable = getTabbableAfterElement(afterInsideRef.current);
              }

              nextTabbable?.focus();

              if ((!nested || positionerElement()) && !contains(rootRef.current, nextTabbable)) {
                setValue(null, createChangeEventDetails(REASONS.focusOut, event));
              }
            }
          }}
        />
      </Show>
    </>
  );
}

export interface NavigationMenuTriggerState {
  /**
   * If `true`, the popup is open and the item is active.
   */
  open: boolean;
}

export interface NavigationMenuTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', NavigationMenuTriggerState> {}

export namespace NavigationMenuTrigger {
  export type State = NavigationMenuTriggerState;
  export type Props = NavigationMenuTriggerProps;
}
