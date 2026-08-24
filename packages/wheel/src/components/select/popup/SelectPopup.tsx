/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, splitProps, type JSX } from 'solid-js';
import { rectToClientRect, type ClientRectObject } from '@floating-ui/utils';
import { addEventListener } from '../../base-utils/addEventListener';
import { platform } from '../../base-utils/platform/index';
import { ownerDocument, ownerWindow } from '../../base-utils/owner';
import { createAnimationFrame } from '../../base-utils/createAnimationFrame';
import { platform as floatingPlatform } from '../../floating-ui-solid';
import { FloatingFocusManager } from '../../floating-ui-solid/components/FloatingFocusManager';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { useSelectFloatingContext, useSelectRootContext } from '../root/SelectRootContext';
import { popupStateMapping } from '../../utils/popupStateMapping';
import type { Side, Align } from '../../utils/useAnchorPositioning';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { useSelectPositionerContext } from '../positioner/SelectPositionerContext';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { renderElement } from '../../internals/renderElement';
import { clearStyles, LIST_FUNCTIONAL_STYLES } from './utils';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { clamp } from '../../internals/clamp';
import { getMaxScrollOffset, SCROLL_EDGE_TOLERANCE_PX } from '../../utils/scrollEdges';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { useDirection } from '../../internals/direction-context/DirectionContext';

const stateAttributesMapping: StateAttributesMapping<SelectPopupState> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
};

/**
 * A container for the select list.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Select](https://base-ui.com/react/components/select)
 *
 * Deviation: the `alignItemWithTrigger` geometry effect below is ported as faithfully as
 * practical from upstream's `SelectPopup`, including its browser-measurement fallbacks (Safari
 * pinch-zoom, viewport collision thresholds). jsdom doesn't lay out real geometry (every
 * `getBoundingClientRect()`/`getComputedStyle()` read returns zeros), so this code path is
 * unreachable in this port's test suite — matching upstream's own Chromium-only test gating for
 * the same feature (see `SelectPositioner.spec.tsx`'s browser-only assertions upstream).
 *
 * Deviation: upstream also wires up `Toolbar` integration (`useToolbarRootContext`,
 * stopping `COMPOSITE_KEYS` propagation) and CSP nonce support for its scrollbar-hiding
 * `<style>` element (`useCSPContext`, `styleDisableScrollbar`). Neither `Toolbar` nor a CSP
 * context provider is ported yet, so both are omitted here; the popup/list still scroll and
 * function identically, just with the browser's default scrollbar rendered instead of a
 * CSS-hidden one.
 */
