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
import { NullStore } from '../../utils/NullStore';
import type { PreviewCardRoot } from '../root/PreviewCardRoot';

export type State<Payload> = PopupStoreState<Payload> & {
  instantType: 'dismiss' | 'focus' | undefined;
  /**
   * How long to wait before closing the preview card once the active trigger stops being
   * hovered/focused. Trigger-owned (set by whichever trigger is currently active), read by
   * `PreviewCardPopup`'s `useHoverFloatingInteraction`.
   */
  closeDelay: number;
};

export type Context = PopupStoreContext<PreviewCardRoot.ChangeEventDetails>;

const selectors = {
  ...popupStoreSelectors,
  instantType: createSelector((state: State<unknown>) => state.instantType),
  closeDelay: createSelector((state: State<unknown>) => state.closeDelay),
};

type Selectors = typeof selectors;

/**
 * Store members a detached handle-backed trigger reads/invokes for trigger registration, data
 * forwarding, and hover/focus interaction. Mirrors upstream's `PopupTriggerDataStore`: no `setOpen`
 * (or `syncValue`) is exposed, since a detached trigger never calls either directly — opening/
 * closing always routes through `BasePopupHandle`'s attached root store, not through whatever store
 * a trigger happens to be registered in.
 *
 * Note: this Solid port's shared `createTriggerDataForwarding` helper
 * (`utils/popups/popupStoreUtils.ts`) is currently typed against the broader `PopupRootStore<State>`
 * contract (which also requires `setOpen`/`syncValue`), unlike upstream's narrower
 * `PopupTriggerDataStore`. That helper has no component using a `setOpen`-less handle store yet
 * (PreviewCard is the first), so `PreviewCardTrigger.tsx` casts through this narrower type at the
 * call site rather than widening it here — see its doc comment. Reported as a shared-infra typing
 * gap rather than fixed in place (out of scope for this port).
 */
export type PreviewCardHandleStore<Payload> = Pick<
  PreviewCardStore<Payload>,
  'context' | 'state' | 'set' | 'update' | 'useState'
>;

/**
 * Solid port of upstream's `PreviewCardStore`.
 *
 * Deviations from upstream (see also the doc comments on `PreviewCardRoot`/`PreviewCardTrigger`/
 * `PreviewCardPositioner` for the consuming side of these cuts):
 * - No `hasViewport` field and no custom `inline` middleware/`inlineRectCoordsRef` — `PreviewCard.
 *   Viewport` isn't ported (see `index.parts.ts`), so `adaptiveOrigin` in `PreviewCardPositioner` is
 *   always `undefined` (matching the Tooltip/Popover ports' equivalent cut). The inline-rect
 *   anchoring middleware that keeps the popup pinned to the exact hovered line of a wrapped,
 *   multi-line trigger link is a separate, substantial layout-measurement feature; every upstream
 *   test that exercises it is `describe.skipIf(isJSDOM)` (real-browser-only), so it isn't exercised
 *   by this port's jsdom-based test slice either. The popup instead always anchors to the trigger's
 *   `getBoundingClientRect()` (Floating UI's default), which is correct for single-line triggers.
 * - `closeDelay` lives in `state` (trigger-owned, written via `createTriggerDataForwarding`'s
 *   `stateUpdates`) rather than in a `context.closeDelayRef` ref object — this Solid port already
 *   has the exact same trigger-owned-state plumbing wired up for `TooltipStore.closeDelay`, so
 *   reusing it here avoids introducing a parallel ref-based mechanism for the same purpose.
 */
export class PreviewCardStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
  constructor(
    initialState?: Partial<State<Payload>>,
    floatingId?: string | undefined,
    nested = false,
  ) {
    const triggerElements = new PopupTriggerMap();
    super(
      createInitialState<Payload>(initialState, triggerElements, floatingId, nested),
      createInitialContext(triggerElements),
      selectors,
    );
  }

  setOpen = (
    nextOpen: boolean,
    eventDetails: Omit<PreviewCardRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    applyPopupOpenChange<State<Payload>, PreviewCardRoot.ChangeEventDetails>(
      this,
      nextOpen,
      eventDetails as PreviewCardRoot.ChangeEventDetails,
    );
  };
}

/**
 * Creates the inert fallback store used by detached handle-backed triggers while no
 * `PreviewCard.Root` is attached. It preserves a preview-card-specific trigger registry in context
 * so detached triggers can register before migrating to the live root store.
 */
export function createNullPreviewCardStore<Payload>(): PreviewCardHandleStore<Payload> {
  const triggerElements = new PopupTriggerMap();

  return new NullStore<Readonly<State<Payload>>, Context, Selectors>(
    createInitialState<Payload>(undefined, triggerElements),
    createInitialContext(triggerElements),
    selectors,
  );
}

function createInitialState<Payload>(
  initialState: Partial<State<Payload>> | undefined,
  triggerElements: PopupTriggerMap,
  floatingId?: string | undefined,
  nested = false,
): State<Payload> {
  const state: State<Payload> = {
    ...(createInitialPopupStoreState<Payload>() as PopupStoreState<Payload>),
    instantType: undefined,
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
