/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSelector } from '../../base-utils/store/createSelector';
import {
  createInitialPopupStoreState,
  createPopupFloatingRootContext,
  PopupStore,
  popupStoreSelectors,
  PopupTriggerMap,
  setPopupOpenState,
  type PopupStoreContext,
  type PopupStoreState,
} from '../../utils/popups';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import type { DialogRoot } from '../root/DialogRoot';

export type State<Payload> = PopupStoreState<Payload> & {
  modal: boolean | 'trap-focus';
  disablePointerDismissal: boolean;
  openMethod: InteractionType | null;
  nested: boolean;
  nestedOpenDialogCount: number;
  nestedOpenDrawerCount: number;
  titleElementId: string | undefined;
  descriptionElementId: string | undefined;
  viewportElement: HTMLElement | null;
  role: 'dialog' | 'alertdialog';
};

/**
 * Non-reactive per-store bookkeeping.
 *
 * Deviation: upstream also carries a `popupRef` (mirrors `TooltipStore`'s equivalent deviation —
 * the popup element is already tracked reactively via `state.popupElement`, set by `DialogPopup`'s
 * own ref, so both call sites read `store.state.popupElement`/`store.useState('popupElement')`
 * directly instead of a separate ref object) and an `outsidePressEnabledRef` (a mutable escape
 * hatch upstream's Drawer swipe-area uses to temporarily suppress outside-press dismissal during a
 * drag gesture — Drawer isn't ported, and nothing in this port's slice ever writes `false` to it, so
 * it's omitted rather than carried as permanently-inert plumbing).
 */
export type Context = PopupStoreContext<DialogRoot.ChangeEventDetails> & {
  /** Non-reactive box for the rendered `Dialog.Backdrop` element, if any. */
  backdropRef: { current: Element | null };
  /** Non-reactive box for the portal's own internal (modal) backdrop element, if rendered. */
  internalBackdropRef: { current: Element | null };
  /** Set by a parent `Dialog.Root`'s interactions to learn about this store's nested open count. */
  onNestedDialogOpen?: ((dialogCount: number, drawerCount: number) => void) | undefined;
  onNestedDialogClose?: (() => void) | undefined;
};

const selectors = {
  ...popupStoreSelectors,
  modal: createSelector((state: State<unknown>) => state.modal),
  nested: createSelector((state: State<unknown>) => state.nested),
  nestedOpenDialogCount: createSelector((state: State<unknown>) => state.nestedOpenDialogCount),
  nestedOpenDrawerCount: createSelector((state: State<unknown>) => state.nestedOpenDrawerCount),
  disablePointerDismissal: createSelector((state: State<unknown>) => state.disablePointerDismissal),
  openMethod: createSelector((state: State<unknown>) => state.openMethod),
  descriptionElementId: createSelector((state: State<unknown>) => state.descriptionElementId),
  titleElementId: createSelector((state: State<unknown>) => state.titleElementId),
  viewportElement: createSelector((state: State<unknown>) => state.viewportElement),
  role: createSelector((state: State<unknown>) => state.role),
};

type Selectors = typeof selectors;

/**
 * Solid port of upstream's `DialogStore`.
 *
 * Deviation: the detached-trigger `handle` prop (`DialogHandle`/`createNullDialogStore`) is not
 * ported — see `utils/popups/popupStoreUtils.ts`'s `createPopupRootStore` doc comment for the
 * `handle` deviation, same as `TooltipStore`. `DialogStore` here is always root-owned.
 */
export class DialogStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
  constructor(initialState?: Partial<State<Payload>>, floatingId?: string | undefined, nested = false) {
    const triggerElements = new PopupTriggerMap();
    super(
      createInitialState<Payload>(initialState, triggerElements, floatingId, nested),
      createInitialContext(triggerElements),
      selectors,
    );
  }

  setOpen = (
    nextOpen: boolean,
    eventDetails: Omit<DialogRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    const details = eventDetails as DialogRoot.ChangeEventDetails;

    details.preventUnmountOnClose = () => {
      this.set('preventUnmountingOnClose', true);
    };

    if (!nextOpen && details.trigger == null && this.state.activeTriggerId != null) {
      // When closing the dialog, pass the old trigger to the onOpenChange event
      // so it's not reset too early (potentially causing focus issues in controlled scenarios).
      details.trigger = this.state.activeTriggerElement ?? undefined;
    }

    this.context.onOpenChange?.(nextOpen, details);

    if (details.isCanceled) {
      return;
    }

    this.state.floatingRootContext.dispatchOpenChange(nextOpen, details);

    const updatedState: Partial<State<Payload>> = { open: nextOpen };
    setPopupOpenState(updatedState, nextOpen, details.trigger);

    this.update(updatedState);
  };
}

function createInitialState<Payload>(
  initialState: Partial<State<Payload>> | undefined,
  triggerElements: PopupTriggerMap,
  floatingId?: string | undefined,
  nested = false,
): State<Payload> {
  const state: State<Payload> = {
    ...(createInitialPopupStoreState<Payload>() as PopupStoreState<Payload>),
    modal: true,
    disablePointerDismissal: false,
    openMethod: null,
    nested: false,
    nestedOpenDialogCount: 0,
    nestedOpenDrawerCount: 0,
    titleElementId: undefined,
    descriptionElementId: undefined,
    viewportElement: null,
    role: 'dialog',
    ...initialState,
  };

  state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

  return state;
}

function createInitialContext(triggerElements: PopupTriggerMap): Context {
  return {
    backdropRef: { current: null },
    internalBackdropRef: { current: null },
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    onNestedDialogOpen: undefined,
    onNestedDialogClose: undefined,
    triggerElements,
  };
}
