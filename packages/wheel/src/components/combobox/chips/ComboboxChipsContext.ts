/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ComboboxChipsContext {
  highlightedChipIndex: Accessor<number | undefined>;
  setHighlightedChipIndex: (index: number | undefined) => void;
  chipsRef: { current: Array<HTMLButtonElement | null> };
}

export const ComboboxChipsContext = createContext<ComboboxChipsContext | undefined>(undefined);

export function useComboboxChipsContext(): ComboboxChipsContext | undefined {
  return useContext(ComboboxChipsContext);
}