export function SelectPopup(componentProps: SelectPopup.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'finalFocus',
  ]);

  const {
    store,
    popupRef,
    onOpenChangeComplete,
    setOpen,
    valueRef,
    firstItemTextRef,
    selectedItemTextRef,
    multiple,
    handleScrollArrowVisibility,
    scrollHandlerRef,
    listRef,
  } = useSelectRootContext();
  const { side, align, alignItemWithTriggerActive, isPositioned, setControlledAlignItemWithTrigger } =
    useSelectPositionerContext();
  const floatingRootContext = useSelectFloatingContext();
  const direction = useDirection();

  const id = store.useState('id');
  const open = store.useState('open');
  const openMethod = store.useState('openMethod');
  const mounted = store.useState('mounted');
  const popupProps = store.useState('popupProps');
  const transitionStatus = store.useState('transitionStatus');
  const triggerElement = store.useState('triggerElement');
  const positionerElement = store.useState('positionerElement');
  const listElement = store.useState('listElement');

  let reachedMaxHeight = false;
  let initialPlaced = false;
  let originalPositionerStyles: JSX.CSSProperties = {};

  const scrollArrowFrame = createAnimationFrame();

  const handleScroll = (scroller: HTMLDivElement) => {
    const positioner = positionerElement();
    if (!positioner || !popupRef.current || !initialPlaced) {
      return;
    }

    if (reachedMaxHeight || !alignItemWithTriggerActive()) {
      handleScrollArrowVisibility();
      return;
    }

    const isTopPositioned = positioner.style.top === '0px';
    const isBottomPositioned = positioner.style.bottom === '0px';

    if (!isTopPositioned && !isBottomPositioned) {
      handleScrollArrowVisibility();
      return;
    }

    const scale = getScale(positioner);
    const currentHeight = normalizeSize(positioner.getBoundingClientRect().height, 'y', scale);
    const doc = ownerDocument(positioner);
    const win = ownerWindow(positioner);
    const positionerStyles = win.getComputedStyle(positioner);
    const marginTop = parseFloat(positionerStyles.marginTop);
    const marginBottom = parseFloat(positionerStyles.marginBottom);
    const maxPopupHeight = getMaxPopupHeight(win.getComputedStyle(popupRef.current));
    const maxAvailableHeight = Math.min(
      doc.documentElement.clientHeight - marginTop - marginBottom,
      maxPopupHeight,
    );

    const scrollTop = scroller.scrollTop;
    const maxScrollTop = getMaxScrollTop(scroller);

    let nextPositionerHeight = 0;
    let nextScrollTop: number | null = null;
    let setReachedMax = false;
    let scrollToMax = false;

    const setHeight = (height: number) => {
      positioner.style.height = `${height}px`;
    };

    const handleSmallDiff = (diff: number, targetScrollTop: number) => {
      const heightDelta = clamp(diff, 0, maxAvailableHeight - currentHeight);
      if (heightDelta > 0) {
        setHeight(currentHeight + heightDelta);
      }
      scroller.scrollTop = targetScrollTop;
      if (maxAvailableHeight - (currentHeight + heightDelta) <= SCROLL_EDGE_TOLERANCE_PX) {
        reachedMaxHeight = true;
      }
      handleScrollArrowVisibility();
    };

    const diff = isTopPositioned ? maxScrollTop - scrollTop : scrollTop;
    const nextHeight = Math.min(currentHeight + diff, maxAvailableHeight);

    nextPositionerHeight = nextHeight;

    if (diff <= SCROLL_EDGE_TOLERANCE_PX) {
      handleSmallDiff(diff, isTopPositioned ? maxScrollTop : 0);
      return;
    }

    if (maxAvailableHeight - nextHeight > SCROLL_EDGE_TOLERANCE_PX) {
      if (isTopPositioned) {
        scrollToMax = true;
      } else {
        nextScrollTop = 0;
      }
    } else {
      setReachedMax = true;

      if (isBottomPositioned && scrollTop < maxScrollTop) {
        const overshoot = currentHeight + diff - maxAvailableHeight;
        nextScrollTop = scrollTop - (diff - overshoot);
      }
    }

    nextPositionerHeight = Math.ceil(nextPositionerHeight);

    if (nextPositionerHeight !== 0) {
      setHeight(nextPositionerHeight);
    }

    if (scrollToMax || nextScrollTop != null) {
      const nextMaxScrollTop = getMaxScrollTop(scroller);
      const target = scrollToMax ? nextMaxScrollTop : clamp(nextScrollTop!, 0, nextMaxScrollTop);

      if (Math.abs(scroller.scrollTop - target) > SCROLL_EDGE_TOLERANCE_PX) {
        scroller.scrollTop = target;
      }
    }

    if (setReachedMax || nextPositionerHeight >= maxAvailableHeight - SCROLL_EDGE_TOLERANCE_PX) {
      reachedMaxHeight = true;
    }

    handleScrollArrowVisibility();
  };

  createEffect(() => {
    scrollHandlerRef.current = handleScroll;
  });

  createOpenChangeComplete({
    open,
    getElement: () => popupRef.current,
    onComplete() {
      if (open()) {
        onOpenChangeComplete?.(true);
      }
    },
  });

  const state: SelectPopup.State = {
    get open() {
      return open();
    },
    get transitionStatus() {
      return transitionStatus();
    },
    get side() {
      return side();
    },
    get align() {
      return align();
    },
  };

  createEffect(() => {
    const positioner = positionerElement();
    if (!positioner || !popupRef.current || Object.keys(originalPositionerStyles).length) {
      return;
    }

    originalPositionerStyles = {
      top: positioner.style.top || '0',
      left: positioner.style.left || '0',
      right: positioner.style.right,
      height: positioner.style.height,
      bottom: positioner.style.bottom,
      'min-height': positioner.style.minHeight,
      'max-height': positioner.style.maxHeight,
      'margin-top': positioner.style.marginTop,
      'margin-bottom': positioner.style.marginBottom,
    };
  });

  createEffect(() => {
    if (open() || alignItemWithTriggerActive()) {
      return;
    }

    initialPlaced = false;
    reachedMaxHeight = false;
    clearStyles(positionerElement(), originalPositionerStyles);
  });

  createEffect(() => {
    const positioner = positionerElement();
    const trigger = triggerElement();
    const popupElement = popupRef.current;

    // Wait for Floating UI's first positioning pass before reading DOM geometry.
    if (
      !open() ||
      !trigger ||
      !positioner ||
      !popupElement ||
      (alignItemWithTriggerActive() && !isPositioned()) ||
      store.state.transitionStatus === 'ending'
    ) {
      return;
    }

    if (!alignItemWithTriggerActive()) {
      initialPlaced = true;
      scrollArrowFrame.request(handleScrollArrowVisibility);
      popupElement.style.removeProperty('--transform-origin');
      return;
    }

    const restoreTransformStyles = unsetTransformStyles(popupElement);
    popupElement.style.removeProperty('--transform-origin');

    try {
      let textElement = selectedItemTextRef.current;

      if (!textElement?.isConnected) {
        const hasSelectedValue = store.selectors.hasSelectedValue(store.state);
        textElement =
          !hasSelectedValue && firstItemTextRef.current?.isConnected ? firstItemTextRef.current : null;
      }

      const valueElement = valueRef.current;

      const win = ownerWindow(positioner);
      const positionerStyles = win.getComputedStyle(positioner);
      const popupStyles = win.getComputedStyle(popupElement);

      const doc = ownerDocument(trigger);
      const scale = getScale(trigger);
      const triggerRect = normalizeRect(trigger.getBoundingClientRect(), scale);

      const positionerRect = normalizeRect(positioner.getBoundingClientRect(), scale);
      const triggerHeight = triggerRect.height;
      const scroller = listElement() || popupElement;
      const scrollHeight = scroller.scrollHeight;

      const borderBottom = parseFloat(popupStyles.borderBottomWidth);
      const marginTop = parseFloat(positionerStyles.marginTop) || 10;
      const marginBottom = parseFloat(positionerStyles.marginBottom) || 10;
      const minHeight = parseFloat(positionerStyles.minHeight) || 100;
      const maxPopupHeight = getMaxPopupHeight(popupStyles);

      const paddingLeft = 5;
      const paddingRight = 5;
      const triggerCollisionThreshold = 20;

      const viewportHeight = doc.documentElement.clientHeight - marginTop - marginBottom;
      const viewportWidth = doc.documentElement.clientWidth;
      const availableSpaceBeneathTrigger = viewportHeight - triggerRect.bottom + triggerHeight;

      const isRtl = direction() === 'rtl';

      let textRect: ClientRectObject | undefined;
      let alignedLeft = isRtl ? triggerRect.right - positionerRect.width : triggerRect.left;
      let offsetY = 0;

      if (textElement && valueElement) {
        const valueRect = normalizeRect(valueElement.getBoundingClientRect(), scale);
        textRect = normalizeRect(textElement.getBoundingClientRect(), scale);

        alignedLeft =
          positionerRect.left +
          (isRtl ? valueRect.right - textRect.right : valueRect.left - textRect.left);
        const valueCenterFromTriggerTop = valueRect.top - triggerRect.top + valueRect.height / 2;
        const textCenterFromPositionerTop = textRect.top - positionerRect.top + textRect.height / 2;

        offsetY = textCenterFromPositionerTop - valueCenterFromTriggerTop;
      }

      const idealHeight = availableSpaceBeneathTrigger + offsetY + marginBottom + borderBottom;
      let height = Math.min(viewportHeight, idealHeight);
      const maxHeight = viewportHeight - marginTop - marginBottom;
      const scrollTop = idealHeight - height;

      const maxRight = viewportWidth - paddingRight;

      positioner.style.left = `${clamp(alignedLeft, paddingLeft, maxRight - positionerRect.width)}px`;
      positioner.style.height = `${height}px`;
      positioner.style.maxHeight = 'none';
      positioner.style.marginTop = `${marginTop}px`;
      positioner.style.marginBottom = `${marginBottom}px`;
      popupElement.style.height = '100%';

      const maxScrollTop = getMaxScrollTop(scroller);
      const isTopPositioned = scrollTop >= maxScrollTop - SCROLL_EDGE_TOLERANCE_PX;

      if (isTopPositioned) {
        height = Math.min(viewportHeight, positionerRect.height) - (scrollTop - maxScrollTop);
      }

      const fallbackToAlignPopupToTrigger =
        triggerRect.top < triggerCollisionThreshold ||
        triggerRect.bottom > viewportHeight - triggerCollisionThreshold ||
        Math.ceil(height) + SCROLL_EDGE_TOLERANCE_PX < Math.min(scrollHeight, minHeight);

      const isPinchZoomed = (win.visualViewport?.scale ?? 1) !== 1 && platform.engine.webkit;

      if (fallbackToAlignPopupToTrigger || isPinchZoomed) {
        initialPlaced = true;
        clearStyles(positioner, originalPositionerStyles);
        setControlledAlignItemWithTrigger(false);
        return;
      }

      const initialHeight = Math.max(minHeight, height);

      if (isTopPositioned) {
        const topOffset = Math.max(0, viewportHeight - idealHeight);
        positioner.style.top = positionerRect.height >= maxHeight ? '0' : `${topOffset}px`;
        positioner.style.height = `${height}px`;
        scroller.scrollTop = getMaxScrollTop(scroller);
      } else {
        positioner.style.bottom = '0';
        scroller.scrollTop = scrollTop;
      }

      if (textRect) {
        const popupTop = positionerRect.top;
        const popupHeight = positionerRect.height;
        const textCenterY = textRect.top + textRect.height / 2;

        const transformOriginY = popupHeight > 0 ? ((textCenterY - popupTop) / popupHeight) * 100 : 50;
        const clampedY = clamp(transformOriginY, 0, 100);

        popupElement.style.setProperty('--transform-origin', `50% ${clampedY}%`);
      }

      if (initialHeight === viewportHeight || height >= maxPopupHeight) {
        reachedMaxHeight = true;
      }

      handleScrollArrowVisibility();

      initialPlaced = true;
    } finally {
      restoreTransformStyles();
    }
  });

  createEffect(() => {
    const positioner = positionerElement();
    if (!alignItemWithTriggerActive() || !positioner || !open()) {
      return;
    }

    const win = ownerWindow(positioner);

    function handleResize(event: UIEvent) {
      setOpen(false, createChangeEventDetails(REASONS.windowResize, event));
    }

    const cleanup = addEventListener(win, 'resize', handleResize);
    return cleanup;
  });

  const defaultProps = (): HTMLProps => ({
    ...(listElement()
      ? {
          role: 'presentation',
          'aria-orientation': undefined,
        }
      : {
          role: 'listbox',
          'aria-multiselectable': multiple() || undefined,
          id: `${id()}-list`,
        }),
    onScroll(event: Event) {
      if (listElement()) {
        return;
      }
      handleScroll(event.currentTarget as HTMLDivElement);
    },
    ...(alignItemWithTriggerActive()
      ? { style: listElement() ? { height: '100%' } : LIST_FUNCTIONAL_STYLES }
      : {}),
  });

  const element = renderElement('div', componentProps, {
    defaultClass: 'wheel-Select-Popup',
    slot: 'select-popup',
    ref: (el: HTMLDivElement | null) => {
      popupRef.current = el;
    },
    state,
    stateAttributesMapping,
    props: [popupProps, defaultProps, () => getDisabledMountTransitionStyles(transitionStatus()), elementProps],
  });

  return (
    <FloatingFocusManager
      context={floatingRootContext}
      modal={false}
      disabled={!mounted()}
      openInteractionType={openMethod()}
      returnFocus={local.finalFocus as boolean | undefined}
      restoreFocus
    >
      {element}
    </FloatingFocusManager>
  );
}

