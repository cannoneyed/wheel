import type { Accessor } from 'solid-js';
import { useComboboxDerivedItemsContext } from '../ComboboxRootContext';

/**
 * Returns an accessor for the internally filtered items.
 * Solid port of upstream's `useFilteredItems`.
 *
 * Deviation: returns an `Accessor<T[]>` rather than the array itself — upstream's hook re-runs
 * (and returns a fresh array) every render, so reading `useFilteredItems()` directly reflects the
 * latest value; in Solid, this function's body runs once, so callers read the *current* filtered
 * items through the returned accessor (`useFilteredItems<T>()()`) inside a tracked scope instead.
 */
export function useFilteredItems<T>(): Accessor<T[]> {
  const items = useComboboxDerivedItemsContext();
  return () => items.filteredItems() as T[];
}
