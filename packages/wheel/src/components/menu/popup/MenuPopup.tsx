/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, splitProps, type JSX } from 'solid-js';
import { FloatingFocusManager, useHoverFloatingInteraction } from '../../floating-ui-solid';
import { useMenuRootContext } from '../root/MenuRootContext';
import type { MenuRoot } from '../root/MenuRoot';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Side, Align } from '../../utils/useAnchorPositioning';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { getDisabledMountTransitionStyles } from '../../utils/getDisabledMountTransitionStyles';
import { menuPopupStateAttributesMapping } from './stateAttributesMapping';
import { useContextMenuRootContext } from '../../context-menu/root/ContextMenuRootContext';

/**
 * A container for the menu items.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviation: no `finalFocus` prop (a detached-trigger imperative-close affordance) — see
 * `MenuRoot.tsx`'s doc comment. Menubar parent handling (hover disabled while hosted by a
 * Menubar; `returnFocus` extended for it) is additive, added for the Menubar port. Context Menu
 * handling (hover disabled, `returnFocus`/`modal` forced true) is additive too, reading
 * `useContextMenuRootContext(true)` directly rather than a `MenuParent` variant — restricted to
 * the root popup (`parent().type === undefined`) so a genuine submenu nested inside a context
 * menu's tree is unaffected.
 */
