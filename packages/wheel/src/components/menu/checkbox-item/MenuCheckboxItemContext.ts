/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface MenuCheckboxItemContext {
  checked: boolean;
  highlighted: boolean;
  disabled: boolean;
}

export const MenuCheckboxItemContext = createContext<MenuCheckboxItemContext | undefined>(
  undefined,
);

export function useMenuCheckboxItemContext(): MenuCheckboxItemContext {
  const context = useContext(MenuCheckboxItemContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: MenuCheckboxItemContext is missing. MenuCheckboxItemIndicator parts must be placed within <Menu.CheckboxItem>.',
    );
  }
  return context;
}
