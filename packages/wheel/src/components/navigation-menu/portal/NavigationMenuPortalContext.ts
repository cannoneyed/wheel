/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const NavigationMenuPortalContext = createContext<boolean | undefined>(undefined);

export function useNavigationMenuPortalContext() {
  const value = useContext(NavigationMenuPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <NavigationMenu.Portal> is missing.');
  }
  return value;
}
