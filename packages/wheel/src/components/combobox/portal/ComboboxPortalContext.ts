/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

/**
 * Whether the combobox is rendering within a `<Combobox.Portal>`.
 * Solid port of upstream's `ComboboxPortalContext`.
 */
export const ComboboxPortalContext = createContext<boolean | undefined>(undefined);

export function useComboboxPortalContext(): boolean {
  const context = useContext(ComboboxPortalContext);
  if (context === undefined) {
    throw new Error('Base UI: <Combobox.Portal> is missing.');
  }
  return context;
}
