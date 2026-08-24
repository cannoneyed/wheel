/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createComputed, createEffect, createUniqueId, onCleanup, untrack, type Accessor } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import { FOCUSABLE_ATTRIBUTE } from '../../floating-ui-solid/utils/constants';
import { useFloatingParentNodeId } from '../../floating-ui-solid/components/FloatingTree';
import { useSyncedFloatingRootContext } from '../../floating-ui-solid/hooks/useSyncedFloatingRootContext';
import type { InteractionType } from '../../floating-ui-solid/components/FloatingFocusManager';
import { createOpenChangeComplete } from '../../internals/createOpenChangeComplete';
import { createTransitionStatus } from '../../internals/createTransitionStatus';
import type { HTMLProps } from '../../internals/types';
import {
  createChangeEventDetails,
  type BaseUIChangeEventDetails,
} from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { PopupStoreContext, PopupStoreSelectors, PopupStoreState } from './store';

export const FOCUSABLE_POPUP_PROPS = {
  tabIndex: -1,
  [FOCUSABLE_ATTRIBUTE]: '',
} satisfies HTMLProps<HTMLElement> & Record<typeof FOCUSABLE_ATTRIBUTE, string>;

/**
 * Returns the default `initialFocus` resolver for a popup. When opened by touch it focuses the
 * popup element itself to prevent the virtual keyboard from opening (required for Android
 * specifically; iOS handles this automatically). Otherwise it falls back to the default behavior.
 * Solid port of upstream's `createDefaultInitialFocus`.
 */
export function createDefaultInitialFocus(getPopupElement: () => HTMLElement | null) {
  return (interactionType: InteractionType) =>
    interactionType === 'touch' ? getPopupElement() : true;
}

/**
 * The subset of a popup store that `createPopupRootStore`/the interaction helpers below rely on.
 * Every concrete popup store (e.g. `TooltipStore`) satisfies this by construction (it extends
 * `PopupStore`, see `store.ts`).
 */
export interface PopupRootStore<State extends PopupStoreState<unknown>> {
  readonly state: Readonly<State>;
  readonly context: PopupStoreContext<any>;
  useState<Key extends keyof PopupStoreSelectors>(
    key: Key,
    ...args: any[]
  ): Accessor<ReturnType<PopupStoreSelectors[Key]>>;
  set<Key extends keyof State>(key: Key, value: State[Key]): void;
  update(changes: Partial<State>): void;
  syncValue<Key extends keyof State>(key: Key, value: Accessor<State[Key]>): void;
  setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<string>): void;
}

/**
 * Creates and owns a popup store on behalf of a Root part. Solid port of upstream's
 * `usePopupRootStore`.
 *
 * Deviation: upstream's version also accepts a `handle` so detached triggers can migrate onto a
 * root's store while it mounts/unmounts (`BasePopupHandle`/`attachStore`). That detached-trigger
 * machinery (`popupHandle.ts`, `usePopupHandleStore.ts`) is not ported yet — no currently-ported
 * component needs it — so this only creates and syncs the store. Whichever port first needs a
 * `handle` prop (e.g. Menu) should extend this rather than duplicate it.
 *
 * @param createStore Factory that builds the store. Called exactly once, receiving the floating id
 * and whether the popup is nested inside another floating element.
 * @param treatPopupAsFloatingElement Whether the popup element is passed to Floating UI as the
 * floating element instead of the default positioner.
 */
export function createPopupRootStore<
  State extends PopupStoreState<unknown>,
  Store extends PopupRootStore<State>,
>(
  createStore: (floatingId: string | undefined, nested: boolean) => Store,
  treatPopupAsFloatingElement = false,
): Store {
  const floatingId = `base-ui-${createUniqueId()}`;
  const nested = useFloatingParentNodeId() != null;

  const store = createStore(floatingId, nested);

  useSyncedFloatingRootContext({
    popupStore: store as any,
    treatPopupAsFloatingElement,
    floatingRootContext: store.state.floatingRootContext,
    floatingId,
    nested,
    onOpenChange: store.setOpen,
  });

  return store;
}

/**
 * Registers/unregisters a trigger element in the store's trigger map. Returns a ref callback for
 * the trigger's rendered element.
 *
 * Deviation: upstream's `useTriggerRegistration` returns a React callback ref, which React calls
 * with the element on mount and with `null` on unmount — that's how the previous registration is
 * cleaned up. Solid's ref callback only fires once, with the mounted element; there is no `null`
 * callback on unmount. Cleanup here instead happens via `onCleanup`, which — for a trigger whose
 * lifetime matches its owning component's — fires at the same point upstream's `null` callback
 * would. A trigger whose `id` changes while still mounted re-registers by having the ref re-invoked
 * is not reproduced (Solid won't re-call the ref), so this only re-registers on (re)mount; not
 * exercised by any Tooltip behavior in the ported test slice.
 */
