/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { MenuStore } from '../store/MenuStore';

export interface MenuSubmenuRootContext {
  parentMenu: MenuStore<unknown>;
}

export const MenuSubmenuRootContext = createContext<MenuSubmenuRootContext | undefined>(undefined);

export function useMenuSubmenuRootContext(): MenuSubmenuRootContext | undefined {
  return useContext(MenuSubmenuRootContext);
}
