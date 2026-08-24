/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface NavigationMenuItemContextValue {
  value: any;
}

export const NavigationMenuItemContext = createContext<
  NavigationMenuItemContextValue | undefined
>(undefined);

export function useNavigationMenuItemContext() {
  const value = useContext(NavigationMenuItemContext);
  if (!value) {
    throw new Error(
      'Base UI: NavigationMenuItem parts must be used within a <NavigationMenu.Item>.',
    );
  }
  return value;
}
