/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

/**
 * Whether the select is rendering within a `<Select.Portal>`.
 * Solid port of upstream's `SelectPortalContext`.
 */
export const SelectPortalContext = createContext<boolean | undefined>(undefined);

export function useSelectPortalContext(): boolean | undefined {
  return useContext(SelectPortalContext);
}
