/**
 * `<Show>` — Solid's, plus the one thing the debug tree could not otherwise
 * know: WHY a component is rendering nothing.
 *
 * THE PROBLEM. A component whose root is a falsy `<Show>` renders no DOM, so
 * it has no elements in the registry. Neither does a deliberately headless
 * component (one that drives toasts and returns nothing). Neither does a
 * component whose author simply forgot `use:componentRoot`. In the tree all
 * three looked identical — "⊘ no DOM" — and the first is the interesting
 * one: the todos demo's ClearCompletedButton is *supposed* to disappear
 * until something is completed, and until now you could not tell that from
 * a bug.
 *
 *   import { Show } from 'wheel/core';
 *
 *   export function ClearCompletedButton() {
 *     const state = connectClearCompleted({});
 *     return (
 *       <Show when={state.completedCount > 0}>
 *         <button use:componentRoot onClick={state.clear}>Clear completed</button>
 *       </Show>
 *     );
 *   }
 *
 * Drop-in: same props, same generics, same fallback/keyed behavior as
 * Solid's. The only addition is that it reports `when`'s truthiness to the
 * nearest enclosing connected component, which the tree renders as
 * `⊘ hidden` (a condition said no) rather than the ambiguous `⊘ no DOM`.
 *
 * WHY A COMPONENT AND NOT A DIRECTIVE. Solid directives (`use:x`) only
 * attach to host elements; `<Show>` is a component, so there is nothing to
 * attach to. Wrapping the component is the only seam that sees the
 * condition.
 *
 * Dev-only cost: outside dev mode this is Solid's `Show` with one extra
 * function call that returns immediately.
 */
import { Show as SolidShow, createEffect, useContext, type Accessor, type JSX } from 'solid-js';

import { WheelContext } from './context';
import { isWheelDevMode } from './dev-mode';
import { currentInstance } from './connect';

/**
 * Props for wheel's `<Show>` — Solid's exactly, including the `keyed`
 * split: unkeyed children receive an ACCESSOR, keyed children receive the
 * value. Both overloads are declared below so a drop-in replacement really
 * is drop-in.
 */
export interface ShowProps<T> {
  when: T | undefined | null | false;
  keyed?: boolean;
  fallback?: JSX.Element;
  children: JSX.Element | ((item: never) => JSX.Element);
}

/** Unkeyed: children receive an accessor (Solid's default form). */
export function Show<T>(props: {
  when: T | undefined | null | false;
  keyed?: false;
  fallback?: JSX.Element;
  children: JSX.Element | ((item: Accessor<NonNullable<T>>) => JSX.Element);
}): JSX.Element;
/** Keyed: children receive the value itself and re-run when it changes identity. */
export function Show<T>(props: {
  when: T | undefined | null | false;
  keyed: true;
  fallback?: JSX.Element;
  children: JSX.Element | ((item: NonNullable<T>) => JSX.Element);
}): JSX.Element;
/**
 * Solid's `<Show>`, reporting its condition to the debug tree so a hidden
 * component reads as HIDDEN instead of as missing DOM. See the module doc.
 */
export function Show<T>(props: ShowProps<T>): JSX.Element {
  if (isWheelDevMode()) {
    const context = useContext(WheelContext);
    const record = currentInstance();
    if (context && record) {
      // reactive boundary: the condition is the thing being reported, so the
      // report has to re-run whenever it changes.
      createEffect(() => {
        record.hiddenBy = props.when ? null : 'show';
        context.services.registry.notifyDebug();
      });
    }
  }
  return SolidShow(props as never) as unknown as JSX.Element;
}
