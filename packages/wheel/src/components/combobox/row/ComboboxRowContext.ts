/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const ComboboxRowContext = createContext(false);

export function useComboboxRowContext(): boolean {
  return useContext(ComboboxRowContext);
}
