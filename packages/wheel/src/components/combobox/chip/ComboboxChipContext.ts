/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ComboboxChipContext {
  index: Accessor<number>;
}

export const ComboboxChipContext = createContext<ComboboxChipContext | undefined>(undefined);

export function useComboboxChipContext(): ComboboxChipContext {
  const context = useContext(ComboboxChipContext);
  if (!context) {
    throw new Error(
      'Base UI: ComboboxChipContext is missing. ComboboxChip parts must be placed within <Combobox.Chip>.',
    );
  }
  return context;
}
