/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { MenuRoot } from '../root/MenuRoot';

export interface MenuRadioGroupContext {
  value: any;
  setValue: (newValue: any, eventDetails: MenuRoot.ChangeEventDetails) => void;
  disabled: boolean;
}

export const MenuRadioGroupContext = createContext<MenuRadioGroupContext | undefined>(undefined);

export function useMenuRadioGroupContext(): MenuRadioGroupContext {
  const context = useContext(MenuRadioGroupContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: MenuRadioGroupContext is missing. MenuRadioItem parts must be placed within <Menu.RadioGroup>.',
    );
  }
  return context;
}
