/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { FloatingRootStore } from '../../floating-ui-solid';
import { ComboboxStore } from '../store';

export interface ComboboxDerivedItemsContextValue {
  query: Accessor<string>;
  hasItems: Accessor<boolean>;
  filteredItems: Accessor<any[]>;
  flatFilteredItems: Accessor<any[]>;
}

export const ComboboxRootContext = createContext<ComboboxStore | undefined>(undefined);
export const ComboboxFloatingContext = createContext<FloatingRootStore | undefined>(undefined);
export const ComboboxDerivedItemsContext = createContext<
  ComboboxDerivedItemsContextValue | undefined
>(undefined);
export const ComboboxHasItemsContext = createContext<Accessor<boolean>>(() => false);

export function useComboboxRootContext(): ComboboxStore {
  const context = useContext(ComboboxRootContext);
  if (!context) {
    throw new Error(
      'Base UI: ComboboxRootContext is missing. Combobox parts must be placed within <Combobox.Root>.',
    );
  }
  return context;
}

export function useComboboxFloatingContext(): FloatingRootStore {
  const context = useContext(ComboboxFloatingContext);
  if (!context) {
    throw new Error(
      'Base UI: ComboboxFloatingContext is missing. Combobox parts must be placed within <Combobox.Root>.',
    );
  }
  return context;
}

export function useComboboxDerivedItemsContext(): ComboboxDerivedItemsContextValue {
  const context = useContext(ComboboxDerivedItemsContext);
  if (!context) {
    throw new Error(
      'Base UI: ComboboxItemsContext is missing. Combobox parts must be placed within <Combobox.Root>.',
    );
  }
  return context;
}

export function useComboboxHasItemsContext(): Accessor<boolean> {
  return useContext(ComboboxHasItemsContext);
}
