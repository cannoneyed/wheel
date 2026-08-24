/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export type MenuGroupContext = (id: string | undefined) => void;

export const MenuGroupContext = createContext<MenuGroupContext | undefined>(undefined);

export function useMenuGroupRootContext(): MenuGroupContext {
  const context = useContext(MenuGroupContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: Menu group parts must be used within `<Menu.Group>` or `<Menu.RadioGroup>`.',
    );
  }
  return context;
}
