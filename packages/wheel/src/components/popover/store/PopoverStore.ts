/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { untrack } from 'solid-js';
import { createSelector } from '../../base-utils/store/createSelector';
import { createTimeout } from '../../base-utils/createTimeout';
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
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { PATIENT_CLICK_THRESHOLD } from '../../internals/constants';
import { REASONS } from '../../internals/reasons';
import type { PopoverRoot } from '../root/PopoverRoot';

export type State<Payload> = PopupStoreState<Payload> & {
  disabled: boolean;
  instantType: 'dismiss' | 'click' | 'focus' | undefined;
  modal: boolean | 'trap-focus';
  focusManagerModal: boolean;
  openMethod: InteractionType | null;
  openChangeReason: PopoverRoot.ChangeEventReason | null;
  stickIfOpen: boolean;
  titleElementId: string | undefined;
  descriptionElementId: string | undefined;
  openOnHover: boolean;
  closeDelay: number;
};

export type Context = PopupStoreContext<PopoverRoot.ChangeEventDetails> & {
  readonly stickIfOpenTimeout: ReturnType<typeof createTimeout>;
  /**
   * Ref-like box for the invisible `FocusGuard` rendered immediately after the active trigger
   * (non-modal case only) — see `PopoverTrigger`'s doc comment. `FloatingFocusManager` reads this
   * as the element to focus when tabbing forward out of the popup.
   */
  readonly triggerFocusTargetRef: { current: HTMLElement | null };
  /**
   * Ref-like box for `FloatingFocusManager`'s own before-content focus guard, exposed so
   * `createTriggerFocusGuards`' after-trigger guard can hand focus back into the popup when a
   * shift+tab lands on it from outside the floating subtree.
   */
  readonly beforeContentFocusGuardRef: { current: HTMLElement | null };
};

const selectors = {
  ...popupStoreSelectors,
  disabled: createSelector((state: State<unknown>) => state.disabled),
  instantType: createSelector((state: State<unknown>) => state.instantType),
  openMethod: createSelector((state: State<unknown>) => state.openMethod),
  openChangeReason: createSelector((state: State<unknown>) => state.openChangeReason),
  modal: createSelector((state: State<unknown>) => state.modal),
  focusManagerModal: createSelector((state: State<unknown>) => state.focusManagerModal),
  stickIfOpen: createSelector((state: State<unknown>) => state.stickIfOpen),
  titleElementId: createSelector((state: State<unknown>) => state.titleElementId),
  descriptionElementId: createSelector((state: State<unknown>) => state.descriptionElementId),
  openOnHover: createSelector((state: State<unknown>) => state.openOnHover),
  closeDelay: createSelector((state: State<unknown>) => state.closeDelay),
};

type Selectors = typeof selectors;

/**
 * Solid port of upstream's `PopoverStore`.
 *
 * Deviations from upstream (see also the doc comments on `PopoverRoot`/`PopoverTrigger`/
 * `PopoverPopup` for the consuming side of these cuts):
 * - No `hasViewport` field — `Popover.Viewport` isn't ported (see `index.parts.ts`), so
 *   `adaptiveOrigin` in `PopoverPositioner` is always `undefined`, matching the Tooltip port's
 *   equivalent cut.
 * - No `nested` field — upstream syncs it for a not-yet-identified downstream consumer (no read
 *   of it exists anywhere in the upstream `popover/` directory either); omitted here rather than
 *   adding unused plumbing, same rationale as the dropped `backdropRef`/`internalBackdropRef`
 *   context refs (see `PopoverBackdrop`'s and `PopoverPositioner`'s doc comments).
 */
export class PopoverStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
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
    eventDetails: Omit<PopoverRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    // This method both reads (`this.state.activeTriggerId`/`activeTriggerElement`) and writes
    // (`this.set`/`this.update`) store signals, and — unlike `TooltipStore.setOpen`, which
    // delegates entirely to a helper operating on plain objects — it queries live store state
    // directly. Per CONVENTIONS.md, wrap the whole body in `untrack()` so a caller invoking this
    // from inside its own effect doesn't attribute these internal reads to that effect.
    untrack(() => {
      const isHover = eventDetails.reason === REASONS.triggerHover;
      const isKeyboardClick =
        eventDetails.reason === REASONS.triggerPress &&
        (eventDetails.event as MouseEvent).detail === 0;
      const isDismissClose =
        !nextOpen && (eventDetails.reason === REASONS.escapeKey || eventDetails.reason == null);

      const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(
        eventDetails as PopoverRoot.ChangeEventDetails,
      );

      const activeTriggerId = this.state.activeTriggerId;

      if (
        !nextOpen &&
        eventDetails.reason === REASONS.closePress &&
        eventDetails.trigger == null &&
        activeTriggerId != null
      ) {
        eventDetails.trigger =
          this.context.triggerElements.getById(activeTriggerId) ??
          this.state.activeTriggerElement ??
          undefined;
      }

      this.context.onOpenChange?.(nextOpen, eventDetails as PopoverRoot.ChangeEventDetails);

      if (eventDetails.isCanceled) {
        return;
      }

      this.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

      const updatedState: Partial<State<Payload>> = {
        open: nextOpen,
        openChangeReason: eventDetails.reason as PopoverRoot.ChangeEventReason,
      };

      setPopupOpenState(
        updatedState,
        nextOpen,
        eventDetails.trigger,
        shouldPreventUnmountOnClose(),
      );

      if (isHover) {
        // Only allow "patient" clicks to close the popover if it's open. If they clicked within
        // `PATIENT_CLICK_THRESHOLD`ms of the popover opening, keep it open.
        this.set('stickIfOpen', true);
        this.context.stickIfOpenTimeout.start(PATIENT_CLICK_THRESHOLD, () => {
          this.set('stickIfOpen', false);
        });
      }

      this.update(updatedState);

      if (isKeyboardClick || isDismissClose) {
        this.set('instantType', isKeyboardClick ? 'click' : 'dismiss');
      } else if (eventDetails.reason === REASONS.focusOut) {
        this.set('instantType', 'focus');
      } else {
        this.set('instantType', undefined);
      }
    });
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
    disabled: false,
    modal: false,
    focusManagerModal: false,
    instantType: undefined,
    openMethod: null,
    openChangeReason: null,
    titleElementId: undefined,
    descriptionElementId: undefined,
    stickIfOpen: true,
    openOnHover: false,
    closeDelay: 0,
    ...initialState,
  };

  // Deviation: upstream also seeds `state.mounted = true` here when `open` starts `true` (e.g.
  // `defaultOpen`). That's a React-render-timing accommodation: `createOpenStateTransitions`'s
  // synced `mounted` signal (below, via `createSyncedValues`) already initializes from
  // `untrack(open)` and is committed through a `createComputed` that runs synchronously during
  // `PopoverRoot`'s setup — before any descendant ever reads `store.state.mounted` — so this
  // store's initial value is always overwritten with the correct one before it's observed. Same
  // simplification `TooltipStore` makes.

  state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

  return state;
}

function createInitialContext(triggerElements: PopupTriggerMap): Context {
  return {
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    triggerElements,
    stickIfOpenTimeout: createTimeout(),
    triggerFocusTargetRef: { current: null },
    beforeContentFocusGuardRef: { current: null },
  };
}
