/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import {
  createEffect,
  onCleanup,
  Show,
  untrack,
  type Accessor,
  type JSX,
} from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { addEventListener } from '../../base-utils/addEventListener';
import { ownerWindow } from '../../base-utils/owner';
import { platform } from '../../base-utils/platform/index';
import { generateId } from '../../base-utils/generateId';
import { DrawerRootContext, useDrawerRootContext } from './DrawerRootContext';
import { contains, getTarget, useDismiss } from '../../floating-ui-solid';
import { createScrollLock } from '../../utils/createScrollLock';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import {
  createImplicitActiveTrigger,
  createOpenStateTransitions,
  createPopupInteractionProps,
  createPopupRootStore,
  createSyncedValues,
} from '../../utils/popups';
import {
  DrawerStore,
  type State as DrawerStoreState,
  type Context as DrawerStoreContext,
  type DrawerSnapPoint,
  type DrawerSwipeDirection,
} from '../store/DrawerStore';
import type { DrawerHandle } from '../store/DrawerHandle';
import { useDrawerProviderContext } from '../provider/DrawerProviderContext';

/**
 * Groups all parts of the drawer.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream builds `Drawer.Root` on top of `Dialog.Root` (via an internal `IsDrawerContext`
 * that makes `useRenderDialogRoot` treat itself as a drawer). This Solid port's `Dialog.Root`/
 * `DialogStore` don't expose a `handle` prop, `IsDrawerContext`, or an `outsidePressEnabledRef`
 * escape hatch for `Drawer.SwipeArea` (see `dialog/root/DialogRoot.tsx` and `dialog/store/
 * DialogStore.ts`'s doc comments for those cuts, made before Drawer was ported), so `Drawer.Root`
 * is self-contained here instead: it owns a `DrawerStore` (a sibling of `DialogStore`, not an
 * instance of it) and re-implements the dismiss/scroll-lock/nested-count interactions directly,
 * mirroring `DialogRoot`'s `renderDialogRoot`/`DialogInteractions`.
 *
 * Deviation: upstream also accepts an `actionsRef` (imperative `unmount`/`close`) — not ported, same
 * as `DialogRoot`/`TooltipRoot` (a React ref-forwarding pattern with no direct Solid equivalent).
 */
