/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createSignal, splitProps, type Accessor, type JSX } from 'solid-js';
import { createTimeout } from '../../base-utils/createTimeout';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { ownerDocument } from '../../base-utils/owner';
import { safePolygon, useClick, useFocus, useHoverReferenceInteraction } from '../../floating-ui-solid';
import { useMenuRootContext } from '../root/MenuRootContext';
import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, BaseUIEvent, HTMLProps, NativeButtonProps } from '../../internals/types';
import { createButton } from '../../internals/use-button/createButton';
import { createCompositeItem } from '../../internals/composite/item/createCompositeItem';
import { createTriggerDataForwarding } from '../../utils/popups';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants';
import { REASONS } from '../../internals/reasons';
import type { MenubarContext } from '../../menubar/MenubarContext';

/**
 * A button that opens the menu.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviations from upstream (see `MenuRoot.tsx`'s doc comment for the broader context):
 * - No `handle` prop (detached triggers aren't ported). Menubar integration (added for the
 *   Menubar port) is therefore only meaningful for *contained* triggers — the `isInMenubar`
 *   branch below never has to account for a detached trigger discovering its parent late.
 * - No mousedown-then-mouseup-on-item "drag select" affordance
 *   (`allowMouseUpTriggerRef`/`handleDocumentMouseUp`) — a secondary UX nicety not exercised by the
 *   ported behavioral test slice.
 * - No pre/post `FocusGuard` pair around the mounted trigger (`triggerFocusTargetRef`/
 *   `beforeContentFocusGuardRef`) — that pair exists upstream to keep Tab continuity across a
 *   *detached* trigger/popup pair; `FloatingPortal`'s own before/after-outside guards (which resolve
 *   `getNextTabbable`/`getPreviousTabbable(domReference)`) already provide the core forward/backward
 *   tab-past-the-trigger behavior for the standard (non-detached) case this port targets.
 * - `isInMenubar` renders through the same `renderElement` call as the standalone case (rather
 *   than upstream's separate `<CompositeItem>` element) by merging `createCompositeItem`'s roving-
 *   tabindex props directly into the props array — see `internals/composite/item/CompositeItem.tsx`
 *   for the JSX-wrapper equivalent (used elsewhere, e.g. `toggle-group`); `tabs/tab/TabsTab.tsx`
 *   uses this same lower-level API for the same reason (it needs to fold composite props into an
 *   existing `renderElement` call instead of introducing a second element).
 */
export function MenuTrigger<Payload = unknown>(
  componentProps: MenuTrigger.Props<Payload>,
): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
    'id',
    'openOnHover',
    'delay',
    'closeDelay',
    'payload',
  ]);

  const { store, parent } = useMenuRootContext();
  const isInMenubar = parent.type === 'menubar';
  const menubarContext = isInMenubar ? (parent.context as MenubarContext) : undefined;

  const thisTriggerId = createBaseUiId(() => local.id);
  const isTriggerActive = store.useState('isTriggerActive', thisTriggerId);
  const isOpenedByThisTrigger = store.useState('isOpenedByTrigger', thisTriggerId);
  const popupId = store.useState('triggerPopupId', thisTriggerId);
  const floatingRootContext = store.state.floatingRootContext;

  const triggerElementRef: { current: Element | null } = { current: null };

  const delayWithDefault = () => local.delay ?? 100;
  const closeDelayWithDefault = () => local.closeDelay ?? 0;

  const { registerTrigger, isMountedByThisTrigger } = createTriggerDataForwarding(
    thisTriggerId,
    triggerElementRef,
    store,
    () => ({
      payload: local.payload,
      closeDelay: closeDelayWithDefault(),
    }),
  );

  const rootDisabled = store.useState('disabled');
  const disabled = () => local.disabled || rootDisabled() || Boolean(menubarContext?.disabled());
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const parentMenubarHasSubmenuOpen = () => Boolean(menubarContext?.hasSubmenuOpen());

  const openOnHover = () => local.openOnHover ?? parentMenubarHasSubmenuOpen();

  const hoverProps = useHoverReferenceInteraction(floatingRootContext, {
    enabled: () =>
      openOnHover() &&
      !disabled() &&
      (!isInMenubar || (parentMenubarHasSubmenuOpen() && !isMountedByThisTrigger())),
    handleClose: safePolygon({ blockPointerEvents: !isInMenubar }),
    mouseOnly: () => true,
    move: () => false,
    restMs: () => (isInMenubar ? 0 : delayWithDefault()),
    delay: () => ({ close: closeDelayWithDefault() }),
    triggerElementRef,
    isActiveTrigger: isTriggerActive,
    isClosing: () => store.state.transitionStatus === 'ending',
  });

  const stickIfOpenComputed = createStickIfOpen(
    isOpenedByThisTrigger,
    () => store.state.openChangeReason,
  );

  const click = useClick(floatingRootContext, {
    enabled: () => !disabled(),
    // Deviation: upstream's Menubar variant switches the "open" event from `mousedown` to `click`
    // only once this trigger's own menu is the one currently open (`isOpenedByThisTrigger`), so a
    // repeat press on the *already-open* trigger doesn't toggle-close on mousedown before the
    // browser has even fired `click` — letting the `useMixedToggleClickHandler` pairing below undo
    // any stray toggle from the mousedown that opened it.
    event: () => (isOpenedByThisTrigger() && isInMenubar ? 'click' : 'mousedown'),
    toggle: () => true,
    ignoreMouse: () => false,
    stickIfOpen: () => (isInMenubar ? false : stickIfOpenComputed()),
  });

  const focus = useFocus(floatingRootContext, {
    enabled: () => !disabled() && parentMenubarHasSubmenuOpen(),
  });

  const mixedToggleHandlers = isInMenubar
    ? createMixedToggleClickHandler({ open: isOpenedByThisTrigger, mouseDownAction: 'open' })
    : EMPTY_OBJECT;

  const rootTriggerProps = store.useState('triggerProps', isMountedByThisTrigger);

  const compositeItem = isInMenubar ? createCompositeItem<unknown>() : undefined;
  const roleProps = isInMenubar ? { role: 'menuitem' as const } : EMPTY_OBJECT;

  const state: MenuTrigger.State = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Menu-Trigger',
    slot: 'menu-trigger',
    state,
    ref: [
      buttonRef,
      registerTrigger,
      (el: Element | null) => {
        triggerElementRef.current = el;
      },
      (el: HTMLElement | null) => compositeItem?.compositeRef(el),
    ],
    props: [
      () => compositeItem?.compositeProps() ?? EMPTY_OBJECT,
      focus.reference,
      click.reference,
      () => hoverProps() ?? EMPTY_OBJECT,
      rootTriggerProps,
      () => ({
        'aria-haspopup': 'menu' as const,
        'aria-controls': popupId(),
        id: thisTriggerId(),
      }),
      roleProps,
      mixedToggleHandlers,
      elementProps,
      getButtonProps,
    ],
    stateAttributesMapping: pressableTriggerOpenStateMapping,
  });
}

