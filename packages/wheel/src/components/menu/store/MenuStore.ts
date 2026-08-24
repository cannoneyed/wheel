/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSelector } from '../../base-utils/store/createSelector';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { Timeout } from '../../base-utils/createTimeout';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { FloatingTreeStore } from '../../floating-ui-solid/components/FloatingTreeStore';
import type { HTMLProps } from '../../internals/types';
import {
  attachPreventUnmountOnClose,
  createInitialPopupStoreState,
  createPopupFloatingRootContext,
  PopupStore,
  popupStoreSelectors,
  PopupTriggerMap,
  setPopupOpenState,
  type PopupStoreContext,
  type PopupStoreState,
} from '../../utils/popups';
import { REASONS } from '../../internals/reasons';
import type { MenuParent, MenuRoot } from '../root/MenuRoot';

export type State<Payload> = PopupStoreState<Payload> & {
  disabled: boolean;
  modal: boolean;
  openMethod: InteractionType | null;
  allowMouseEnter: boolean;
  highlightItemOnHover: boolean;
  parent: MenuParent;
  rootId: string | undefined;
  activeIndex: number | null;
  hoverEnabled: boolean;
  instantType: 'dismiss' | 'click' | 'group' | 'trigger-change' | undefined;
  openChangeReason: MenuRoot.ChangeEventReason | null;
  floatingTreeRoot: FloatingTreeStore;
  floatingNodeId: string | undefined;
  floatingParentNodeId: string | null;
  itemProps: HTMLProps;
  closeDelay: number;
};

export interface Context extends PopupStoreContext<MenuRoot.ChangeEventDetails> {
  /**
   * Whether a typeahead session is currently active — read by items to suppress Space-as-activate
   * while the user is mid-typeahead.
   */
  readonly typingRef: { current: boolean };
  /**
   * Mutable, index-ordered list of registered item DOM elements. Shared with `Menu.Positioner`'s
   * `CompositeList` (which mutates it in place) and with `useListNavigation`/`useTypeahead` (which
   * read it through a `{ current }` wrapper built from this same array reference).
   */
  readonly itemDomElements: Array<HTMLElement | null>;
  /**
   * Mutable, index-ordered list of item labels (for typeahead matching).
   */
  readonly itemLabels: Array<string | null>;
}

const selectors = {
  ...popupStoreSelectors,
  // Addition (menubar port): a menubar-hosted menu is also disabled while its `Menubar` is
  // disabled, matching upstream's `MenuStore` selector (`state.parent.context.disabled ||
  // state.disabled` for the `'menubar'` parent case) — read by `Menu.Item`'s/`Menu.Trigger`'s own
  // `rootDisabled` merges.
  disabled: createSelector((state: State<unknown>) =>
    state.parent.type === 'menubar' ? state.parent.context.disabled() || state.disabled : state.disabled,
  ),
  modal: createSelector(
    (state: State<unknown>) => state.parent.type === undefined && (state.modal ?? true),
  ),
  openMethod: createSelector((state: State<unknown>) => state.openMethod),
  allowMouseEnter: createSelector((state: State<unknown>) => state.allowMouseEnter),
  highlightItemOnHover: createSelector((state: State<unknown>) => state.highlightItemOnHover),
  parent: createSelector((state: State<unknown>) => state.parent),
  rootId: createSelector((state: State<unknown>): string | undefined => {
    if (state.parent.type === 'menu') {
      return state.parent.store.selectors.rootId(state.parent.store.state);
    }
    return state.rootId;
  }),
  activeIndex: createSelector((state: State<unknown>) => state.activeIndex),
  isActive: createSelector(
    (state: State<unknown>, itemIndex: number) => state.activeIndex === itemIndex,
  ),
  hoverEnabled: createSelector((state: State<unknown>) => state.hoverEnabled),
  instantType: createSelector((state: State<unknown>) => state.instantType),
  lastOpenChangeReason: createSelector((state: State<unknown>) => state.openChangeReason),
  floatingTreeRoot: createSelector((state: State<unknown>): FloatingTreeStore => {
    if (state.parent.type === 'menu') {
      return state.parent.store.selectors.floatingTreeRoot(state.parent.store.state);
    }
    return state.floatingTreeRoot;
  }),
  floatingNodeId: createSelector((state: State<unknown>) => state.floatingNodeId),
  floatingParentNodeId: createSelector((state: State<unknown>) => state.floatingParentNodeId),
  itemProps: createSelector((state: State<unknown>) => state.itemProps),
  closeDelay: createSelector((state: State<unknown>) => state.closeDelay),
};

type Selectors = typeof selectors;

