/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ComboboxGroupContext {
  labelId: Accessor<string | undefined>;
  setLabelId: (id: string | undefined) => void;
  /**
   * Optional list of items that belong to this group. Used by nested collections to render
   * group-specific items.
   */
  items?: Accessor<readonly any[]> | undefined;
}

export const ComboboxGroupContext = createContext<ComboboxGroupContext | undefined>(undefined);

export function useComboboxGroupContext(): ComboboxGroupContext {
  const context = useContext(ComboboxGroupContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: ComboboxGroupContext is missing. ComboboxGroup parts must be placed within <Combobox.Group>.',
    );
  }
  return context;
}