/**
 * Determines whether to ignore clicks after a hover-open — "patient" clicks made shortly after the
 * menu opened via hover keep it open instead of toggling it closed. Solid port of upstream's
 * `useStickIfOpen` (a `useIsoLayoutEffect`), translated directly to a `createEffect`.
 */
function createStickIfOpen(open: Accessor<boolean>, openReason: Accessor<string | null>): Accessor<boolean> {
  const timeout = createTimeout();
  const [stickIfOpen, setStickIfOpen] = createSignal(false);

  createEffect(() => {
    if (open() && openReason() === REASONS.triggerHover) {
      setStickIfOpen(true);
      timeout.start(PATIENT_CLICK_THRESHOLD, () => setStickIfOpen(false));
    } else if (!open()) {
      timeout.clear();
      setStickIfOpen(false);
    }
  });

  return stickIfOpen;
}

/**
 * Solid port of upstream's `useMixedToggleClickHandler`: fixes the behavior of a trigger toggled
 * by two different events (mousedown to open, click to close) so the popup doesn't immediately
 * close again once the mouse button is released. Only used for Menubar items (see call site).
 * Unlike upstream's `useMemo`-based version (which recomputes a new handlers object whenever
 * `open` changes so its closures capture the latest value), this reads `params.open()` live inside
 * each handler, so a single object can be created once.
 */
function createMixedToggleClickHandler(params: {
  open: Accessor<boolean>;
  mouseDownAction: 'open' | 'close';
}): HTMLProps {
  let ignoreClick = false;

  return {
    onMouseDown(event: MouseEvent) {
      const isOpen = params.open();
      if (
        (params.mouseDownAction === 'open' && !isOpen) ||
        (params.mouseDownAction === 'close' && isOpen)
      ) {
        ignoreClick = true;

        ownerDocument(event.currentTarget as Element).addEventListener(
          'click',
          () => {
            ignoreClick = false;
          },
          { once: true },
        );
      }
    },
    onClick(event: BaseUIEvent<MouseEvent>) {
      if (ignoreClick) {
        ignoreClick = false;
        event.preventBaseUIHandler();
      }
    },
  };
}

export interface MenuTriggerState {
  /**
   * Whether the menu is currently open and was opened by this trigger.
   */
  open: boolean;
  /**
   * Whether the trigger is disabled.
   */
  disabled: boolean;
}

export interface MenuTriggerProps<Payload = unknown>
  extends NativeButtonProps,
    BaseUIComponentProps<'button', MenuTriggerState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * A payload to pass to the menu when it is opened.
   */
  payload?: Payload | undefined;
  /**
   * How long to wait before the menu may be opened on hover. Specified in milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 100
   */
  delay?: number | undefined;
  /**
   * How long to wait before closing the menu that was opened on hover.
   * Specified in milliseconds.
   *
   * Requires the `openOnHover` prop.
   * @default 0
   */
  closeDelay?: number | undefined;
  /**
   * Whether the menu should also open when the trigger is hovered.
   * @default false
   */
  openOnHover?: boolean | undefined;
}

export namespace MenuTrigger {
  export type Props<Payload = unknown> = MenuTriggerProps<Payload>;
  export type State = MenuTriggerState;
}
