/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/**
 * Solid port of upstream's `createSelector`/`createSelectorMemoized`.
 *
 * Upstream memoizes selectors (via reselect) because every React subscriber
 * re-runs them on any store write. In Solid, selector reads through the store
 * proxy are fine-grained reactive — a selector accessor only re-evaluates
 * when the state keys it actually read change — so memoization is redundant
 * and selectors are plain functions.
 */
export function createSelector<F extends (...args: any[]) => any>(fn: F): F {
  return fn;
}

export const createSelectorMemoized = createSelector;