/**
 * Solid port of upstream's `MenuStore`.
 *
 * Deviations:
 * - Upstream's `MenuParent` union also carries `'menubar'`, `'context-menu'`, and
 *   `'nested-context-menu'` variants (see `MenuRoot.tsx`). Menubar and Context Menu are not ported
 *   in this pass (Menubar is out of Wave 1 scope; Context Menu integration is explicitly skipped
 *   per the porting brief), so `MenuParent` here is only `{ type: 'menu'; store }` (a submenu) or
 *   `{ type: undefined }` (a top-level menu). Every upstream branch keyed on the dropped variants
 *   is omitted rather than reproduced as dead code.
 * - Upstream subscribes to the parent store's changes via `this.observe('parent', ...)` /
 *   `parent.store.subscribe(...)` to re-notify this store's own consumers when delegated values
 *   (`rootId`, `floatingTreeRoot`) change on the parent. This isn't needed in Solid: reading
 *   `state.parent.store.state.x` inside a selector is tracked by whichever reactive computation
 *   invoked the selector, regardless of which `SolidStore` instance owns the underlying signal — so
 *   the delegation above is transparently reactive without any manual subscription plumbing.
 * - `keyboardEventRelay` (Menubar's `CompositeRoot` keydown-delegation escape hatch) is dropped
 *   entirely along with Menubar support.
 * - The press-drag-release "mouseup on item activates it" affordance
 *   (`context.allowMouseUpTriggerRef`) is not ported — a secondary UX nicety not exercised by the
 *   ported behavioral test slice. `Menu.Item`'s `onClick`/keyboard activation covers the required
 *   click/Enter/Space activation semantics.
 */
export class MenuStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
  constructor(
    initialState: Partial<State<Payload>> | undefined,
    floatingId: string | undefined,
    nested: boolean,
    itemDomElements: Array<HTMLElement | null>,
    itemLabels: Array<string | null>,
    typingRef: { current: boolean },
  ) {
    const triggerElements = new PopupTriggerMap();
    super(
      createInitialState<Payload>(initialState, triggerElements, floatingId, nested),
      createInitialContext(triggerElements, itemDomElements, itemLabels, typingRef),
      selectors,
    );
  }

  private allowTouchToClose = true;

  private touchTimeout = Timeout.create();

  private clearTouchTimeout() {
    this.touchTimeout.clear();
  }

  /**
   * Runs the shared open-change sequence for the menu: notifies `onOpenChange`, honors
   * cancellation, dispatches the floating root change, and maps the reason to an `instantType`.
   * Solid port of the `setOpen` callback formerly defined inline in upstream's `MenuRoot` (moved
   * onto the store here, matching this port's `TooltipStore.setOpen` precedent).
   */
  setOpen = (
    nextOpen: boolean,
    eventDetails: Omit<MenuRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    const reason = eventDetails.reason;
    const current = this.state;

    if (
      current.open === nextOpen &&
      eventDetails.trigger === current.activeTriggerElement &&
      current.openChangeReason === reason
    ) {
      return;
    }

    const details = eventDetails as MenuRoot.ChangeEventDetails;
    const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(details);

    if (!nextOpen && details.trigger == null) {
      details.trigger = (current.activeTriggerElement as Element | null) ?? undefined;
    }

    this.context.onOpenChange?.(nextOpen, details);

    if (details.isCanceled) {
      return;
    }

    this.state.floatingRootContext.dispatchOpenChange(nextOpen, details);

    const nativeEvent = details.event as Event | undefined;
    if (
      nextOpen === false &&
      nativeEvent?.type === 'click' &&
      (nativeEvent as PointerEvent).pointerType === 'touch' &&
      !this.allowTouchToClose
    ) {
      return;
    }

    if (nextOpen && reason === REASONS.triggerFocus) {
      this.allowTouchToClose = false;
      this.clearTouchTimeout();
      this.touchTimeout.start(300, () => {
        this.allowTouchToClose = true;
      });
    } else {
      this.allowTouchToClose = true;
      this.clearTouchTimeout();
    }

    const isKeyboardClick =
      (reason === REASONS.triggerPress || reason === REASONS.itemPress) &&
      (nativeEvent as MouseEvent | undefined)?.detail === 0 &&
      Boolean(nativeEvent?.isTrusted);
    const isDismissClose = !nextOpen && (reason === REASONS.escapeKey || reason == null);

    const updatedState: Partial<State<Payload>> = {
      open: nextOpen,
      openChangeReason: reason as MenuRoot.ChangeEventReason | null,
    };

    setPopupOpenState(updatedState, nextOpen, details.trigger, shouldPreventUnmountOnClose());

    this.update(updatedState);

    if (isKeyboardClick || isDismissClose) {
      this.set('instantType', isKeyboardClick ? 'click' : 'dismiss');
    } else {
      this.set('instantType', undefined);
    }
  };
}

function createInitialContext<Payload>(
  triggerElements: PopupTriggerMap,
  itemDomElements: Array<HTMLElement | null>,
  itemLabels: Array<string | null>,
  typingRef: { current: boolean },
): Context {
  return {
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    triggerElements,
    typingRef,
    itemDomElements,
    itemLabels,
  };
}

function createInitialState<Payload>(
  initialState: Partial<State<Payload>> | undefined,
  triggerElements: PopupTriggerMap,
  floatingId: string | undefined,
  nested: boolean,
): State<Payload> {
  const state: State<Payload> = {
    ...(createInitialPopupStoreState<Payload>() as PopupStoreState<Payload>),
    disabled: false,
    modal: true,
    openMethod: null,
    allowMouseEnter: false,
    highlightItemOnHover: true,
    parent: { type: undefined },
    rootId: undefined,
    activeIndex: null,
    hoverEnabled: true,
    instantType: undefined,
    openChangeReason: null,
    floatingTreeRoot: new FloatingTreeStore(),
    floatingNodeId: undefined,
    floatingParentNodeId: null,
    itemProps: EMPTY_OBJECT as HTMLProps,
    closeDelay: 0,
    ...initialState,
  };

  state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

  return state;
}
