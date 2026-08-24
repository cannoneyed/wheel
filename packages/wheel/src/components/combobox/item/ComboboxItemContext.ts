/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ComboboxItemContext {
  selected: Accessor<boolean>;
  textRef: { current: HTMLElement | null };
}

export const ComboboxItemContext = createContext<ComboboxItemContext | undefined>(undefined);

export function useComboboxItemContext(): ComboboxItemContext {
  const context = useContext(ComboboxItemContext);
  if (!context) {
    throw new Error(
      'Base UI: ComboboxItemContext is missing. ComboboxItem parts must be placed within <Combobox.Item>.',
    );
  }
  return context;
}
