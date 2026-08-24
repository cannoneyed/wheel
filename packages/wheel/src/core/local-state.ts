/**
 * `useSignal` — component-local state that the debug tree can SEE.
 *
 * Wheel's doctrine already says shared state lives in a service and
 * ephemeral, component-bound state (an open flag, a hover, an input draft)
 * may stay local. The gap was that local state is invisible: a plain
 * `createSignal` is an anonymous closure, so a component whose behavior is
 * driven by `isOpen` shows nothing about `isOpen` anywhere, and debugging
 * it means reading the source and guessing.
 *
 *   const [draft, setDraft] = useSignal('', 'draft');
 *
 * Identical to `createSignal` — same tuple, same options, same semantics —
 * except that the NAME is recorded against the mounted component, so the
 * tree renders a `local` group with its live value beside the component's
 * connect state and props.
 *
 * The name is required and is the whole point: `require-use-signal`
 * enforces the swap, and an unnamed signal would trade one anonymous
 * closure for another.
 *
 * Cost outside dev mode: one function call that returns `createSignal`'s
 * result untouched. Nothing is registered, nothing is retained.
 */
import { createSignal, getOwner, type Signal, type SignalOptions } from 'solid-js';

import { currentInstance } from './connect';
import { isWheelDevMode } from './dev-mode';

/**
 * Component-local signal, named for the debug tree. Drop-in for
 * `createSignal(initial, options)`; see the module doc.
 */
export function useSignal<T>(initial: T, name: string, options?: SignalOptions<T>): Signal<T> {
  const signal = createSignal(initial, options);
  if (!isWheelDevMode()) {
    return signal;
  }
  // Registration is per MOUNT, and the record is discarded with the
  // instance, so nothing needs cleaning up here. Called outside a component
  // (a module-level signal, a test helper), there is no instance to attach
  // to and the signal is simply not tracked.
  if (getOwner()) {
    currentInstance()?.locals.push({ name, read: signal[0] });
  }
  return signal;
}
