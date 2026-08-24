/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export type MenuPositionerContext = Pick<
  UseAnchorPositioningReturnValue,
  'side' | 'align' | 'setArrowElement' | 'arrowUncentered' | 'arrowStyles' | 'context'
>;

export const MenuPositionerContext = createContext<MenuPositionerContext | undefined>(undefined);

export function useMenuPositionerContext(optional?: false): MenuPositionerContext;
export function useMenuPositionerContext(optional: true): MenuPositionerContext | undefined;
export function useMenuPositionerContext(optional?: boolean) {
  const context = useContext(MenuPositionerContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI: MenuPositionerContext is missing. MenuPositioner parts must be placed within <Menu.Positioner>.',
    );
  }
  return context;
}
