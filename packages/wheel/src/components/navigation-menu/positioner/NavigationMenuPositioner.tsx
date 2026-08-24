/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, onCleanup, splitProps, type JSX } from 'solid-js';
import { mergeCleanups } from '../../base-utils/mergeCleanups';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerWindow } from '../../base-utils/owner';
import { createTimeout } from '../../base-utils/createTimeout';
import {
  disableFocusInside,
  enableFocusInside,
  isOutsideEvent,
} from '../../floating-ui-solid/utils/tabbable';
import {
  useNavigationMenuRootContext,
  useNavigationMenuTreeContext,
} from '../root/NavigationMenuRootContext';
import { useNavigationMenuPortalContext } from '../portal/NavigationMenuPortalContext';
import {
  useAnchorPositioning,
  type Align,
  type Side,
  type UseAnchorPositioningSharedParameters,
} from '../../utils/useAnchorPositioning';
import { NavigationMenuPositionerContext } from './NavigationMenuPositionerContext';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';
import { createPositioner } from '../../utils/createPositioner';
import type { BaseUIComponentProps } from '../../internals/types';
import { FloatingRootStore } from '../../floating-ui-solid/components/FloatingRootStore';
import { PopupTriggerMap } from '../../utils/popups/popupTriggerMap';

/**
 * Positions the navigation menu against the currently active trigger.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 *
 * Deviation: upstream forwards its own per-render `floatingRootContext` (whichever trigger is
 * currently active — the identity swaps as the active item changes) into `useAnchorPositioning`.
 * The shared `useAnchorPositioning`/`useFloating` hooks in this port fix their underlying store
 * reference at setup time (correct for every other popup, which owns exactly one
 * `FloatingRootContext` for its whole lifetime) — remounting them on every trigger switch would
 * tear down and recreate this element (and everything portalled inside it, including the shared
 * viewport), destroying the cross-item transition this component exists for. Instead, this
 * Positioner passes its own stable, never-swapped `FloatingRootStore` into `useAnchorPositioning`
 * (see `positioningRootContext` below) purely for open-state bookkeeping, and derives a separate,
 * reactively-composed `domReference` accessor from the Root's own swapping `floatingRootContext`
 * signal for the anchor. `useAnchorPositioning`'s own position-reference effect already re-reads
 * its `anchor` accessor on every change, so positioning still follows the active trigger correctly
 * — see this port's final report for the underlying shared-infra gap this works around (ideally
 * these hooks would accept a reactive `Accessor<FloatingRootContext | undefined>`).
 */
