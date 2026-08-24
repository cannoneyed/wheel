/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, createUniqueId, Show, untrack, type Accessor, type JSX } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import {
  FloatingTree,
  useDismiss,
  useFloatingNodeId,
  useFloatingParentNodeId,
  useFloatingTree,
  useListNavigation,
  useTypeahead,
} from '../../floating-ui-solid';
import { mergeProps } from '../../merge-props/mergeProps';
import type { HTMLProps } from '../../internals/types';
import { useDirection } from '../../internals/direction-context/DirectionContext';
import { TYPEAHEAD_RESET_MS } from '../../internals/constants';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createImplicitActiveTrigger,
  createOpenStateTransitions,
  createPopupInteractionProps,
  createPopupRootStore,
  FOCUSABLE_POPUP_PROPS,
} from '../../utils/popups';
import { createOpenInteractionType } from '../../utils/useOpenInteractionType';
import { MenuStore, type State as MenuStoreState } from '../store/MenuStore';
import { MenuRootContext, useMenuRootContext } from './MenuRootContext';
import { useMenuSubmenuRootContext } from '../submenu-root/MenuSubmenuRootContext';
import { useMenubarContext, type MenubarContext } from '../../menubar/MenubarContext';
import type { MenuOpenEventDetails } from '../utils/types';

/**
 * Groups all parts of the menu.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviations from upstream (see also `store/MenuStore.ts`):
 * - No `handle`/`actionsRef`/`triggerId`+detached-trigger support (Menu is the first Solid
 *   FloatingTree consumer; detached triggers are explicitly out of scope for this pass — see
 *   `utils/popups/popupStoreUtils.ts`'s `createPopupRootStore` doc comment).
 * - No Context Menu parent integration (explicitly skipped per the porting brief). `MenuParent`
 *   is `'menu'` (a submenu), `'menubar'` (a contained Menubar item — added for the Menubar port,
 *   see below), or `undefined` (top-level).
 * - Menubar integration (added for the Menubar port) only supports *contained* triggers (a
 *   `Menu.Trigger` that is itself a descendant of the `Menu.Root` it opens, the only case this
 *   Menu port supports at all — see `MenuTrigger.tsx`'s doc comment). Upstream's Menubar support
 *   additionally forwards `floatingTreeRoot`/`floatingNodeId`/`floatingParentNodeId` up from
 *   `MenuTrigger` (via `useTriggerDataForwarding`) so *detached* triggers elsewhere in the tree
 *   still discover Menubar's ambient `FloatingTree`. Since detached triggers aren't ported, this
 *   port instead has `MenuRoot` read the ambient tree directly: a contained `Menu.Root` is a
 *   genuine JSX descendant of `<Menubar>`'s `<FloatingTree>` (Menubar reads `props.children` deep
 *   inside its own returned JSX, after the FloatingTree/FloatingNode/MenubarContext providers are
 *   already established — the same "context resolved at creation time" guarantee this file's own
 *   submenu `<FloatingTree>` wrapping relies on), so `useFloatingTree()` here already resolves to
 *   Menubar's tree without any forwarding step.
 * - Upstream relays `setOpen` through a `floatingEvents.on('setOpen', ...)` subscription so an
 *   imperative `MenuHandle.open()` call (from an unrelated detached trigger) reaches the root even
 *   across a handle re-attach. Since detached triggers aren't ported, this port instead wires
 *   `MenuStore.setOpen` directly as `useSyncedFloatingRootContext`'s `onOpenChange` via
 *   `createPopupRootStore` (identical to `TooltipRoot`) — every interaction hook that calls
 *   `floatingRootContext.setOpen(...)` reaches `MenuStore.setOpen` the same way, without the extra
 *   indirection.
 */

/**
 * Calls a value that `useListNavigation` returns as a genuine zero-arg thunk (it carries
 * `aria-activedescendant`, so it must stay reactive) but whose static `ElementProps` field type
 * (`HTMLProps | undefined`) doesn't reflect that it's callable.
 */
function callThunk(value: HTMLProps | undefined): HTMLProps | undefined {
  return typeof value === 'function' ? (value as unknown as () => HTMLProps)() : value;
}

