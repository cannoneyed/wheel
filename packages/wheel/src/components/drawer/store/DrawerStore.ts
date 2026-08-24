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
import { NullStore } from '../../utils/NullStore';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import type { DrawerRoot } from '../root/DrawerRoot';

export type DrawerSwipeDirection = 'up' | 'down' | 'left' | 'right';
export type DrawerSnapPoint = number | string;

export type State<Payload> = PopupStoreState<Payload> & {
  // Dialog-like state. Drawer builds on the same machinery as `Dialog.Root` upstream (both wrap
  // `Dialog.Root`/`useRenderDialogRoot`); this Solid port's `DialogStore` doesn't expose a `handle`
  // prop, `IsDrawerContext` nested-drawer-count plumbing, or an `outsidePressEnabledRef` escape
  // hatch for the swipe-area (see `dialog/root/DialogRoot.tsx`'s doc comment and
  // `dialog/store/DialogStore.ts`'s doc comment for those cuts), so Drawer can't be layered on top
  // of the ported `Dialog.Root`/`DialogStore` the way upstream does. Instead `DrawerStore` is a
  // self-contained sibling of `DialogStore` that carries the same dialog-shaped state directly.
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

  // Drawer-specific state.
  swipeDirection: DrawerSwipeDirection;
  snapToSequentialPoints: boolean;
  snapPoints: DrawerSnapPoint[] | undefined;
  /** The currently active (resolved) snap point value. */
  activeSnapPoint: DrawerSnapPoint | null;
  /** The measured height of this drawer's own popup element. */
  popupHeight: number;
  /**
   * The measured height of the frontmost open drawer within the current nested drawer stack
   * (this drawer's own popup height, or a nested drawer's height while one is open).
   */
  frontmostHeight: number;
  /** Whether this drawer has a nested drawer mounted in its stack (including while it transitions out). */
  hasNestedDrawer: boolean;
  /** Whether a nested drawer is currently being swiped. */
  nestedSwiping: boolean;
  /**
   * Progress (0-1) of a nested drawer's swipe gesture. Solid port deviation: upstream threads this
   * through a hand-rolled `nestedSwipeProgressStore` pub/sub object to avoid re-rendering the whole
   * React tree on every drag frame. Solid's fine-grained reactivity makes that unnecessary — a plain
   * reactive state field only re-runs the specific consumers (`Drawer.Popup`'s CSS var write, e.g.)
   * that read it.
   */
  nestedSwipeProgress: number;
  /**
   * Whether `Drawer.SwipeArea` is currently driving an open gesture (writing the popup's
   * swipe-movement vars imperatively). The viewport reads this to skip resetting them on open.
   */
  swipeAreaActive: boolean;
};

export type Context = PopupStoreContext<DrawerRoot.ChangeEventDetails> & {
  /** Non-reactive box for the rendered `Drawer.Backdrop` element, if any. */
  backdropRef: { current: HTMLElement | null };
  /** Non-reactive box for the portal's own internal (modal) backdrop element, if rendered. */
  internalBackdropRef: { current: HTMLElement | null };
  /**
   * Non-reactive box for the rendered `Drawer.Popup` element. Unlike `DialogStore` (which reads
   * `state.popupElement` directly everywhere), Drawer's swipe-gesture math reads the popup element
   * very frequently from non-reactive pointer/touch event handlers, so a plain ref box (matching
   * upstream) is kept alongside `state.popupElement` rather than dropped.
   */
  popupRef: { current: HTMLElement | null };
  /**
   * Mutable escape hatch `Drawer.SwipeArea` uses to temporarily suppress outside-press dismissal
   * while it drives an open-by-swipe gesture (see its doc comment).
   */
  outsidePressEnabled: { current: boolean };
  /** Set by a parent `Drawer.Root`'s interactions to learn about this store's nested open count. */
  onNestedDialogOpen?: ((dialogCount: number, drawerCount: number) => void) | undefined;
  onNestedDialogClose?: (() => void) | undefined;
  /** The parent `Drawer.Root`'s store, if this drawer is nested within one. Non-reactive: resolved
   * once at setup, since a Root's nesting relationship to an ancestor Root doesn't change over its
   * lifetime (same rationale as `DialogStore`'s equivalent parent lookup in `DialogRoot.tsx`). */
  parentStore?: DrawerStore<any> | undefined;
  /** Installed by this store's own `Drawer.Root` to receive a nested drawer's reported frontmost height. */
  onNestedFrontmostHeightChange?: ((height: number) => void) | undefined;
  /** Installed by this store's own `Drawer.Root` to receive a nested drawer's swiping state. */
  onNestedSwipingChange?: ((swiping: boolean) => void) | undefined;
  /** Installed by this store's own `Drawer.Root` to receive a nested drawer's swipe progress. */
  onNestedSwipeProgressChange?: ((progress: number) => void) | undefined;
  /** Installed by this store's own `Drawer.Root` to learn whether a nested drawer is present. */
  onNestedDrawerPresenceChange?: ((present: boolean) => void) | undefined;
  /**
   * Installed by `Drawer.Root` (which owns the controllable snap-point signal). `Drawer.Viewport`/
   * `Drawer.SwipeArea` call this to change the active snap point in response to a swipe gesture,
   * mirroring upstream's `DrawerRootContext.setActiveSnapPoint`.
   */
  setActiveSnapPoint?:
    | ((
        snapPoint: DrawerSnapPoint | null,
        eventDetails?: DrawerRoot.SnapPointChangeEventDetails,
      ) => void)
    | undefined;
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
  swipeDirection: createSelector((state: State<unknown>) => state.swipeDirection),
  snapToSequentialPoints: createSelector((state: State<unknown>) => state.snapToSequentialPoints),
  snapPoints: createSelector((state: State<unknown>) => state.snapPoints),
  activeSnapPoint: createSelector((state: State<unknown>) => state.activeSnapPoint),
  popupHeight: createSelector((state: State<unknown>) => state.popupHeight),
  frontmostHeight: createSelector((state: State<unknown>) => state.frontmostHeight),
  hasNestedDrawer: createSelector((state: State<unknown>) => state.hasNestedDrawer),
  nestedSwiping: createSelector((state: State<unknown>) => state.nestedSwiping),
  nestedSwipeProgress: createSelector((state: State<unknown>) => state.nestedSwipeProgress),
  swipeAreaActive: createSelector((state: State<unknown>) => state.swipeAreaActive),
};

