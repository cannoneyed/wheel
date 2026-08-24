/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/**
 * A ref callback in Solid. Solid compiles `ref={x}` on elements into a function
 * call, so a "ref" from a component's perspective is always a setter function
 * (or undefined). Signal setters and `let` variable assignments both arrive as
 * functions.
 */
export type RefCallback<T> = (value: T) => void;

export type MaybeRef<T> = RefCallback<T> | undefined;

/**
 * Composes multiple refs into a single ref callback.
 * Unlike React there is no ref identity/lifecycle concern in Solid: refs are
 * called once when the element is created (and never with `null`).
 */
export function mergeRefs<T>(...refs: MaybeRef<T>[]): RefCallback<T> {
  return (value: T) => {
    for (const ref of refs) {
      ref?.(value);
    }
  };
}
