/**
 * ToastSystem's enumerated states — every toast kind, the stack, and empty.
 * Rendered by the playground (`#/states/ToastSystem/...`); the shapes are
 * compiler-checked against the connection.
 */
import { defineStates } from '../core/states';

import { ToastSystem, connectToastSystem, type Toast, type ToastKind } from './toast';

const toast = (id: string, text: string, kind: ToastKind): Toast => ({
  id,
  text,
  kind,
  state: 'active',
  shownAt: 0
});

const noop = (): void => {};

/** ToastSystem states: every kind stacked, one progress toast, empty. */
export default defineStates({
  name: 'ToastSystem',
  component: ToastSystem,
  connection: connectToastSystem,
  states: {
    'all kinds stacked': {
      note: 'progress, success, warn, info — bottom-right stack order',
      shape: {
        toasts: [
          toast('a', 'Saving 3 changes…', 'progress'),
          toast('b', '✓ Saved', 'success'),
          toast('c', 'Connection lost — retrying', 'warn'),
          toast('d', 'Copied to clipboard', 'info')
        ],
        dismiss: noop
      }
    },
    'single progress': {
      shape: { toasts: [toast('a', 'Saving 1 change…', 'progress')], dismiss: noop }
    },
    empty: {
      note: 'the host renders nothing visible',
      shape: { toasts: [], dismiss: noop }
    }
  }
});
