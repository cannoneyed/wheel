/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, splitProps, untrack, Show, type JSX } from 'solid-js';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { ownerDocument } from '../../base-utils/owner';
import { activeElement, contains } from '../../internals/shadowDom';
import {
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
  type FloatingRootContext,
} from '../../floating-ui-solid';
import { renderElement } from '../../internals/renderElement';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createTransitionStatus } from '../../internals/createTransitionStatus';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { BaseUIComponentProps } from '../../internals/types';
import {
  type NavigationMenuPopupAutoSizeResetState,
  NavigationMenuRootContext,
  NavigationMenuTreeContext,
  useNavigationMenuRootContext,
} from './NavigationMenuRootContext';
import { NavigationMenuPositionerCssVars } from '../positioner/NavigationMenuPositionerCssVars';
import { setSharedFixedSize } from '../utils/setSharedFixedSize';

const blockedReturnFocusReasons = new Set<string>([
  REASONS.triggerHover,
  REASONS.outsidePress,
  REASONS.focusOut,
]);

function getPositionerFixedSize(positionerElement: HTMLElement) {
  // Read the last fixed positioner size rather than measuring the popup now:
  // during a controlled close, the popup can already be in its exit render and
  // report 0 before the closing transition gets a stable size to animate from.
  const width =
    parseFloat(
      positionerElement.style.getPropertyValue(NavigationMenuPositionerCssVars.positionerWidth),
    ) || 0;
  const height =
    parseFloat(
      positionerElement.style.getPropertyValue(NavigationMenuPositionerCssVars.positionerHeight),
    ) || 0;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

/**
 * Groups all parts of the navigation menu.
 * Renders a `<nav>` element at the root, or `<div>` element when nested.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 *
 * Deviation: upstream also accepts an `actionsRef` prop (imperative `unmount`). Not ported — a
 * React ref-forwarding pattern with no direct Solid equivalent and no behavior in this port's test
 * slice exercises it (same cut `PopoverRoot`/`MenuRoot` make; see their doc comments). Every close
 * here runs the automatic unmount-on-animation-complete path upstream only takes when `actionsRef`
 * is absent.
 */
export function NavigationMenuRoot<Value = any>(
  componentProps: NavigationMenuRoot.Props<Value>,
): JSX.Element {
  // Reading the ambient parent node id/context here — before this call's own JSX renders its
  // `<FloatingNode>`/`<NavigationMenuRootContext.Provider>` below — only ever observes a genuinely
  // different, already-rendered ancestor `NavigationMenu.Root` (e.g. this Root nested inside
  // another Root's `Content`), never this same call's own context (mirrors `MenuRoot.tsx`'s
  // documented rationale for the same pattern).
  const parentId = useFloatingParentNodeId();
  const nested = parentId != null;
  const parentRootContext = useNavigationMenuRootContext<Value>(true);

  const [value, setValueUnwrapped] = createControllableSignal<NavigationMenuRoot.Value<Value>>({
    controlled: () => componentProps.value,
    default: componentProps.defaultValue ?? null,
    name: 'NavigationMenu',
    state: 'value',
  });

  // Derive open state from value being non-nullish.
  const open = () => value() != null;

  let closeReason: NavigationMenuRoot.ChangeEventReason | undefined;

  const [positionerElement, setPositionerElement] = useSignal<HTMLElement | null>(null, 'positionerElement');
  const [popupElement, setPopupElement] = useSignal<HTMLElement | null>(null, 'popupElement');
  const [viewportElement, setViewportElement] = useSignal<HTMLElement | null>(null, 'viewportElement');
  const [viewportTargetElement, setViewportTargetElement] = useSignal<HTMLElement | null>(null, 'viewportTargetElement');
  const [activationDirection, setActivationDirection] = useSignal<
    'left' | 'right' | 'up' | 'down' | null
  >(null, 'activationDirection');
  const [floatingRootContext, setFloatingRootContext] = useSignal<
    FloatingRootContext | undefined
  >(undefined, 'floatingRootContext');
  const [viewportInert, setViewportInert] = useSignal(false, 'viewportInert');

  const rootRef: { current: HTMLElement | null } = { current: null };
  const prevTriggerElementRef: { current: Element | null | undefined } = { current: null };
  const currentContentRef: { current: HTMLElement | null } = { current: null };
  const beforeInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterInsideRef: { current: HTMLSpanElement | null } = { current: null };
  const beforeOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  const afterOutsideRef: { current: HTMLSpanElement | null } = { current: null };
  // Shared across triggers so a newly active trigger can cancel a stale popup auto-size reset
  // scheduled by the previously active trigger.
  const popupAutoSizeResetRef: { current: NavigationMenuPopupAutoSizeResetState } = {
    current: { abortController: null, owner: null },
  };

  const { mounted, setMounted, transitionStatus } = createTransitionStatus(open);

  createEffect(() => {
    if (open()) {
      return;
    }

    const positioner = positionerElement();
    const popup = popupElement();

    if (!positioner || !popup) {
      return;
    }

    const closeTransitionSize = getPositionerFixedSize(positioner);

    if (!closeTransitionSize) {
      return;
    }

    // No cleanup is needed for this fixed size: if the popup unmounts, the inline
    // styles are removed with it. If it stays mounted, reopening runs the trigger's
    // sizing logic which clears these vars via `clearFixedSizes`/`setAutoSizes`.
    setSharedFixedSize(popup, positioner, closeTransitionSize.width, closeTransitionSize.height);
  });

  createEffect(() => {
    value();
    setViewportInert(false);
  });

  const setValue = (
    nextValue: NavigationMenuRoot.Value<Value>,
    eventDetails: NavigationMenuRoot.ChangeEventDetails,
  ) => {
    untrack(() => {
      if (nextValue == null) {
        closeReason = eventDetails.reason;
      }

      if (nextValue !== value()) {
        componentProps.onValueChange?.(nextValue, eventDetails);
      }

      if (eventDetails.isCanceled) {
        return;
      }

      if (nextValue == null) {
        setActivationDirection(null);
        setFloatingRootContext(undefined);
      }

      setValueUnwrapped(nextValue);

      if (
        nested &&
        nextValue == null &&
        eventDetails.reason === REASONS.linkPress &&
        parentRootContext
      ) {
        parentRootContext.setValue(null, eventDetails);
      }
    });
  };

  const handleUnmount = () => {
    untrack(() => {
      const doc = ownerDocument(rootRef.current);
      const activeEl = activeElement(doc);
      const popup = popupElement();

      const isReturnFocusBlocked = closeReason ? blockedReturnFocusReasons.has(closeReason) : false;

      if (
        !isReturnFocusBlocked &&
        isHTMLElement(prevTriggerElementRef.current) &&
        (activeEl === ownerDocument(popup).body || contains(popup, activeEl)) &&
        popup
      ) {
        (prevTriggerElementRef.current as HTMLElement).focus({ preventScroll: true });
        prevTriggerElementRef.current = undefined;
      }

      setMounted(false);
      componentProps.onOpenChangeComplete?.(false);
      setActivationDirection(null);
      setFloatingRootContext(undefined);

      currentContentRef.current = null;
      closeReason = undefined;
    });
  };

  createOpenChangeComplete({
    open,
    getElement: popupElement,
    onComplete() {
      if (!open()) {
        handleUnmount();
      }
    },
  });

  createOpenChangeComplete({
    open,
    getElement: viewportTargetElement,
    onComplete() {
      if (!open()) {
        handleUnmount();
      }
    },
  });

  const contextActivationDirection = () => (open() ? activationDirection() : null);

  const contextValue: NavigationMenuRootContext<Value> = {
    open,
    value,
    setValue,
    mounted,
    transitionStatus,
    positionerElement,
    setPositionerElement,
    popupElement,
    setPopupElement,
    viewportElement,
    setViewportElement,
    viewportTargetElement,
    setViewportTargetElement,
    activationDirection: contextActivationDirection,
    setActivationDirection,
    floatingRootContext,
    setFloatingRootContext,
    currentContentRef,
    nested,
    rootRef,
    beforeInsideRef,
    afterInsideRef,
    beforeOutsideRef,
    afterOutsideRef,
    prevTriggerElementRef,
    popupAutoSizeResetRef,
    delay: () => componentProps.delay ?? 50,
    closeDelay: () => componentProps.closeDelay ?? 50,
    orientation: () => componentProps.orientation ?? 'horizontal',
    viewportInert,
    setViewportInert,
  };

  const content = (
    <NavigationMenuRootContext.Provider value={contextValue as NavigationMenuRootContext<any>}>
      <NavigationMenuTreeContent<Value> componentProps={componentProps} />
    </NavigationMenuRootContext.Provider>
  );

  return (
    <Show when={!nested} fallback={content}>
      {/* FloatingTree provides context to nested menus. */}
      <FloatingTree>{content}</FloatingTree>
    </Show>
  );
}

function NavigationMenuTreeContent<Value>(props: {
  componentProps: NavigationMenuRoot.Props<Value>;
}): JSX.Element {
  // `props.componentProps` is a stable object reference for this component's lifetime (Root passes
  // its own `componentProps` through unchanged), not a reactive value that's swapped — safe to read
  // directly. The lint rule can't see through the prop boundary, hence the suppression.
  const [, elementProps] = splitProps(props.componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'value',
    'defaultValue',
    'onValueChange',
    'delay',
    'closeDelay',
    'orientation',
    'onOpenChangeComplete',
  ]);

  const ctx = useNavigationMenuRootContext<Value>();
  const nodeId = useFloatingNodeId();

  const state: NavigationMenuRootState = {
    get open() {
      return ctx.open();
    },
    get nested() {
      return ctx.nested;
    },
  };

  return (
    <NavigationMenuTreeContext.Provider value={nodeId}>
      {renderElement(() => (ctx.nested ? 'div' : 'nav'), props.componentProps, {
        defaultClass: 'wheel-NavigationMenu-Root',
        slot: 'navigation-menu-root',
        state,
        ref: (el: any) => {
          ctx.rootRef.current = el;
        },
        props: elementProps,
      })}
    </NavigationMenuTreeContext.Provider>
  );
}