export function DrawerRoot<Payload = unknown>(props: DrawerRoot.Props<Payload>): JSX.Element {
  const modal = () => props.modal ?? true;
  const disablePointerDismissal = () => props.disablePointerDismissal ?? false;
  const swipeDirection = () => props.swipeDirection ?? 'down';
  const snapToSequentialPoints = () => props.snapToSequentialPoints ?? false;

  // Read once at setup time: Solid resolves context at creation, and a Root's nesting relationship
  // to an ancestor Root doesn't change over its lifetime.
  const parentStore = untrack(() => useDrawerRootContext(true));
  const isNestedDrawer = parentStore !== undefined;

  const resolvedDefaultSnapPoint = () =>
    props.defaultSnapPoint !== undefined ? props.defaultSnapPoint : (props.snapPoints?.[0] ?? null);
  const isSnapPointControlled = () => props.snapPoint !== undefined;

  const [activeSnapPointUnwrapped, setActiveSnapPointUnwrapped] = createControllableSignal<
    DrawerSnapPoint | null
  >({
    controlled: () => props.snapPoint,
    default: untrack(resolvedDefaultSnapPoint),
    name: 'Drawer',
    state: 'snapPoint',
  });

  function setActiveSnapPoint(
    nextSnapPoint: DrawerSnapPoint | null,
    eventDetails?: DrawerRoot.SnapPointChangeEventDetails,
  ) {
    const resolvedEventDetails = eventDetails ?? createChangeEventDetails(REASONS.none);

    props.onSnapPointChange?.(nextSnapPoint, resolvedEventDetails);

    if (resolvedEventDetails.isCanceled) {
      return;
    }

    setActiveSnapPointUnwrapped(nextSnapPoint);
  }

  const resolvedActiveSnapPoint = (): DrawerSnapPoint | null => {
    if (isSnapPointControlled()) {
      return activeSnapPointUnwrapped();
    }

    const snapPoints = props.snapPoints;
    if (!snapPoints || snapPoints.length === 0) {
      return activeSnapPointUnwrapped();
    }

    const current = activeSnapPointUnwrapped();
    if (current === null || !snapPoints.some((snapPoint) => Object.is(snapPoint, current))) {
      return resolvedDefaultSnapPoint();
    }

    return current;
  };

  const store = createPopupRootStore<DrawerStoreState<Payload>, DrawerStore<Payload>>(
    (floatingId, floatingNested) =>
      new DrawerStore<Payload>(
        untrack(() => ({
          open: props.defaultOpen ?? false,
          openProp: props.open,
          activeTriggerId: props.defaultTriggerId ?? null,
          triggerIdProp: props.triggerId,
          modal: modal(),
          disablePointerDismissal: disablePointerDismissal(),
          nested: isNestedDrawer,
          role: 'dialog',
          swipeDirection: swipeDirection(),
          snapToSequentialPoints: snapToSequentialPoints(),
          snapPoints: props.snapPoints,
          activeSnapPoint: resolvedActiveSnapPoint(),
        })),
        floatingId,
        floatingNested,
      ),
    true,
  );

  store.context.parentStore = parentStore;

  store.syncValue('openProp', () => props.open);
  store.syncValue('triggerIdProp', () => props.triggerId);

  // Plain function assignments to non-reactive `context` slots, invoked later from event
  // handlers/effects — not a tracked-scope read, so the lint rule's warning is a false positive
  // (same pattern as `DialogRoot`/`PreviewCardRoot`'s equivalent assignments).
  store.context.onOpenChange = (open, eventDetails) => {
    props.onOpenChange?.(open, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    const snapPoints = props.snapPoints;
    if (!open && snapPoints && snapPoints.length > 0) {
      setActiveSnapPoint(
        untrack(resolvedDefaultSnapPoint),
        createChangeEventDetails(eventDetails.reason, eventDetails.event, eventDetails.trigger),
      );
    }
  };
  store.context.onOpenChangeComplete = (open) => {
    props.onOpenChangeComplete?.(open);
  };

  createSyncedValues(store, () => ({
    modal: modal(),
    disablePointerDismissal: disablePointerDismissal(),
    nested: isNestedDrawer,
    role: 'dialog' as const,
    swipeDirection: swipeDirection(),
    snapToSequentialPoints: snapToSequentialPoints(),
    snapPoints: props.snapPoints,
    activeSnapPoint: resolvedActiveSnapPoint(),
  }));

  // Attaches this root's store to `handle` (if provided), so detached `Drawer.Trigger`s sharing the
  // handle migrate their registration and interactions onto it.
  createEffect(() => {
    const handle = props.handle;
    if (!handle) {
      return;
    }
    const detach = (handle as DrawerHandle<Payload>).attachStore(store);
    onCleanup(detach);
  });

  const open = store.useState('open');
  const mounted = store.useState('mounted');
  const payload = store.useState('payload') as Accessor<Payload | undefined>;
  const popupHeight = store.useState('popupHeight');

  createImplicitActiveTrigger(store);
  createOpenStateTransitions(open, store);

  // Solid port of upstream's `usePopupRootSync`: reset `openMethod` once the drawer closes (and on
  // teardown) — mirrors `DialogRoot`'s equivalent effect.
  createEffect(() => {
    if (!open() && store.state.openMethod !== null) {
      store.set('openMethod', null);
    }
  });
  onCleanup(() => {
    if (store.state.openMethod !== null) {
      store.set('openMethod', null);
    }
  });

  // Tracks whether a nested drawer is currently reporting a frontmost height, so this drawer's own
  // `frontmostHeight` falls back to its own `popupHeight` once the nested drawer closes.
  const [isNestedDrawerOpen, setIsNestedDrawerOpen] = useSignal(false, 'isNestedDrawerOpen');

  createEffect(() => {
    const height = popupHeight();
    if (!isNestedDrawerOpen() && height > 0) {
      store.set('frontmostHeight', height);
    }
  });

  // Plain function assignments to non-reactive `context` slots, invoked later by a nested Root's
  // own popup/viewport — not a tracked-scope read, so the lint rule's warning is a false positive
  // (same pattern as `DialogRoot`'s `store.context.onNestedDialogOpen` assignment).
  store.context.onNestedFrontmostHeightChange = (height: number) => {
    if (height > 0) {
      setIsNestedDrawerOpen(true);
      store.set('frontmostHeight', height);
      return;
    }

    setIsNestedDrawerOpen(false);
    const currentPopupHeight = untrack(popupHeight);
    if (currentPopupHeight > 0) {
      store.set('frontmostHeight', currentPopupHeight);
    }
  };
  store.context.onNestedDrawerPresenceChange = (present: boolean) => {
    store.set('hasNestedDrawer', present);
  };
  store.context.onNestedSwipingChange = (swiping: boolean) => {
    store.set('nestedSwiping', swiping);
    store.context.parentStore?.context.onNestedSwipingChange?.(swiping);
  };
  store.context.onNestedSwipeProgressChange = (progress: number) => {
    store.set('nestedSwipeProgress', progress);
    store.context.parentStore?.context.onNestedSwipeProgressChange?.(progress);
  };
  store.context.setActiveSnapPoint = setActiveSnapPoint;

  const shouldRenderInteractions = () => open() || mounted();

  return (
    <DrawerRootContext.Provider value={store as DrawerRootContext}>
      <Show when={shouldRenderInteractions()}>
        <DrawerInteractions store={store} parentContext={parentStore?.context} />
      </Show>
      <DrawerProviderReporter store={store} />
      <DrawerRootChildren payload={payload}>{props.children}</DrawerRootChildren>
    </DrawerRootContext.Provider>
  );
}

/**
 * Renders `Drawer.Root`'s `children` — either plain JSX, or a payload-receiving render function.
 * See `TooltipRootChildren`'s doc comment (`tooltip/root/TooltipRoot.tsx`) for why this must be a
 * separate component that reads `props.children` exactly once.
 *
 * Deviation: as with `TooltipRootChildren`/`PreviewCardRootChildren`/`DialogRootChildren`, upstream
 * re-evaluates `children({ payload })` on every React re-render, so a render-function `children`
 * reactively reflects `payload` changes over time (e.g. a detached trigger reopening the same
 * mounted Root with a different payload). This component's body runs once (Solid semantics), so
 * the render function is only called once, with the `payload` value at that moment — it will not
 * re-render on a later payload change while the same `Drawer.Root` stays mounted. Only the
 * render-function form of `children` is affected; plain JSX children are unaffected, and consumers
 * that need live payload updates can read `useDrawerRootContext().useState('payload')` directly
 * instead of destructuring the render-function argument (see `DrawerRoot.test.tsx`'s
 * `PayloadDisplay` helper).
 */
function DrawerRootChildren<Payload>(props: {
  children?: JSX.Element | DrawerRoot.PayloadChildRenderFunction<Payload>;
  payload: Accessor<Payload | undefined>;
}): JSX.Element {
  const childrenValue = props.children;
  if (typeof childrenValue === 'function') {
    return (childrenValue as DrawerRoot.PayloadChildRenderFunction<Payload>)({
      payload: props.payload(),
    });
  }
  return childrenValue as JSX.Element;
}

/**
 * Sets up dismiss interactions (escape/outside press), scroll lock, and nested-drawer-count
 * tracking. Solid port of upstream's `DialogInteractions`, self-contained for `DrawerStore`.
 */
function DrawerInteractions<Payload>(props: {
  store: DrawerStore<Payload>;
  parentContext: DrawerStoreContext | undefined;
}): JSX.Element {
  const store = props.store;
  const floatingRootContext = store.state.floatingRootContext;

  const open = store.useState('open');
  const disablePointerDismissal = store.useState('disablePointerDismissal');
  const modal = store.useState('modal');
  const popupElement = store.useState('popupElement');

  const [ownNestedOpenDialogs, setOwnNestedOpenDialogs] = useSignal(0, 'ownNestedOpenDialogs');
  const [ownNestedOpenDrawers, setOwnNestedOpenDrawers] = useSignal(0, 'ownNestedOpenDrawers');
  const isTopmost = () => ownNestedOpenDialogs() === 0;

  const dismiss = useDismiss(floatingRootContext, {
    outsidePressEvent: () => {
      if (store.context.internalBackdropRef.current || store.context.backdropRef.current) {
        return 'intentional';
      }
      return {
        mouse: modal() === 'trap-focus' ? 'sloppy' : 'intentional',
        touch: 'sloppy',
      };
    },
    outsidePress: () => (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (!store.context.outsidePressEnabled.current) {
        return false;
      }

      if ('button' in event && event.button !== 0) {
        return false;
      }
      if ('touches' in event) {
        if (event.type === 'touchend') {
          if (event.changedTouches.length !== 1 || event.touches.length !== 0) {
            return false;
          }
        } else if (event.touches.length !== 1) {
          return false;
        }
      }

      const target = getTarget(event) as Element | null;
      if (isTopmost() && !disablePointerDismissal()) {
        if (modal()) {
          return store.context.internalBackdropRef.current || store.context.backdropRef.current
            ? store.context.internalBackdropRef.current === target ||
                store.context.backdropRef.current === target ||
                (contains(target, popupElement()) && !target?.hasAttribute('data-base-ui-portal'))
            : true;
        }
        return true;
      }
      return false;
    },
    escapeKey: isTopmost,
  });

  createScrollLock(
    () => open() && modal() === true,
    () => popupElement(),
  );

  store.context.onNestedDialogOpen = (dialogCount, drawerCount) => {
    setOwnNestedOpenDialogs(dialogCount);
    setOwnNestedOpenDrawers(drawerCount);
  };
  store.context.onNestedDialogClose = () => {
    setOwnNestedOpenDialogs(0);
    setOwnNestedOpenDrawers(0);
  };

  createEffect(() => {
    const isOpen = open();
    const dialogsCount = ownNestedOpenDialogs();
    const drawersCount = ownNestedOpenDrawers();

    if (props.parentContext?.onNestedDialogOpen && isOpen) {
      // Every drawer nested within a `Drawer.Root` is itself a drawer, so the nested-drawer count
      // always matches the nested-dialog count in this self-contained port (see `DrawerStore`'s doc
      // comment on `nestedOpenDrawerCount` for the cross-component-nesting caveat this implies).
      props.parentContext.onNestedDialogOpen(dialogsCount + 1, drawersCount + 1);
    }
    if (props.parentContext?.onNestedDialogClose && !isOpen) {
      props.parentContext.onNestedDialogClose();
    }

    onCleanup(() => {
      if (props.parentContext?.onNestedDialogClose && isOpen) {
        props.parentContext.onNestedDialogClose();
      }
    });
  });

  const activeTriggerProps = dismiss.reference ?? EMPTY_OBJECT;
  const inactiveTriggerProps = dismiss.trigger ?? EMPTY_OBJECT;
  const popupProps = dismiss.floating ?? EMPTY_OBJECT;

  createPopupInteractionProps(store, () => ({
    activeTriggerProps,
    inactiveTriggerProps,
    popupProps,
    nestedOpenDialogCount: ownNestedOpenDialogs(),
    nestedOpenDrawerCount: ownNestedOpenDrawers(),
  }));

  return undefined as unknown as JSX.Element;
}

/**
 * Reports this drawer's open state to the nearest `Drawer.Provider` (if any), and enables the
 * Android back gesture (via `CloseWatcher`) while this drawer is the topmost open one.
 * Solid port of upstream's `DrawerProviderReporter`.
 */
function DrawerProviderReporter<Payload>(props: { store: DrawerStore<Payload> }): JSX.Element {
  const store = props.store;
  const drawerId = generateId('wheel-drawer');

  const providerContext = useDrawerProviderContext(true);

  const open = store.useState('open');
  const nestedOpenDialogCount = store.useState('nestedOpenDialogCount');
  const popupElement = store.useState('popupElement');

  onCleanup(() => {
    providerContext?.removeDrawer(drawerId);
  });

  createEffect(() => {
    providerContext?.setDrawerOpen(drawerId, open());
  });

  // CloseWatcher enables the Android back gesture (Chromium-only). Android-only for now to avoid
  // interfering with Escape/nesting semantics on desktop due to `useDismiss`.
  createEffect(() => {
    const isOpen = open();
    const isTopmost = nestedOpenDialogCount() === 0;

    if (!isOpen || !isTopmost || !platform.os.android) {
      return;
    }

    const win = ownerWindow(popupElement());
    const CloseWatcherCtor = (win as Window & { CloseWatcher?: (new () => any) | undefined })
      .CloseWatcher;
    if (!CloseWatcherCtor) {
      return;
    }

    function handleCloseWatcher(event: Event) {
      if (!untrack(store.useState('open'))) {
        return;
      }
      store.setOpen(false, createChangeEventDetails(REASONS.closeWatcher, event));
    }

    const closeWatcher = new CloseWatcherCtor();
    const unsubscribe = addEventListener(closeWatcher, 'close', handleCloseWatcher);

    onCleanup(() => {
      unsubscribe();
      closeWatcher.destroy();
    });
  });

  return undefined as unknown as JSX.Element;
}

export interface DrawerRootState {}

export interface DrawerRootProps<Payload = unknown> {
  /**
   * Whether the drawer is currently open.
   */
  open?: boolean | undefined;
  /**
   * Whether the drawer is initially open.
   *
   * To render a controlled drawer, use the `open` prop instead.
   * @default false
   */
  defaultOpen?: boolean | undefined;
  /**
   * Determines if the drawer enters a modal state when open.
   * - `true`: user interaction is limited to just the drawer: focus is trapped, document page scroll is locked, and pointer interactions on outside elements are disabled.
   * - `false`: user interaction with the rest of the document is allowed.
   * - `'trap-focus'`: focus is trapped inside the drawer, but document page scroll is not locked and pointer interactions outside of it remain enabled.
   * @default true
   */
  modal?: boolean | 'trap-focus' | undefined;
  /**
   * Event handler called when the drawer is opened or closed.
   */
  onOpenChange?: ((open: boolean, eventDetails: DrawerRoot.ChangeEventDetails) => void) | undefined;
  /**
   * Event handler called after any animations complete when the drawer is opened or closed.
   */
  onOpenChangeComplete?: ((open: boolean) => void) | undefined;
  /**
   * Whether to prevent the drawer from closing on outside presses.
   * For non-modal drawers, this also prevents the drawer from closing when focus moves outside of it.
   * @default false
   */
  disablePointerDismissal?: boolean | undefined;
  /**
   * A handle to associate the drawer with a trigger.
   * If specified, allows detached triggers to control the drawer's open state.
   * Can be created with `Drawer.createHandle()`.
   */
  handle?: DrawerHandle<Payload> | undefined;
  /**
   * ID of the trigger that the drawer is associated with.
   * This is useful in conjunction with the `open` prop to create a controlled drawer.
   * There's no need to specify this prop when the drawer is uncontrolled (that is, when the `open` prop is not set).
   */
  triggerId?: string | null | undefined;
  /**
   * ID of the trigger that the drawer is associated with.
   * This is useful in conjunction with the `defaultOpen` prop to create an initially open drawer.
   */
  defaultTriggerId?: string | null | undefined;
  /**
   * The content of the drawer.
   */
  children?: JSX.Element | DrawerRoot.PayloadChildRenderFunction<Payload>;
  /**
   * The swipe direction used to dismiss the drawer.
   * @default 'down'
   */
  swipeDirection?: DrawerSwipeDirection | undefined;
  /**
   * Snap points used to position the drawer.
   * Use numbers between 0 and 1 to represent fractions of the viewport height,
   * numbers greater than 1 as pixel values, or strings in `px`/`rem` units
   * (for example, `'148px'` or `'30rem'`).
   */
  snapPoints?: DrawerSnapPoint[] | undefined;
  /**
   * Disables velocity-based snap skipping so drag distance determines the next snap point.
   * @default false
   */
  snapToSequentialPoints?: boolean | undefined;
  /**
   * The currently active snap point. Use with `onSnapPointChange` to control the snap point.
   */
  snapPoint?: DrawerSnapPoint | null | undefined;
  /**
   * The initial snap point value when uncontrolled.
   */
  defaultSnapPoint?: DrawerSnapPoint | null | undefined;
  /**
   * Callback fired when the snap point changes.
   */
  onSnapPointChange?:
    | ((
        snapPoint: DrawerSnapPoint | null,
        eventDetails: DrawerRoot.SnapPointChangeEventDetails,
      ) => void)
    | undefined;
}

export type DrawerRootChangeEventReason =
  | typeof REASONS.triggerPress
  | typeof REASONS.outsidePress
  | typeof REASONS.escapeKey
  | typeof REASONS.closeWatcher
  | typeof REASONS.closePress
  | typeof REASONS.focusOut
  | typeof REASONS.imperativeAction
  | typeof REASONS.swipe
  | typeof REASONS.none;

export type DrawerRootChangeEventDetails = BaseUIChangeEventDetails<DrawerRootChangeEventReason> & {
  preventUnmountOnClose(): void;
};

export type DrawerRootSnapPointChangeEventReason = DrawerRootChangeEventReason;

export type DrawerRootSnapPointChangeEventDetails =
  BaseUIChangeEventDetails<DrawerRootSnapPointChangeEventReason>;

export namespace DrawerRoot {
  export type State = DrawerRootState;
  export type Props<Payload = unknown> = DrawerRootProps<Payload>;
  export type ChangeEventReason = DrawerRootChangeEventReason;
  export type ChangeEventDetails = DrawerRootChangeEventDetails;
  export type SnapPointChangeEventReason = DrawerRootSnapPointChangeEventReason;
  export type SnapPointChangeEventDetails = DrawerRootSnapPointChangeEventDetails;
  export type SnapPoint = DrawerSnapPoint;
  export type PayloadChildRenderFunction<Payload> = (arg: {
    payload: Payload | undefined;
  }) => JSX.Element;
}