export function NavigationMenuPositioner(componentProps: NavigationMenuPositioner.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'anchor',
    'positionMethod',
    'side',
    'align',
    'sideOffset',
    'alignOffset',
    'collisionBoundary',
    'collisionPadding',
    'collisionAvoidance',
    'arrowPadding',
    'sticky',
    'disableAnchorTracking',
  ]);

  const {
    open,
    mounted,
    positionerElement,
    setPositionerElement,
    floatingRootContext,
    nested,
    transitionStatus,
  } = useNavigationMenuRootContext();

  const keepMounted = useNavigationMenuPortalContext();
  const nodeId = useNavigationMenuTreeContext();

  const initialInstantTimeout = createTimeout();
  const resizeTimeout = createTimeout();

  // When the menu is initially open, disable the positioner's transition for one frame
  // so a default value does not animate in from the unpositioned portal state.
  const [instant, setInstant] = createSignal(open());
  let needsInitialInstantReset = open();

  let prevTriggerElement: Element | null = null;

  // https://codesandbox.io/s/tabbable-portal-f4tng?file=/src/TabbablePortal.tsx
  createEffect(() => {
    const positioner = positionerElement();
    if (!positioner) {
      return;
    }

    // Make sure elements inside the portal element are tabbable only when the
    // portal has already been focused, either by tabbing into a focus trap
    // element outside or using the mouse.
    function onFocus(event: FocusEvent) {
      if (positioner && isOutsideEvent(event)) {
        const focusing = event.type === 'focusin';
        const manageFocus = focusing ? enableFocusInside : disableFocusInside;
        manageFocus(positioner);
      }
    }

    // Listen to the event on the capture phase so they run before the focus
    // trap elements onFocus prop is called.
    onCleanup(
      mergeCleanups(
        addEventListener(positioner, 'focusin', onFocus, true),
        addEventListener(positioner, 'focusout', onFocus, true),
      ),
    );
  });

  // Reactively derives the currently active trigger's DOM reference from whichever
  // `FloatingRootContext` the Root currently points at (see this file's doc comment).
  const domReference = () => {
    const ctx = floatingRootContext();
    return ctx ? (ctx.state.domReferenceElement as Element | null) : null;
  };

  createEffect(() => {
    const dom = domReference();
    if (dom) {
      prevTriggerElement = dom;
    }
  });

  const anchor = () => componentProps.anchor ?? domReference() ?? prevTriggerElement;

  // A stable, Positioner-owned `FloatingRootContext` used purely to drive `useFloating`'s
  // open-state bookkeeping (`isPositioned` reset behavior, `FloatingTree` node registration for
  // this Root's `nodeId`) — NOT the swapping per-trigger context (see this file's top doc
  // comment; that's threaded separately, only into `anchor`, above).
  //
  // Passing `floatingRootContext: undefined` instead (letting `useAnchorPositioning`'s internal
  // `useFloating` call fall back to its own auto-created store) would break `isPositioned`
  // entirely: that fallback's `open` sync does `access(options.open) ?? false`, and
  // `useAnchorPositioning` computes `options.open` as `keepMounted() ? mounted() : undefined` —
  // for a non-`keepMounted` portal this is `undefined`, which the `?? false` coalesces to `false`,
  // permanently satisfying `usePosition`'s "treat as closed, never mark positioned" branch (found
  // by tracing why `computePosition` resolved — confirmed via a throwaway instrumented run — yet
  // the positioner stayed at `opacity: 0` forever). Supplying our own store here bypasses that
  // fallback path entirely (`useFloating` uses `options.rootContext` verbatim when present), so we
  // control `open` directly and never pass through that coercion.
  const positioningRootContext = new FloatingRootStore({
    open: mounted(),
    transitionStatus: undefined,
    referenceElement: null,
    floatingElement: null,
    triggerElements: new PopupTriggerMap(),
    floatingId: undefined,
    syncOnly: true,
    nested: false,
    onOpenChange: undefined,
  });
  positioningRootContext.syncValue('open', mounted);

  const positioning = useAnchorPositioning({
    anchor,
    floatingRootContext: positioningRootContext,
    positionMethod: () => componentProps.positionMethod ?? 'absolute',
    mounted,
    side: () => componentProps.side ?? 'bottom',
    sideOffset: () => componentProps.sideOffset ?? 0,
    align: () => componentProps.align ?? 'center',
    alignOffset: () => componentProps.alignOffset ?? 0,
    arrowPadding: () => componentProps.arrowPadding ?? 5,
    collisionBoundary: () => componentProps.collisionBoundary ?? 'clipping-ancestors',
    collisionPadding: () => componentProps.collisionPadding ?? 5,
    sticky: () => componentProps.sticky ?? false,
    disableAnchorTracking: () => componentProps.disableAnchorTracking ?? false,
    keepMounted: () => keepMounted,
    collisionAvoidance: () =>
      componentProps.collisionAvoidance ??
      (nested ? POPUP_COLLISION_AVOIDANCE : DROPDOWN_COLLISION_AVOIDANCE),
    nodeId,
    // The adaptive-origin middleware returns zero coordinates while this positioner's dimensions
    // transition. Standard transform positioning keeps the popup attached to its trigger.
    adaptiveOrigin: undefined,
  });

  const state: NavigationMenuPositionerState = {
    get open() {
      return open();
    },
    get side() {
      return positioning.side();
    },
    get align() {
      return positioning.align();
    },
    get anchorHidden() {
      return positioning.anchorHidden();
    },
    get instant() {
      return instant();
    },
  };

  createEffect(() => {
    if (!open()) {
      return;
    }

    if (needsInitialInstantReset) {
      initialInstantTimeout.start(0, () => {
        needsInitialInstantReset = false;

        if (!resizeTimeout.isStarted()) {
          setInstant(false);
        }
      });
    }

    function handleResize() {
      setInstant(true);

      resizeTimeout.start(100, () => {
        setInstant(false);
      });
    }

    const win = ownerWindow(positionerElement());
    onCleanup(addEventListener(win, 'resize', handleResize));
  });

  return (
    <NavigationMenuPositionerContext.Provider value={positioning}>
      {createPositioner(componentProps, state, {
        defaultClass: 'wheel-NavigationMenu-Positioner',
        slot: 'navigation-menu-positioner',
        styles: positioning.positionerStyles,
        transitionStatus,
        props: elementProps,
        // `positioning.refs.setFloating` must be wired to this element manually: unlike
        // Popover/Menu (whose shared popup store feeds `floatingElement` into their
        // `FloatingRootStore` automatically via `useSyncedFloatingRootContext`, keyed off the
        // store's own `positionerElement` field), this Positioner never threads a
        // `floatingRootContext` into `useAnchorPositioning` at all (see this file's top doc
        // comment) — so nothing else ever calls `usePosition`'s `elements.floating`, and
        // `computePosition`/`isPositioned` would never resolve without this.
        refs: [setPositionerElement, positioning.refs.setFloating],
        hidden: () => !mounted(),
        inert: () => !open(),
      })}
    </NavigationMenuPositionerContext.Provider>
  );
}

export interface NavigationMenuPositionerState {
  /**
   * Whether the navigation menu is currently open.
   */
  open: boolean;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the anchor element is hidden.
   */
  anchorHidden: boolean;
  /**
   * Whether CSS transitions should be disabled.
   */
  instant: boolean;
}

export interface NavigationMenuPositionerProps
  extends UseAnchorPositioningSharedParameters,
    BaseUIComponentProps<'div', NavigationMenuPositionerState> {}

export namespace NavigationMenuPositioner {
  export type State = NavigationMenuPositionerState;
  export type Props = NavigationMenuPositionerProps;
}