export function MenuPopup(componentProps: MenuPopup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, ['class', 'style', 'as', 'asChild', 'children']);

  const { store } = useMenuRootContext();
  const positioner = useMenuPositionerContext();

  const open = store.useState('open');
  const transitionStatus = store.useState('transitionStatus');
  const popupProps = store.useState('popupProps');
  const mounted = store.useState('mounted');
  const instantType = store.useState('instantType');
  const triggerElement = store.useState('activeTriggerElement');
  const parent = store.useState('parent');
  const floatingContext = store.state.floatingRootContext;
  const floatingTreeRoot = store.useState('floatingTreeRoot');
  const closeDelay = store.useState('closeDelay');
  const hoverEnabled = store.useState('hoverEnabled');
  const disabled = store.useState('disabled');
  const openMethod = store.useState('openMethod');
  const activeIndex = store.useState('activeIndex');
  const lastOpenChangeReason = store.useState('lastOpenChangeReason');
  const contextMenuContext = useContextMenuRootContext(true);
  // Root popup of a `ContextMenu.Root` only — a submenu nested inside one still has
  // `parent().type === 'menu'` and is unaffected.
  const isContextMenu = () => contextMenuContext !== undefined && parent().type === undefined;

  let popupElement: HTMLElement | null = null;

  createOpenChangeComplete({
    open,
    getElement: () => popupElement,
    onComplete() {
      if (open()) {
        store.context.onOpenChangeComplete?.(true);
      }
    },
  });

  createEffect(() => {
    function handleClose(event: { domEvent: Event | undefined; reason: MenuRoot.ChangeEventReason }) {
      // Deferred to a microtask: an item click can broadcast a single `close` event that every
      // ancestor/descendant `Menu.Popup` on the same (possibly shared/delegated — see
      // `MenuStore.ts`'s `floatingTreeRoot` selector) tree listens to, closing several levels at
      // once (e.g. a `ContextMenu` item inside a hover-opened submenu closing both). Solid's
      // synchronous reactivity means the FIRST handler's `store.setOpen(false, ...)` can
      // synchronously unmount a descendant's `Menu.Popup` — tearing down its own listener — before
      // the shared emitter's `forEach` (see `floating-ui-solid/utils/createEventEmitter.ts`) even
      // reaches it, silently dropping that still-open menu's own close. Deferring every handler's
      // actual `setOpen` call lets the synchronous dispatch loop finish visiting (and only then
      // acting on) every listener that was registered at emit time, regardless of what any other
      // handler's state change does. Upstream doesn't need this: React batches the state updates
      // from same-tick `setOpen` calls, so no listener ever gets torn down mid-dispatch.
      queueMicrotask(() => {
        store.setOpen(false, createChangeEventDetails(event.reason, event.domEvent));
      });
    }

    floatingTreeRoot().events.on('close', handleClose);
    onCleanup(() => {
      floatingTreeRoot().events.off('close', handleClose);
    });
  });

  useHoverFloatingInteraction(floatingContext, {
    enabled: () =>
      hoverEnabled() &&
      !disabled() &&
      parent().type !== 'menu' &&
      parent().type !== 'menubar' &&
      !isContextMenu(),
    closeDelay,
  });

  const state: MenuPopup.State = {
    get transitionStatus() {
      return transitionStatus();
    },
    get side() {
      return positioner.side();
    },
    get align() {
      return positioner.align();
    },
    get open() {
      return open();
    },
    get nested() {
      return parent().type === 'menu';
    },
    get instant() {
      return instantType();
    },
  };

  const returnFocus = () => {
    if (parent().type === undefined || isContextMenu()) {
      return true;
    }
    if (parent().type === 'menubar' && lastOpenChangeReason() !== REASONS.outsidePress) {
      return true;
    }
    return Boolean(triggerElement());
  };

  // Deviation/suspected shared-infra issue: `FloatingFocusManager`'s default `initialFocus={true}`
  // behavior finds "the first tabbable element" by inspecting live DOM `tabindex` (via the
  // `tabbable` package). Menu items use a *roving* tabindex (`tabIndex: open && highlighted ? 0 :
  // -1`) that only becomes `0` once `useListNavigation`'s own effect sets `activeIndex` to `0` on
  // open — a separate, independently-scheduled effect. In this Solid port, that write and
  // `FloatingFocusManager`'s tabbable-content lookup are both plain `createEffect`s with no
  // ordering guarantee between them; when the lookup runs first, no item is yet tabbable, so it
  // falls back to `FloatingFocusManager`'s own inside `FocusGuard`s (which always carry
  // `tabIndex={0}`) — focus lands on a guard instead of the first item, and the guard's own
  // "focus arrived from outside, redirect and (if `closeOnFocusOut`) close" logic immediately
  // closes the menu that was just opened. Observed empirically via `userEvent.click`/plain
  // `fireEvent.click` in this port's test suite (see `Menu.test.tsx`); not reproduced by upstream
  // React (whose layout-effect flush order and real-browser rAF timing apparently avoid the race).
  // Reported as a suspected `FloatingFocusManager`/`useListNavigation` interaction bug in the final
  // report rather than patched in shared code. Worked around here, locally, by bypassing the
  // tabbable-content heuristic entirely: point `initialFocus` directly at the known DOM node for
  // the item at `activeIndex` (populated synchronously by `CompositeList`'s ref callback,
  // independent of the reactive `activeIndex` write), falling back to the default heuristic only
  // when no such item exists (e.g. an empty menu).
  const resolvedInitialFocus = (): boolean | { current: HTMLElement | null } => {
    if (parent().type === 'menu') {
      return false;
    }
    const index = activeIndex() ?? 0;
    const element = store.context.itemDomElements[index] as HTMLElement | undefined;
    return element ? { current: element } : true;
  };

  return (
    <FloatingFocusManager
      context={floatingContext}
      openInteractionType={openMethod()}
      modal={isContextMenu()}
      disabled={!mounted()}
      returnFocus={returnFocus()}
      initialFocus={resolvedInitialFocus()}
      restoreFocus
      externalTree={floatingTreeRoot()}
      previousFocusableElement={triggerElement() as HTMLElement | null}
    >
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Menu-Popup',
        slot: 'menu-popup',
        state,
        ref: (el: HTMLElement | null) => {
          popupElement = el;
          store.set('popupElement', el);
        },
        props: [
          popupProps,
          () => getDisabledMountTransitionStyles(transitionStatus()),
          elementProps,
          { 'data-rootownerid': store.state.rootId } as Record<string, string>,
        ],
        stateAttributesMapping: menuPopupStateAttributesMapping,
      })}
    </FloatingFocusManager>
  );
}

export interface MenuPopupProps extends BaseUIComponentProps<'div', MenuPopupState> {
  /**
   * @ignore
   */
  id?: string | undefined;
}

export interface MenuPopupState {
  /**
   * The transition status of the component.
   */
  transitionStatus: TransitionStatus;
  /**
   * The side of the anchor the component is placed on.
   */
  side: Side;
  /**
   * The alignment of the component relative to the anchor.
   */
  align: Align;
  /**
   * Whether the menu is currently open.
   */
  open: boolean;
  /**
   * Whether the component is nested.
   */
  nested: boolean;
  /**
   * Whether transitions should be skipped.
   */
  instant: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
}

export namespace MenuPopup {
  export type Props = MenuPopupProps;
  export type State = MenuPopupState;
}
