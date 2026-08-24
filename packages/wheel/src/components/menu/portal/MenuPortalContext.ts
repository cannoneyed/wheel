/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const MenuPortalContext = createContext<boolean | undefined>(undefined);

export function useMenuPortalContext(): boolean {
  return useContext(MenuPortalContext) ?? false;
}
