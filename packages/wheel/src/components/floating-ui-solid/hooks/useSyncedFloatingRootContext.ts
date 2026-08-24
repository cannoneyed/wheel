/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createComputed, type Accessor } from 'solid-js';
import { isElement } from '@floating-ui/utils/dom';
import type { BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import type { PopupTriggerMap } from '../../utils/popups/popupTriggerMap';
import { FloatingRootStore, type FloatingRootState } from '../components/FloatingRootStore';
import type { ReferenceType } from '../types';

/**
 * Minimal state shape a popup store needs for syncing into a
 * `FloatingRootStore`. Upstream's version is generic over the full
 * `PopupStoreState<Payload>` (defined in `utils/popups/store.ts`), which
 * hasn't been ported to Solid yet — that's owned by whichever port brings
 * over `Menu`/`Popover` and their shared popup-store infrastructure. This
 * interface is intentionally scoped to just the fields this hook reads, so
 * it structurally matches both a real ported `PopupStore` later and any test
 * double today.
 */
export interface SyncedPopupStoreState {
  open: boolean;
  activeTriggerElement: ReferenceType | null;
  popupElement?: HTMLElement | null | undefined;
  positionerElement?: HTMLElement | null | undefined;
  floatingId?: string | undefined;
}

export interface SyncedPopupStoreLike<State extends SyncedPopupStoreState> {
  readonly state: State;
  readonly context: { readonly triggerElements: PopupTriggerMap };
  useState<Key extends keyof State>(key: Key): Accessor<State[Key]>;
  /**
   * Solid analog of upstream's `popupStore.useSyncedValue('floatingId', ...)`
   * — keeps a value the popup store's own consumers may read (e.g.
   * `popupStore.state.floatingId`) up to date. `SolidStore` already exposes
   * this exact method (see `packages/solid/src/floating-ui-solid/components/
   * FloatingRootStore.ts`'s `syncValue` usage), so any real popup store built
   * on it satisfies this for free.
   */
  syncValue<Key extends keyof State>(key: Key, value: Accessor<State[Key]>): void;
}

export interface UseSyncedFloatingRootContextOptions<
  State extends SyncedPopupStoreState,
  OpenChangeEventDetails extends BaseUIChangeEventDetails<string>,
> {
  popupStore: SyncedPopupStoreLike<State>;
  /**
   * Whether the Popup element is passed to Floating UI as the floating element instead of the default Positioner.
   */
  treatPopupAsFloatingElement?: boolean | undefined;
  floatingRootContext?: FloatingRootStore | undefined;
  floatingId: string | undefined;
  nested: boolean;
  onOpenChange(open: boolean, eventDetails: OpenChangeEventDetails): void;
}

/**
 * Keeps a `FloatingRootStore` in sync with the provided popup store. Uses the
 * provided `FloatingRootStore` when one exists, otherwise creates one once
 * and keeps it synced going forward.
 *
 * Solid port of upstream's `useSyncedFloatingRootContext`. Upstream builds
 * the internal store once via `useRef` (only when no external
 * `floatingRootContext` is supplied) and re-syncs it every render through a
 * layout effect. Here, hook setup runs exactly once, so the store is
 * plain-constructed (mirroring `useFloatingRootContext`'s equivalent
 * comment), and `createComputed` takes over the job of the layout effect —
 * rerunning whenever `open`/`floatingId`/the reference or floating elements
 * change to keep the store synced.
 */
export function useSyncedFloatingRootContext<
  State extends SyncedPopupStoreState,
  OpenChangeEventDetails extends BaseUIChangeEventDetails<string>,
>(
  options: UseSyncedFloatingRootContextOptions<State, OpenChangeEventDetails>,
): FloatingRootStore {
  const {
    popupStore,
    treatPopupAsFloatingElement = false,
    floatingRootContext: floatingRootContextProp,
    floatingId,
    nested,
  } = options;

  const open = popupStore.useState('open');
  const referenceElement = popupStore.useState('activeTriggerElement');
  const floatingElementKey: 'popupElement' | 'positionerElement' = treatPopupAsFloatingElement
    ? 'popupElement'
    : 'positionerElement';
  const floatingElementState = popupStore.useState(floatingElementKey);
  const floatingElement: Accessor<HTMLElement | null> = () => floatingElementState() ?? null;
  const triggerElements = popupStore.context.triggerElements;

  const handleOpenChange = options.onOpenChange as (
    open: boolean,
    eventDetails: BaseUIChangeEventDetails<string>,
  ) => void;

  const store =
    floatingRootContextProp ??
    new FloatingRootStore({
      open: open(),
      transitionStatus: undefined,
      referenceElement: referenceElement(),
      floatingElement: floatingElement(),
      triggerElements,
      onOpenChange: handleOpenChange,
      floatingId,
      syncOnly: true,
      nested,
    });

  popupStore.syncValue('floatingId', () => floatingId as State['floatingId']);

  createComputed(() => {
    const openValue = open();
    const floatingIdValue = floatingId;
    const referenceValue = referenceElement();
    const floatingValue = floatingElement();

    const valuesToSync: Partial<FloatingRootState> = {
      open: openValue,
      floatingId: floatingIdValue,
      referenceElement: referenceValue,
      floatingElement: floatingValue,
    };

    if (isElement(referenceValue)) {
      valuesToSync.domReferenceElement = referenceValue;
    }

    if (store.state.positionReference === store.state.referenceElement) {
      valuesToSync.positionReference = referenceValue;
    }

    store.update(valuesToSync);
  });

  // Keep non-reactive context values fresh for interactions that call `store.setOpen`.
  store.context.onOpenChange = handleOpenChange;
  store.context.nested = nested;

  return store;
}