export function createTriggerRegistration<State extends PopupStoreState<unknown>>(
  id: Accessor<string | undefined>,
  store: Pick<PopupRootStore<State>, 'context' | 'state' | 'set' | 'useState'>,
): (element: Element | null) => void {
  let registeredElementId: string | null = null;
  let registeredElement: Element | null = null;

  function syncTriggerCount() {
    const triggerCount = store.context.triggerElements.size;
    if (untrack(store.useState('open')) && store.state.triggerCount !== triggerCount) {
      store.set('triggerCount', triggerCount);
    }
  }

  function unregister() {
    if (registeredElementId === null) {
      return;
    }

    const registeredId = registeredElementId;
    const element = registeredElement;
    const currentElement = store.context.triggerElements.getById(registeredId);

    registeredElementId = null;
    registeredElement = null;

    if (element && currentElement === element) {
      store.context.triggerElements.delete(registeredId);
      syncTriggerCount();
    }
  }

  onCleanup(unregister);

  return (element: Element | null) => {
    const currentId = id();
    if (currentId === undefined) {
      return;
    }

    unregister();

    if (element !== null) {
      registeredElementId = currentId;
      registeredElement = element;
      store.context.triggerElements.add(currentId, element);
      syncTriggerCount();
    }
  };
}

export function setPopupOpenState(
  state: Partial<PopupStoreState<unknown>>,
  open: boolean,
  trigger: Element | undefined,
  preventUnmountOnClose = false,
) {
  if (open) {
    // Opening starts a new close cycle, so clear any previous request to keep the popup mounted.
    state.preventUnmountingOnClose = false;
  } else if (preventUnmountOnClose) {
    state.preventUnmountingOnClose = true;
  }

  const triggerId = trigger?.id ?? null;

  // If a popup is closing, the `trigger` may be undefined.
  // We want to keep the previous value so that exit animations are played and focus is returned correctly.
  if (triggerId || open) {
    state.activeTriggerId = triggerId;
    state.activeTriggerElement = trigger ?? null;
  }
}

export function attachPreventUnmountOnClose(eventDetails: { preventUnmountOnClose(): void }) {
  let preventUnmountOnClose = false;

  eventDetails.preventUnmountOnClose = () => {
    preventUnmountOnClose = true;
  };

  return () => preventUnmountOnClose;
}

/**
 * Runs the shared open-change sequence for a popup store: notifies `onOpenChange`, honors
 * cancellation, dispatches the floating root change, maps the reason to an `instantType`, and
 * commits the state update.
 *
 * Deviation: upstream wraps the hover branch's state commit in `ReactDOM.flushSync` so a
 * synchronous `node.getAnimations()` read (in `useAnimationsFinished`) observes the new
 * `data-*` attributes immediately. Solid writes to a store are already synchronous and reflected
 * in the DOM before the next microtask/paint (there is no batched commit phase to flush), so no
 * equivalent call is needed here.
 */
export function applyPopupOpenChange<
  State extends PopupStoreState<unknown> & {
    instantType?: 'delay' | 'dismiss' | 'focus' | undefined;
  },
  EventDetails extends BaseUIChangeEventDetails<string>,
>(
  store: {
    readonly context: Pick<PopupStoreContext<EventDetails>, 'onOpenChange'>;
    readonly state: Pick<PopupStoreState<unknown>, 'floatingRootContext'>;
    update(state: Partial<State>): void;
  },
  nextOpen: boolean,
  eventDetails: EventDetails & { preventUnmountOnClose(): void },
  options: {
    onBeforeDispatch?: (() => void) | undefined;
    extraState?: Partial<State> | undefined;
  } = {},
): void {
  const reason = eventDetails.reason;
  const isHover = reason === REASONS.triggerHover;
  const isFocusOpen = nextOpen && reason === REASONS.triggerFocus;
  const isDismissClose =
    !nextOpen && (reason === REASONS.triggerPress || reason === REASONS.escapeKey);

  const shouldPreventUnmountOnClose = attachPreventUnmountOnClose(eventDetails);

  store.context.onOpenChange?.(nextOpen, eventDetails);

  if (eventDetails.isCanceled) {
    return;
  }

  options.onBeforeDispatch?.();

  store.state.floatingRootContext.dispatchOpenChange(nextOpen, eventDetails);

  const updatedState: Partial<PopupStoreState<unknown>> & {
    instantType?: 'delay' | 'dismiss' | 'focus' | undefined;
  } = { ...options.extraState, open: nextOpen };

  if (isFocusOpen) {
    updatedState.instantType = 'focus';
  } else if (isDismissClose) {
    updatedState.instantType = 'dismiss';
  } else if (isHover) {
    updatedState.instantType = undefined;
  }

  setPopupOpenState(updatedState, nextOpen, eventDetails.trigger, shouldPreventUnmountOnClose());
  store.update(updatedState as Partial<State>);
}

