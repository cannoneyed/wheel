/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createCompositeListItem } from '../../internals/composite';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { createButton } from '../../internals/use-button/createButton';
import { mergeProps } from '../../merge-props/mergeProps';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { createMenuItemCommonProps } from '../item/createMenuItemCommonProps';

/**
 * A menu item that renders a native anchor element.
 * Renders an `<a>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 *
 * Deviation: since anchors have no native `disabled` concept, this part carries no `disabled`
 * prop/state/attribute at all (matching upstream).
 */
export function MenuLinkItem(componentProps: MenuLinkItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'label',
    'closeOnClick',
    'id',
  ]);

  const { store } = useMenuRootContext();
  const positionerContext = useMenuPositionerContext(true);

  const closeOnClick = () => local.closeOnClick ?? false;
  const id = createBaseUiId(() => local.id);

  const listItem = createCompositeListItem({ label: () => local.label });
  const highlighted = store.useState('isActive', listItem.index);
  const itemProps = store.useState('itemProps');

  const { getButtonProps, buttonRef } = createButton({ native: () => false, composite: () => true });

  const commonProps = createMenuItemCommonProps({
    closeOnClick,
    highlighted,
    id,
    nodeId: positionerContext?.context.nodeId,
    store,
  });

  function getItemProps(externalProps: Record<string, any>) {
    return mergeProps(commonProps, externalProps, getButtonProps);
  }

  const state: MenuLinkItem.State = {
    get highlighted() {
      return highlighted();
    },
  };

  return renderElement('a', componentProps, {
    defaultClass: 'wheel-Menu-LinkItem',
    slot: 'menu-link-item',
    state,
    ref: [buttonRef, listItem.ref],
    props: [itemProps, elementProps, getItemProps],
  });
}

export interface MenuLinkItemState {
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
}

export interface MenuLinkItemProps extends BaseUIComponentProps<'a', MenuLinkItemState> {
  /**
   * Overrides the text label used for typeahead matching.
   */
  label?: string | undefined;
  /**
   * Whether to close the menu when the item is clicked.
   * @default false
   */
  closeOnClick?: boolean | undefined;
}

export namespace MenuLinkItem {
  export type State = MenuLinkItemState;
  export type Props = MenuLinkItemProps;
}