export interface SelectPopupProps extends BaseUIComponentProps<'div', SelectPopupState> {
  children?: JSX.Element;
  /**
   * Determines the element to focus when the select popup is closed.
   *
   * Deviation: upstream also accepts a `RefObject` or an interaction-type-receiving function for
   * `finalFocus` (mirroring `FloatingFocusManager`'s `returnFocus`). Only the `boolean` form is
   * exercised by this port's test slice; a `{ current }` ref-box or function value is passed
   * straight through to `FloatingFocusManager.returnFocus`, which does support them.
   */
  finalFocus?:
    | boolean
    | { current: HTMLElement | null }
    | ((closeType: InteractionType) => boolean | HTMLElement | null | void)
    | undefined;
}

export interface SelectPopupState {
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side | 'none';
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the component is open.
   */
  open: boolean;
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
}

export namespace SelectPopup {
  export type Props = SelectPopupProps;
  export type State = SelectPopupState;
}

function getMaxPopupHeight(popupStyles: CSSStyleDeclaration) {
  const maxHeightStyle = popupStyles.maxHeight || '';
  return maxHeightStyle.endsWith('px') ? parseFloat(maxHeightStyle) || Infinity : Infinity;
}

function getMaxScrollTop(scroller: HTMLElement) {
  return getMaxScrollOffset(scroller.scrollHeight, scroller.clientHeight);
}