/**
 * Sets up trigger data forwarding to the store: registers the trigger element and, while it's the
 * active trigger, applies trigger-owned state (payload, per-trigger close behavior, etc).
 */
export function createTriggerDataForwarding<State extends PopupStoreState<unknown>>(
  triggerId: Accessor<string | undefined>,
  triggerElementRef: { readonly current: Element | null },
  store: PopupRootStore<State>,
  stateUpdates: Accessor<Omit<Partial<State>, 'activeTriggerId' | 'activeTriggerElement'>>,
): {
  registerTrigger: (element: Element | null) => void;
  isMountedByThisTrigger: Accessor<boolean>;
} {
  const isMountedByThisTrigger = store.useState('isMountedByTrigger', triggerId);

  const baseRegisterTrigger = createTriggerRegistration(triggerId, store);

  function applyTriggerData(element: Element) {
    untrack(() => {
      const open = store.useState('open')();
      const activeTriggerId = store.useState('activeTriggerId')();
      const id = triggerId();

      if (activeTriggerId === id) {
        store.update({
          activeTriggerElement: element,
          ...(open ? stateUpdates() : null),
        } as Partial<State>);
        return;
      }

      if (activeTriggerId == null && open) {
        // If a popup is already open, a detached trigger can mount before any active trigger
        // has been established. Claim the first registered trigger so trigger-owned focus
        // management and ARIA relationships work.
        store.update({
          activeTriggerId: id,
          activeTriggerElement: element,
          ...stateUpdates(),
        } as Partial<State>);
      }
    });
  }

  function registerTrigger(element: Element | null) {
    baseRegisterTrigger(element);
    if (element) {
      applyTriggerData(element);
    }
  }

  createEffect(() => {
    if (isMountedByThisTrigger()) {
      const updates = stateUpdates();
      store.update({
        activeTriggerElement: triggerElementRef.current,
        ...updates,
      } as Partial<State>);
    }
  });

  return { registerTrigger, isMountedByThisTrigger };
}

/**
 * Keeps trigger registration state synchronized while the popup is open. See upstream's
 * `useImplicitActiveTrigger` for the full reconciliation rationale; ported behaviorally unchanged.
 *
 * This should be called on the Root part.
 */
export function createImplicitActiveTrigger<State extends PopupStoreState<unknown>>(
  store: PopupRootStore<State> & {
    setOpen(open: boolean, eventDetails: BaseUIChangeEventDetails<typeof REASONS.none>): void;
  },
  options: {
    closeOnActiveTriggerUnmount?: boolean | undefined;
  } = {},
) {
  const { closeOnActiveTriggerUnmount = false } = options;
  const open = store.useState('open');
  const reactiveTriggerCount = store.useState('triggerCount');
  const activeTriggerId = store.useState('activeTriggerId');

  createEffect(() => {
    const isOpen = open();
    // Tracked so this reruns when either changes, matching upstream's dependency array.
    reactiveTriggerCount();
    activeTriggerId();

    if (!isOpen) {
      if (store.state.triggerCount !== 0) {
        store.set('triggerCount', 0);
      }
      return;
    }

    const triggerCount = store.context.triggerElements.size;
    const stateUpdates: Partial<PopupStoreState<unknown>> = {};

    if (store.state.triggerCount !== triggerCount) {
      stateUpdates.triggerCount = triggerCount;
    }

    const currentActiveTriggerId = store.state.activeTriggerId;
    let lostActiveTriggerId: string | null = null;

    if (currentActiveTriggerId) {
      const activeTriggerElement = store.context.triggerElements.getById(currentActiveTriggerId);
      if (!activeTriggerElement) {
        for (const [triggerId, triggerElement] of store.context.triggerElements.entries()) {
          if (triggerElement === store.state.activeTriggerElement) {
            stateUpdates.activeTriggerId = triggerId;
            stateUpdates.activeTriggerElement = triggerElement;
            break;
          }
        }

        if (stateUpdates.activeTriggerId === undefined) {
          lostActiveTriggerId = currentActiveTriggerId;
        }
      } else if (activeTriggerElement !== store.state.activeTriggerElement) {
        stateUpdates.activeTriggerElement = activeTriggerElement;
      }
    }

    if (!lostActiveTriggerId && !currentActiveTriggerId && triggerCount === 1) {
      const iteratorResult = store.context.triggerElements.entries().next();
      if (!iteratorResult.done) {
        const [implicitTriggerId, implicitTriggerElement] = iteratorResult.value;
        stateUpdates.activeTriggerId = implicitTriggerId;
        stateUpdates.activeTriggerElement = implicitTriggerElement;
      }
    }

    if (
      stateUpdates.triggerCount !== undefined ||
      stateUpdates.activeTriggerId !== undefined ||
      stateUpdates.activeTriggerElement !== undefined
    ) {
      store.update(stateUpdates as Partial<State>);
    }

    if (lostActiveTriggerId) {
      if (closeOnActiveTriggerUnmount) {
        // Defer so a same-tick replacement trigger with the same id can register first.
        const capturedLostId = lostActiveTriggerId;
        queueMicrotask(() => {
          if (
            store.useState('open')() &&
            store.useState('activeTriggerId')() === capturedLostId &&
            !store.context.triggerElements.getById(capturedLostId)
          ) {
            const eventDetails = createChangeEventDetails(REASONS.none);
            store.setOpen(false, eventDetails);
            // If closing is canceled, keep the previous active trigger ownership for the
            // still-open popup instead of claiming another trigger implicitly.
            if (!eventDetails.isCanceled) {
              store.update({
                activeTriggerId: null,
                activeTriggerElement: null,
              } as Partial<State>);
            }
          }
        });
      }
    }
  });
}

