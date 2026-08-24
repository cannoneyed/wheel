/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { createEffect, onCleanup, untrack, type JSX } from 'solid-js';
import { ToastContext } from './ToastProviderContext';
import type { ToastManager } from '../createToastManager';
import { ToastStore } from '../store/ToastStore';

/**
 * Provides a context for creating and managing toasts.
 * Solid port of upstream's `ToastProvider`.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 *
 * Deviation: the store is constructed directly in the component body (Solid setup code runs
 * exactly once per instance, unlike React's `useRefWithInit`) and disposed via `onCleanup` instead
 * of upstream's `useOnMount(store.disposeEffect)`.
 */
export function ToastProvider(props: ToastProvider.Props): JSX.Element {
  const timeout = () => props.timeout ?? 5000;
  const limit = () => props.limit ?? 3;

  const store = new ToastStore(
    untrack(() => ({
      timeout: timeout(),
      limit: limit(),
      viewport: null,
      toasts: [],
      hovering: false,
      focused: false,
      isWindowFocused: true,
      prevFocusElement: null,
    })),
  );

  onCleanup(store.dispose);

  createEffect(() => {
    const toastManager = props.toastManager;
    if (!toastManager) {
      return;
    }

    const unsubscribe = toastManager[' subscribe'](({ action, options }) => {
      const id = options.id;

      if (action === 'promise' && options.promise) {
        store.promiseToast(options.promise, options);
      } else if (action === 'update' && id) {
        store.updateToast(id, options);
      } else if (action === 'close') {
        store.closeToast(id);
      } else {
        store.addToast(options);
      }
    });

    onCleanup(unsubscribe);
  });

  // `limit` needs custom syncing because changing it must also recompute each
  // toast's `limited` flag; a plain synced value would only update the raw number.
  createEffect(() => {
    store.syncProviderProps({ timeout: timeout(), limit: limit() });
  });

  return <ToastContext.Provider value={store}>{props.children}</ToastContext.Provider>;
}

export interface ToastProviderState {}

export interface ToastProviderProps {
  children?: JSX.Element;
  /**
   * The default amount of time (in ms) before a toast is auto dismissed.
   * A value of `0` will prevent the toast from being dismissed automatically.
   * @default 5000
   */
  timeout?: number | undefined;
  /**
   * The maximum number of toasts that can be displayed at once.
   * When the limit is exceeded, the oldest toasts are marked as `limited` (via the `data-limited`
   * attribute) rather than removed, so they can be hidden or animated out.
   * @default 3
   */
  limit?: number | undefined;
  /**
   * A global manager for toasts to use outside of a component.
   */
  toastManager?: ToastManager | undefined;
}

export namespace ToastProvider {
  export type State = ToastProviderState;
  export type Props = ToastProviderProps;
}