type Selectors = typeof selectors;

/**
 * Store members a detached handle-backed trigger reads/invokes for trigger registration, data
 * forwarding, and dismiss interaction. Mirrors `DialogHandleStore`/`PreviewCardHandleStore`.
 */
export type DrawerHandleStore<Payload> = Pick<
  DrawerStore<Payload>,
  'context' | 'state' | 'set' | 'update' | 'useState'
>;

/**
 * Solid port of upstream's `DrawerStore` (there, effectively `DialogStore` plus the plain-React-context
 * `DrawerRootContext` state that rides alongside it — see the deviation note on the `State` type
 * above for why this port folds both into a single store).
 */
export class DrawerStore<Payload> extends PopupStore<State<Payload>, Context, Selectors> {
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
    eventDetails: Omit<DrawerRoot.ChangeEventDetails, 'preventUnmountOnClose'>,
  ) => {
    const details = eventDetails as DrawerRoot.ChangeEventDetails;

    details.preventUnmountOnClose = () => {
      this.set('preventUnmountingOnClose', true);
    };

    if (!nextOpen && details.trigger == null && this.state.activeTriggerId != null) {
      // When closing the drawer, pass the old trigger to the onOpenChange event
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

/**
 * Creates the inert fallback store used by detached handle-backed triggers while no `Drawer.Root`
 * is attached. It preserves a drawer-specific trigger registry in context so detached triggers can
 * register before migrating to the live root store.
 */
export function createNullDrawerStore<Payload>(): DrawerHandleStore<Payload> {
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
    swipeDirection: 'down',
    snapToSequentialPoints: false,
    snapPoints: undefined,
    activeSnapPoint: null,
    popupHeight: 0,
    frontmostHeight: 0,
    hasNestedDrawer: false,
    nestedSwiping: false,
    nestedSwipeProgress: 0,
    swipeAreaActive: false,
    ...initialState,
  };

  state.floatingRootContext = createPopupFloatingRootContext(triggerElements, floatingId, nested);

  return state;
}

function createInitialContext(triggerElements: PopupTriggerMap): Context {
  return {
    backdropRef: { current: null },
    internalBackdropRef: { current: null },
    popupRef: { current: null },
    outsidePressEnabled: { current: true },
    onOpenChange: undefined,
    onOpenChangeComplete: undefined,
    onNestedDialogOpen: undefined,
    onNestedDialogClose: undefined,
    parentStore: undefined,
    onNestedFrontmostHeightChange: undefined,
    onNestedSwipingChange: undefined,
    onNestedSwipeProgressChange: undefined,
    onNestedDrawerPresenceChange: undefined,
    setActiveSnapPoint: undefined,
    triggerElements,
  };
}