/**
 * Manages the mounted state of the popup: sets up the transition status and handles unmounting
 * when needed. Updates the `mounted`, `transitionStatus`, and `preventUnmountingOnClose` states in
 * the store.
 *
 * @param open Whether the popup is open.
 * @param store The store managing the popup state.
 * @param onUnmount Optional callback to be called when the popup is unmounted.
 *
 * @returns The transition status accessor, and a function to forcibly unmount the popup.
 */
export function createOpenStateTransitions<State extends PopupStoreState<unknown>>(
  open: Accessor<boolean>,
  store: PopupRootStore<State> & { context: { onOpenChangeComplete?: ((open: boolean) => void) | undefined } },
  onUnmount?: () => void,
) {
  const { mounted, setMounted, transitionStatus } = createTransitionStatus(open);
  const preventUnmountingOnClose = store.useState('preventUnmountingOnClose');
  // Opening starts a new close cycle. Clear synchronously so the close-completion logic below
  // reads the synchronized value on the same pass.
  const syncedPreventUnmountingOnClose = () => (open() ? false : preventUnmountingOnClose());

  createSyncedValues(store, () => ({
    mounted: mounted(),
    transitionStatus: transitionStatus(),
    preventUnmountingOnClose: syncedPreventUnmountingOnClose(),
  }) as Partial<State>);

  function forceUnmount() {
    setMounted(false);
    store.update({
      activeTriggerId: null,
      activeTriggerElement: null,
      mounted: false,
      preventUnmountingOnClose: false,
    } as Partial<State>);
    onUnmount?.();
    store.context.onOpenChangeComplete?.(false);
  }

  const popupElement = store.useState('popupElement') as unknown as Accessor<
    HTMLElement | null | undefined
  >;

  createOpenChangeComplete({
    enabled: () => mounted() && !open() && !syncedPreventUnmountingOnClose(),
    open,
    getElement: popupElement,
    onComplete() {
      if (!open()) {
        forceUnmount();
      }
    },
  });

  return { forceUnmount, transitionStatus };
}

export function createPopupInteractionProps<State extends PopupStoreState<unknown>>(
  store: PopupRootStore<State>,
  statePart: Accessor<
    Partial<State> & Pick<State, 'activeTriggerProps' | 'inactiveTriggerProps' | 'popupProps'>
  >,
) {
  createSyncedValues(store, statePart);

  onCleanup(() => {
    store.update({
      activeTriggerProps: EMPTY_OBJECT,
      inactiveTriggerProps: EMPTY_OBJECT,
      popupProps: EMPTY_OBJECT,
    } as Partial<State>);
  });
}

/**
 * Solid equivalent of upstream's `ReactStore.useSyncedValues`: keeps multiple external reactive
 * values synced into the store whenever any of them change.
 */
export function createSyncedValues<State extends object>(
  store: { update(changes: Partial<State>): void },
  getValues: Accessor<Partial<State>>,
) {
  createComputed(() => {
    store.update(getValues());
  });
}