function getScale(element: HTMLElement) {
  return floatingPlatform.getScale(element) as { x: number; y: number };
}

function normalizeSize(size: number, axis: 'x' | 'y', scale: { x: number; y: number }) {
  return size / scale[axis];
}

function normalizeRect(rect: DOMRect | DOMRectReadOnly, scale: { x: number; y: number }): ClientRectObject {
  return rectToClientRect({
    x: normalizeSize(rect.x, 'x', scale),
    y: normalizeSize(rect.y, 'y', scale),
    width: normalizeSize(rect.width, 'x', scale),
    height: normalizeSize(rect.height, 'y', scale),
  });
}

const TRANSFORM_STYLE_RESETS = [
  ['transform', 'none'],
  ['scale', '1'],
  ['translate', '0 0'],
] as const;

type TransformStyleProperty = (typeof TRANSFORM_STYLE_RESETS)[number][0];

function unsetTransformStyles(popupElement: HTMLElement) {
  const { style } = popupElement;
  const originalStyles = {} as Record<TransformStyleProperty, string>;

  for (const [property, value] of TRANSFORM_STYLE_RESETS) {
    originalStyles[property] = style.getPropertyValue(property);
    style.setProperty(property, value, 'important');
  }

  return () => {
    for (const [property] of TRANSFORM_STYLE_RESETS) {
      const originalValue = originalStyles[property];
      if (originalValue) {
        style.setProperty(property, originalValue);
      } else {
        style.removeProperty(property);
      }
    }
  };
}
