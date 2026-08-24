import { createComputed, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { PopupHandleStoreProvider } from './popupHandle';

/**
 * Reads the store currently exposed by a popup handle and subscribes to store-pointer changes.
 * Detached triggers use this to follow a handle as a root attaches or detaches: while no root is
 * attached, the handle exposes its fallback store; once a root attaches, subscribers re-run and
 * read from the live root store.
 *
 * Solid port of upstream's `usePopupHandleStore` (there a `useSyncExternalStore` subscription):
 * takes the handle as an accessor (it is a prop) and returns an accessor over the current store.
 *
 * Returns `undefined` when no handle is provided so callers can fall back to their root context.
 *
 * @param handle Accessor for the popup handle, or `undefined` when the trigger is not handle-bound.
 */
export function usePopupHandleStore<HandleStore>(
  handle: Accessor<PopupHandleStoreProvider<HandleStore> | undefined>,
): Accessor<HandleStore | undefined> {
  const [store, setStore] = createSignal<HandleStore | undefined>(undefined);

  // `createComputed` (not `createEffect`) so the store pointer updates during the reactive phase —
  // the closest analog to upstream re-rendering subscribers synchronously with the pointer change.
  createComputed(() => {
    const currentHandle = handle();

    if (currentHandle === undefined) {
      setStore(undefined);
      return;
    }

    setStore(() => currentHandle.store);
    const unsubscribe = currentHandle.subscribeStore(() => {
      setStore(() => currentHandle.store);
    });
    onCleanup(unsubscribe);
  });

  return store;
}
