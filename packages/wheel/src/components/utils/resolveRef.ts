/**
 * Solid port of upstream's `resolveRef.ts`. Upstream resolves a React
 * `RefObject` (`{ current }`) or a plain value; Solid has no `RefObject`
 * type, but several Base UI Solid APIs (e.g. `FloatingFocusManager`'s
 * `nextFocusableElement`/`previousFocusableElement`) still accept either a
 * plain element or a mutable `{ current }` box (populated elsewhere, e.g. by
 * a portal context), so the duck-typed resolution behavior carries over
 * unchanged.
 */
export function resolveRef<T extends HTMLElement | null | undefined>(
  maybeRef: T | { current: T } | null | undefined,
): T | null | undefined {
  if (maybeRef == null) {
    return maybeRef;
  }

  return 'current' in maybeRef ? maybeRef.current : maybeRef;
}
