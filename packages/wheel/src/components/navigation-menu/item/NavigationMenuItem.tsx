/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { NavigationMenuItemContext, type NavigationMenuItemContextValue } from './NavigationMenuItemContext';
import { createBaseUiId } from '../../internals/createBaseUiId';

/**
 * An individual navigation menu item.
 * Renders a `<li>` element.
 *
 * Documentation: [Base UI Navigation Menu](https://base-ui.com/react/components/navigation-menu)
 */
export function NavigationMenuItem(componentProps: NavigationMenuItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'ref',
    'value',
  ]);

  const fallbackValue = createBaseUiId();
  const value = () => local.value ?? fallbackValue();

  const contextValue: NavigationMenuItemContextValue = {
    get value() {
      return value();
    },
  };

  return (
    <NavigationMenuItemContext.Provider value={contextValue}>
      {renderElement('li', componentProps, {
        defaultClass: 'wheel-NavigationMenu-Item',
        slot: 'navigation-menu-item',
        props: elementProps,
      })}
    </NavigationMenuItemContext.Provider>
  );
}

export interface NavigationMenuItemState {}

export interface NavigationMenuItemProps
  extends BaseUIComponentProps<'li', NavigationMenuItemState> {
  /**
   * A unique value that identifies this navigation menu item.
   * If no value is provided, a unique ID will be generated automatically.
   * Use when controlling the navigation menu programmatically.
   */
  value?: any;
}

export namespace NavigationMenuItem {
  export type State = NavigationMenuItemState;
  export type Props = NavigationMenuItemProps;
}