export interface NavigationMenuRootState {
  /**
   * If `true`, the popup is open.
   */
  open: boolean;
  /**
   * Whether the navigation menu is nested.
   */
  nested: boolean;
}

export interface NavigationMenuRootProps<Value = any>
  extends BaseUIComponentProps<'nav', NavigationMenuRootState> {
  /**
   * Event handler called after any animations complete when the navigation menu is closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * The controlled value of the navigation menu item that should be currently open.
   * When non-nullish, the menu will be open. When nullish, the menu will be closed.
   *
   * To render an uncontrolled navigation menu, use the `defaultValue` prop instead.
   * @default null
   */
  value?: Value | null | undefined;
  /**
   * The uncontrolled value of the item that should be initially selected.
   *
   * To render a controlled navigation menu, use the `value` prop instead.
   * @default null
   */
  defaultValue?: Value | null | undefined;
  /**
   * Callback fired when the value changes.
   */
  onValueChange?:
    | ((value: Value | null, eventDetails: NavigationMenuRoot.ChangeEventDetails) => void)
    | undefined;
  /**
   * How long to wait before opening the navigation popup. Specified in milliseconds.
   * @default 50
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the navigation popup. Specified in milliseconds.
   * @default 50
   */
  closeDelay?: number | undefined;
  /**
   * The orientation of the navigation menu.
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical' | undefined;
}

export type NavigationMenuRootChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.triggerHover
  | typeof REASONS.outsidePress
  | typeof REASONS.listNavigation
  | typeof REASONS.focusOut
  | typeof REASONS.escapeKey
  | typeof REASONS.linkPress
  | typeof REASONS.none;

export type NavigationMenuRootChangeEventDetails =
  BaseUIChangeEventDetails<NavigationMenuRootChangeEventReason>;

export namespace NavigationMenuRoot {
  export type State = NavigationMenuRootState;
  export type Props<TValue = any> = NavigationMenuRootProps<TValue>;
  export type Value<TValue = any> = TValue | null;
  export type ChangeEventReason = NavigationMenuRootChangeEventReason;
  export type ChangeEventDetails = NavigationMenuRootChangeEventDetails;
}
