/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { MenuRoot, type MenuRootProps } from '../root/MenuRoot';
import { useMenuRootContext } from '../root/MenuRootContext';
import { MenuSubmenuRootContext } from './MenuSubmenuRootContext';

/**
 * Groups all parts of a submenu, which is nested inside another menu or submenu.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuSubmenuRoot(props: MenuSubmenuRoot.Props): JSX.Element {
  const parentMenu = useMenuRootContext().store;

  return (
    <MenuSubmenuRootContext.Provider value={{ parentMenu }}>
      <MenuRoot {...props} />
    </MenuSubmenuRootContext.Provider>
  );
}

export interface MenuSubmenuRootState {}

export interface MenuSubmenuRootProps
  extends Omit<MenuRootProps, 'modal' | 'triggerId' | 'defaultTriggerId'> {}

export namespace MenuSubmenuRoot {
  export type State = MenuSubmenuRootState;
  export type Props = MenuSubmenuRootProps;
}