export function MenuRoot<Payload = unknown>(props: MenuRoot.Props<Payload>): JSX.Element {
  const disabled = () => props.disabled ?? false;
  const modalProp = () => props.modal;
  const loopFocus = () => props.loopFocus ?? true;
  const orientation = () => props.orientation ?? 'vertical';
  const closeParentOnEsc = () => props.closeParentOnEsc ?? false;
  const highlightItemOnHover = () => props.highlightItemOnHover ?? true;

  const parentMenuRootContext = useMenuRootContext(true);
  const submenuRootContext = useMenuSubmenuRootContext();
  const isSubmenu = submenuRootContext !== undefined;
  const menubarContext = useMenubarContext(true);

  const parentFromContext: MenuParent =
    isSubmenu && parentMenuRootContext
      ? { type: 'menu', store: parentMenuRootContext.store }
      : menubarContext
        ? { type: 'menubar', context: menubarContext }
        : { type: undefined };

  const itemDomElements: Array<HTMLElement | null> = [];
  const itemLabels: Array<string | null> = [];
  const typingRef = { current: false };
  const rootId = `base-ui-${createUniqueId()}`;

  const store = createPopupRootStore<MenuStoreState<Payload>, MenuStore<Payload>>(
    (floatingId, nested) =>
      new MenuStore<Payload>(
        untrack(() => ({
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
          parent: parentFromContext,
          modal: parentFromContext.type === undefined ? modalProp() : undefined,
          rootId,
        })),
        floatingId,
        nested,
        itemDomElements,
        itemLabels,
        typingRef,
      ),
  );

  store.syncValue('openProp', () => props.open);
  store.syncValue('triggerIdProp', () => props.triggerId);
  store.syncValue('disabled', disabled);
  store.syncValue('highlightItemOnHover', highlightItemOnHover);
  store.syncValue('modal', () => modalProp() ?? true);

  store.context.onOpenChange = (open, eventDetails) => {
    props.onOpenChange?.(open, eventDetails as MenuRoot.ChangeEventDetails);
  };
  store.context.onOpenChangeComplete = (open) => {
    props.onOpenChangeComplete?.(open);
  };

  // The floating node id and its parent are established once at setup — a menu never migrates
  // between trees during its lifetime.
  // Addition: when `parentFromContext.type === 'menubar'`, `useFloatingTree()` (ambient, ie. no
  // `externalTree` override) resolves Menubar's own tree — see this file's top-level doc comment
  // for why that's a real, correctly-timed context read for a contained trigger. The store's
  // `floatingTreeRoot` field is corrected below (a plain overwrite, mirroring upstream's
  // trigger-data-forwarding mechanism) so `Menu.Positioner`'s sibling-coordination events and
  // `Menubar`'s own `hasSubmenuOpen` listener observe the same tree instance.
  const ambientFloatingTree = useFloatingTree();
  const floatingTreeRoot = untrack(() => {
    if (parentFromContext.type === 'menubar') {
      return ambientFloatingTree ?? store.state.floatingTreeRoot;
    }
    return store.useState('floatingTreeRoot')();
  });
  const floatingNodeIdFromContext = useFloatingNodeId(floatingTreeRoot);
  const floatingParentNodeIdFromContext = useFloatingParentNodeId();

  store.update({
    floatingNodeId: floatingNodeIdFromContext,
    floatingParentNodeId: floatingParentNodeIdFromContext,
    ...(parentFromContext.type === 'menubar' ? { floatingTreeRoot } : null),
  });

  const open = store.useState('open');
  const activeIndex = store.useState('activeIndex');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;

  // Addition: re-emit `menuopenchange` from `Menu.Root`'s own long-lived scope for the menubar
  // case. `Menu.Positioner` (which already emits this same event, for sibling/parent submenu
  // coordination) is conditionally mounted — gated by `mounted`, which lags `open` slightly even
  // with transitions disabled — so on close its emission can race its own disposal and never fire
  // (observed empirically: `Menubar`'s `hasSubmenuOpen` got stuck `true` after the menu that set it
  // closed). `Menu.Root` itself never unmounts while the menu exists, so re-emitting here from a
  // `createEffect` that only depends on values already tracked elsewhere in this component gives
  // `Menubar`'s listener (see `menubar/Menubar.tsx`) a reliable source. Harmless double-delivery
  // for the open case (Menubar's handler is idempotent); MenuPositioner's own sibling-coordination
  // listeners are unaffected since they filter on `parentNodeId`/`nodeId`, which are identical here.
  if (parentFromContext.type === 'menubar') {
    createEffect(() => {
      const eventDetails: MenuOpenEventDetails = {
        open: open(),
        nodeId: floatingNodeIdFromContext,
        parentNodeId: floatingParentNodeIdFromContext,
        reason: store.state.openChangeReason,
      };
      floatingTreeRoot.events.emit('menuopenchange', eventDetails);
    });
  }

  const { openMethod, triggerProps: interactionTypeProps } = createOpenInteractionType(open);
  store.syncValue('openMethod', openMethod);

  createImplicitActiveTrigger(store);
  createOpenStateTransitions(open, store, () => {
    store.update({ allowMouseEnter: false });
  });

  const direction = useDirection();

  // Deviation: upstream passes `externalTree: nested ? floatingTreeRoot : undefined` — the
  // top-level (non-nested) root falls back to reading the ambient `FloatingTreeContext` instead.
  // That works in React because `useFloatingTree()`'s `useContext` call there can still observe a
  // context provided by an ancestor unrelated to this component. In Solid there's no such ambient
  // context available here: `<FloatingTree>` is rendered *by* this same `MenuRoot` call (see the
  // return statement below), and a component's own setup-time hook calls run before — and are not
  // descendants of — the JSX it returns, so `useFloatingTree()` (no override) resolves to `null`
  // for the top-level root's own `useDismiss`/`useListNavigation` calls. That breaks
  // `useDismiss`'s `hasBlockingChild` check (it needs the tree to see that an open submenu exists
  // and is not bubbling its own Escape), so a top-level Escape would incorrectly close the whole
  // tree instead of deferring to the open submenu. Passing `floatingTreeRoot` unconditionally
  // (always a valid tree — either this root's own or the delegated parent's) fixes this without
  // changing behavior for the already-`nested` case, which already received the same value.
  const dismiss = useDismiss(store.state.floatingRootContext, {
    enabled: () => !disabled(),
    bubbles: () => ({ escapeKey: closeParentOnEsc() && parentFromContext.type === 'menu' }),
    externalTree: floatingTreeRoot,
  });

  function setActiveIndex(index: number | null) {
    if (store.state.activeIndex === index) {
      return;
    }
    store.set('activeIndex', index);
  }

  const listNavigation = useListNavigation(store.state.floatingRootContext, {
    enabled: () => !disabled(),
    listRef: { current: itemDomElements },
    activeIndex,
    // Addition: upstream is `parent.type !== undefined` (true for a submenu, a menubar item, or a
    // context menu) — extended here to also cover the new `'menubar'` variant.
    nested: () => parentFromContext.type !== undefined,
    loopFocus,
    orientation,
    parentOrientation: () =>
      parentFromContext.type === 'menubar' ? parentFromContext.context.orientation() : undefined,
    rtl: () => direction() === 'rtl',
    disabledIndices: () => [],
    onNavigate: setActiveIndex,
    openOnArrowKeyDown: () => true,
    externalTree: floatingTreeRoot,
    focusItemOnHover: highlightItemOnHover,
  });

  const typeahead = useTypeahead(store.state.floatingRootContext, {
    enabled: () => !disabled(),
    listRef: { current: itemLabels },
    elementsRef: { current: itemDomElements },
    activeIndex,
    resetMs: () => TYPEAHEAD_RESET_MS,
    onMatch: (index) => {
      if (store.state.open && index !== activeIndex()) {
        store.set('activeIndex', index);
      }
    },
    onTyping: (typing) => {
      typingRef.current = typing;
    },
  });

  createPopupInteractionProps(store, () => {
    const activeTriggerProps = mergeProps(
      typeahead.reference,
      // `listNavigation.reference`/`.floating` are zero-arg reactive thunks (they carry
      // `aria-activedescendant`); the raw `mergeProps()` helper treats every function argument as
      // a props-getter and calls it with the accumulator so far, discarding everything merged
      // before it if not invoked first — see CONVENTIONS.md's `mergeProps()` arity note.
      // `ElementProps`'s field type (`HTMLProps | undefined`) doesn't reflect that these two
      // fields are actually thunks, hence the cast.
      callThunk(listNavigation.reference),
      dismiss.reference,
      {
        onMouseMove() {
          store.set('allowMouseEnter', true);
        },
      },
      interactionTypeProps,
    );
    activeTriggerProps['aria-haspopup'] = 'menu';
    activeTriggerProps['aria-expanded'] = store.state.open;

    const inactiveTriggerProps = mergeProps(
      listNavigation.trigger,
      dismiss.trigger,
      interactionTypeProps,
    );
    inactiveTriggerProps['aria-haspopup'] = 'menu';
    inactiveTriggerProps['aria-expanded'] = false;

    const popupProps = mergeProps(
      FOCUSABLE_POPUP_PROPS,
      {
        id: store.state.floatingId,
        role: 'menu' as const,
        'aria-labelledby': (store.state.activeTriggerElement as HTMLElement | null)?.id,
        onMouseMove() {
          store.set('allowMouseEnter', true);
          if (parentFromContext.type === 'menu') {
            store.set('hoverEnabled', false);
          }
        },
        onClick() {
          if (store.state.hoverEnabled) {
            store.set('hoverEnabled', false);
          }
        },
      },
      typeahead.floating,
      callThunk(listNavigation.floating),
      dismiss.floating,
    );

    return {
      activeTriggerProps,
      inactiveTriggerProps,
      popupProps,
      itemProps: listNavigation.item ?? EMPTY_OBJECT,
    };
  });

  const context: MenuRootContext<Payload> = { store, parent: parentFromContext };

  const content = (
    <MenuRootContext.Provider value={context as MenuRootContext}>
      <MenuRootChildren payload={payload}>{props.children}</MenuRootChildren>
    </MenuRootContext.Provider>
  );

  // `parentFromContext.type` is resolved once above and never changes for this component
  // instance's lifetime — the condition never toggles after mount — but a single JSX return
  // (rather than upstream's plain `if`/`return`s) keeps this to one Solid-component return
  // statement. Sets up a FloatingTree so nested submenus can discover it via ambient context
  // (several interaction hooks, e.g. `Menu.Popup`'s `useHoverFloatingInteraction`, resolve the
  // tree implicitly rather than threading `externalTree` everywhere).
  return (
    <Show when={parentFromContext.type === undefined} fallback={content}>
      <FloatingTree externalTree={floatingTreeRoot}>{content}</FloatingTree>
    </Show>
  );
}

