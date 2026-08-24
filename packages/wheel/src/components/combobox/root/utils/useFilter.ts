/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createMemo, type Accessor } from 'solid-js';
import { createCollatorItemFilter, createSingleSelectionCollatorFilter } from './index';
import { type Filter, type GetFilterParameters, getFilter } from '../../utils/collatorFilter';

export type { Filter };
export type UseFilterOptions = GetFilterParameters;

/**
 * Matches items against a query using `Intl.Collator` for robust string matching.
 * Solid port of upstream's `useCoreFilter`/`getFilter` re-export.
 */
export const createCoreFilter = getFilter;

export interface UseComboboxFilterOptions extends UseFilterOptions {
  /**
   * Whether the combobox is in multiple selection mode.
   * @default false
   */
  multiple?: Accessor<boolean | undefined> | undefined;
  /**
   * The current value of the combobox.
   */
  value?: Accessor<any> | undefined;
}

/**
 * Matches items against a query using `Intl.Collator` for robust string matching.
 *
 * Solid port of upstream's `useComboboxFilter` (exported publicly as `Combobox.useFilter`).
 * Deviation: takes/returns accessors (Solid has no re-render to recompute a memoized callback
 * with fresh closed-over values); the returned `Filter.contains` reads `multiple()`/`value()`
 * fresh on every call, matching upstream's `useCallback` deps.
 */
export function useComboboxFilter(options: UseComboboxFilterOptions = {}): Filter {
  const { multiple, value, ...collatorOptions } = options;

  const coreFilter = createMemo(() => getFilter(collatorOptions));

  const contains: Filter['contains'] = (item: any, query: string, itemToString?: (item: any) => string) => {
    if (multiple?.()) {
      return createCollatorItemFilter(coreFilter(), itemToString)(item, query);
    }
    return createSingleSelectionCollatorFilter(coreFilter(), itemToString, value?.())(item, query);
  };

  return {
    contains,
    startsWith: (item, query, itemToString) => coreFilter().startsWith(item, query, itemToString),
    endsWith: (item, query, itemToString) => coreFilter().endsWith(item, query, itemToString),
  };
}
