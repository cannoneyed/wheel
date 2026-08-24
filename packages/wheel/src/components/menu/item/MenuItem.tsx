/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createCompositeListItem } from '../../internals/composite';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { createMenuItem, REGULAR_ITEM } from './createMenuItem';

/**
 * An individual interactive item within the menu.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuItem(componentProps: MenuItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'label',
    'closeOnClick',
    'id',
    'nativeButton',
  ]);

  const { store } = useMenuRootContext();
  const positionerContext = useMenuPositionerContext(true);

  const disabled = () => local.disabled ?? false;
  const closeOnClick = () => local.closeOnClick ?? true;
  const nativeButton = () => local.nativeButton ?? false;
  const id = createBaseUiId(() => local.id);

  const listItem = createCompositeListItem({ label: () => local.label });
  const highlighted = store.useState('isActive', listItem.index);
  const itemProps = store.useState('itemProps');

  const { getItemProps, itemRef } = createMenuItem({
    closeOnClick,
    disabled,
    highlighted,
    id,
    nativeButton,
    itemMetadata: REGULAR_ITEM,
    nodeId: positionerContext?.context.nodeId,
    store,
  });

  const state: MenuItem.State = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
  };

  return renderElement('div', componentProps, {
    defaultClass: 'wheel-Menu-Item',
    slot: 'menu-item',
    state,
    ref: [itemRef, listItem.ref],
    props: [itemProps, elementProps, getItemProps],
  });
}

export interface MenuItemState {
  /**
   * Whether the item is disabled.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
}

export interface MenuItemProps
  extends NonNativeButtonProps,
    BaseUIComponentProps<'div', MenuItemState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Overrides the text label used for typeahead matching. Falls back to the item's `textContent`.
   */
  label?: string | undefined;
  /**
   * Whether to close the menu when the item is clicked.
   * @default true
   */
  closeOnClick?: boolean | undefined;
}

export namespace MenuItem {
  export type State = MenuItemState;
  export type Props = MenuItemProps;
}