/**
 * Renders `MenuRoot`'s `children` — either plain JSX, or a payload-receiving render function.
 * Split out so `props.children` is read exactly once (see `TooltipRootChildren`'s doc comment for
 * the full rationale).
 */
function MenuRootChildren<Payload>(props: {
  children?: JSX.Element | MenuRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as MenuRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

export interface MenuRootState {}

export interface MenuRootProps<Payload = unknown> {
  /**
   * Whether the menu is initially open.
   *
   * To render a controlled menu, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Whether to loop keyboard focus back to the first item
   * when the end of the list is reached while using the arrow keys.
   * @default true
   */
  loopFocus?: boolean | undefined;
  /**
   * Whether moving the pointer over items should highlight them.
   * Disabling this prop allows CSS `:hover` to be differentiated from the `:focus` (`data-highlighted`) state.
   * @default true
   */
  highlightItemOnHover?: boolean | undefined;
  /**
   * Determines if the menu enters a modal state when open.
   * Nested menus ignore this prop, and menus opened by hover are never modal.
   * @default true
   */
  modal?: boolean | undefined;
  /**
   * Event handler called when the menu is opened or closed.
   */
  onOpenChange?: ((open: boolean, eventDetails: MenuRoot.ChangeEventDetails) => void) | undefined;
  /**
   * Event handler called after any animations complete when the menu is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether the menu is currently open.
   */
  open?: boolean | undefined;
  /**
   * The visual orientation of the menu.
   * Controls whether roving focus uses up/down or left/right arrow keys.
   * @default 'vertical'
   */
  orientation?: MenuRoot.Orientation | undefined;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * When in a submenu, determines whether pressing the Escape key
   * closes the entire menu, or only the current child menu.
   * @default false
   */
  closeParentOnEsc?: boolean | undefined;
  /**
   * ID of the trigger that the menu is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled menu.
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the menu is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open menu.
   */
  defaultTriggerId?: string | null | undefined;
  /**
   * The content of the menu.
   * This can be a regular Solid element or a render function that receives the `payload` of the
   * active trigger.
   */
  children?: JSX.Element | MenuRoot.PayloadChildRenderFunction<Payload>;
}

export interface MenuRootActions {
  unmount: () => void;
  close: () => void;
}

export type MenuRootChangeEventReason =
  | typeof REASONS.triggerHover
  | typeof REASONS.triggerFocus
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.focusOut
  | typeof REASONS.listNavigation
  | typeof REASONS.escapeKey
  | typeof REASONS.itemPress
  | typeof REASONS.closePress
  | typeof REASONS.siblingOpen
  | typeof REASONS.cancelOpen
  | typeof REASONS.imperativeAction
  | typeof REASONS.none;

export type MenuRootChangeEventDetails = BaseUIChangeEventDetails<MenuRootChangeEventReason> & {
  preventUnmountOnClose(): void;
};

export type MenuRootOrientation = 'horizontal' | 'vertical';

export type MenuParent =
  | {
      type: 'menu';
      store: MenuStore<unknown>;
    }
  | {
      type: 'menubar';
      context: MenubarContext;
    }
  | {
      type: undefined;
    };

export namespace MenuRoot {
  export type State = MenuRootState;
  export type Props<Payload = unknown> = MenuRootProps<Payload>;
  export type Actions = MenuRootActions;
  export type ChangeEventReason = MenuRootChangeEventReason;
  export type ChangeEventDetails = MenuRootChangeEventDetails;
  export type Orientation = MenuRootOrientation;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
