import { createEffect, untrack, type Accessor } from 'solid-js';

/**
 * Invokes `onChange` with the previous value whenever the tracked accessor's
 * value changes. Never invoked on setup — only on subsequent changes, mirroring
 * upstream's `useValueChanged` (which compares against the value captured on
 * the previous run rather than firing once on mount).
 *
 * Solid port of upstream's `useValueChanged`. Upstream needs `useStableCallback`
 * to keep `onChange` fresh across renders; that's unnecessary here since a
 * plain function closed over by this call is already stable (see CONVENTIONS.md).
 *
 * (Note: `on(value, fn, { defer: true })` looks like a natural fit here, but
 * Solid's `on` never records the pre-deferred value as "previous" — the first
 * actual invocation after a deferred `on` receives `previous === undefined`
 * instead of the initial value. A plain tracked variable avoids that.)
 */
export function createValueChanged<T>(value: Accessor<T>, onChange: (previousValue: T) => void) {
  let previous = untrack(value);

  createEffect(() => {
    const current = value();
    if (current === previous) {
      return;
    }
    const changedFrom = previous;
    previous = current;
    onChange(changedFrom);
  });
}
