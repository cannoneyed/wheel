/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const DrawerPortalContext = createContext<boolean | undefined>(undefined);

export function useDrawerPortalContext(): boolean {
  const value = useContext(DrawerPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <Drawer.Portal> is missing.');
  }
  return value;
}
