/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { useNavigationMenuRootContext } from '../root/NavigationMenuRootContext';
import { triggerOpenStateMapping } from '../../utils/popupStateMapping';
import { useNavigationMenuItemContext } from '../item/NavigationMenuItemContext';

/**
 * An icon that indicates that the trigger button opens a menu.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuIcon(componentProps: NavigationMenuIcon.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
  ]);

  const itemContext = useNavigationMenuItemContext();
  const { open, value } = useNavigationMenuRootContext();

  const isActiveItem = () => open() && value() === itemContext.value;

  const state: NavigationMenuIconState = {
    get open() {
      return isActiveItem();
    },
  };

  return renderElement('span', componentProps, {
    defaultClass: 'wheel-NavigationMenu-Icon',
    slot: 'navigation-menu-icon',
    state,
    props: [{ 'aria-hidden': true }, elementProps],
    stateAttributesMapping: triggerOpenStateMapping,
    children: () => (componentProps.children !== undefined ? (componentProps.children as JSX.Element) : '▼'),
  });
}

export interface NavigationMenuIconState {
  /**
   * Whether the navigation menu is open and the item is active.
   */
  open: boolean;
}

export interface NavigationMenuIconProps
  extends BaseUIComponentProps<'span', NavigationMenuIconState> {}

export namespace NavigationMenuIcon {
  export type State = NavigationMenuIconState;
  export type Props = NavigationMenuIconProps;
}
