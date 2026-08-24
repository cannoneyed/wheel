/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface MenuRadioItemContext {
  checked: boolean;
  highlighted: boolean;
  disabled: boolean;
}

export const MenuRadioItemContext = createContext<MenuRadioItemContext | undefined>(undefined);

export function useMenuRadioItemContext(): MenuRadioItemContext {
  const context = useContext(MenuRadioItemContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: MenuRadioItemContext is missing. MenuRadioItemIndicator parts must be placed within <Menu.RadioItem>.',
    );
  }
  return context;
}
