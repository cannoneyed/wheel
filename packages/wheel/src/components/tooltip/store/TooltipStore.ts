/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createSelector } from '../../base-utils/store/createSelector';
import {
  applyPopupOpenChange,
  createInitialPopupStoreState,
  createPopupFloatingRootContext,
  PopupStore,
  popupStoreSelectors,
  PopupTriggerMap,
  type PopupStoreContext,
  type PopupStoreState,
} from '../../utils/popups';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { TooltipRoot } from '../root/TooltipRoot';

export type State<Payload> = PopupStoreState<Payload> & {
  disabled: boolean;
  instantType: 'delay' | 'dismiss' | 'focus' | undefined;
  isInstantPhase: boolean;
  trackCursorAxis: 'none' | 'x' | 'y' | 'both';
  disableHoverablePopup: boolean;
  openChangeReason: TooltipRoot.ChangeEventReason | null;
  closeOnClick: boolean;
  closeDelay: number;
};

export type Context = PopupStoreContext<TooltipRoot.ChangeEventDetails>;

const selectors = {
  ...popupStoreSelectors,
  disabled: createSelector((state: State<unknown>) => state.disabled),
  instantType: createSelector((state: State<unknown>) => state.instantType),
  isInstantPhase: createSelector((state: State<unknown>) => state.isInstantPhase),
  trackCursorAxis: createSelector((state: State<unknown>) => state.trackCursorAxis),
  disableHoverablePopup: createSelector((state: State<unknown>) => state.disableHoverablePopup),
  lastOpenChangeReason: createSelector((state: State<unknown>) => state.openChangeReason),
  closeOnClick: createSelector((state: State<unknown>) => state.closeOnClick),
  closeDelay: createSelector((state: State<unknown>) => state.closeDelay),
};

type Selectors = typeof selectors;

/**
 * Solid port of upstream's `TooltipStore`.
 *
 * Deviation: upstream also carries a `popupRef` in `context` (a `React.RefObject`) so
 * `TooltipPopup`'s and `useOpenStateTransitions`'s `useOpenChangeComplete` calls share the same
 * ref. The popup DOM element is already tracked reactively in `state.popupElement` (set by
 * `TooltipPopup`'s own ref), so both call sites read `store.useState('popupElement')` directly
 * instead — no separate ref-object is needed.
 *
 * Deviation: the detached-trigger `handle` prop (`TooltipHandle`/`createNullTooltipStore`) is not
 * ported — see `utils/popups/popupStoreUtils.ts`'s `createPopupRootStore` doc comment. `TooltipStore`
 * here is always root-owned.
 */
export class TooltipStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
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
    eventDetails: Omit<TooltipRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    applyPopupOpenChange<State<Payload>, TooltipRoot.ChangeEventDetails>(
      this,
      nextOpen,
      eventDetails as TooltipRoot.ChangeEventDetails,
      { extraState: { openChangeReason: eventDetails.reason } as Partial<State<Payload>> },
    );
  };

  // Used by trigger clicks to clear a delayed hover open without reporting a public open-state change.
  cancelPendingOpen(event: MouseEvent | PointerEvent) {
    this.state.floatingRootContext.dispatchOpenChange(
      false,
      createChangeEventDetails(REASONS.triggerPress, event),
    );
  }
}

function createInitialState<Payload>(
  initialState: Partial<State<Payload>> | undefined,
  triggerElements: PopupTriggerMap,
  floatingId?: string | undefined,
  nested = false,
): State<Payload> {
  const state: State<Payload> = {
    ...(createInitialPopupStoreState<Payload>() as PopupStoreState<Payload>),
    disabled: false,
    instantType: undefined,
    isInstantPhase: false,
    trackCursorAxis: 'none',
    disableHoverablePopup: false,
    openChangeReason: null,
    closeOnClick: true,
    closeDelay: 0,
    ...initialState,
  };

  state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

  return state;
}

function createInitialContext(triggerElements: PopupTriggerMap): Context {
  return {
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    triggerElements,
  };
}
