/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createCompositeListItem } from '../../internals/composite';
import { createBaseUiId } from '../../internals/createBaseUiId';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import { createChangeEventDetails, type BaseUIChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useMenuRootContext } from '../root/MenuRootContext';
import { useMenuPositionerContext } from '../positioner/MenuPositionerContext';
import { createMenuItem, REGULAR_ITEM } from '../item/createMenuItem';
import { itemMapping } from '../utils/stateAttributesMapping';
import { useMenuRadioGroupContext } from '../radio-group/MenuRadioGroupContext';
import { MenuRadioItemContext } from './MenuRadioItemContext';

/**
 * A menu item that can be selected within a radio group.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuRadioItem(componentProps: MenuRadioItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'value',
    'disabled',
    'label',
    'closeOnClick',
    'id',
    'nativeButton',
  ]);

  const { store } = useMenuRootContext();
  const positionerContext = useMenuPositionerContext(true);
  const radioGroup = useMenuRadioGroupContext();

  const disabled = () => radioGroup.disabled || (local.disabled ?? false);
  const closeOnClick = () => local.closeOnClick ?? false;
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

  const checked = () => radioGroup.value === local.value;

  function handleClick(event: MouseEvent) {
    const details = createChangeEventDetails(REASONS.itemPress, event) as BaseUIChangeEventDetails<
      typeof REASONS.itemPress
    > & { preventUnmountOnClose(): void };
    details.preventUnmountOnClose = () => {};
    radioGroup.setValue(local.value, details);
  }

  const state: MenuRadioItem.State = {
    get disabled() {
      return disabled();
    },
    get highlighted() {
      return highlighted();
    },
    get checked() {
      return checked();
    },
  };

  return (
    <MenuRadioItemContext.Provider value={state}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Menu-RadioItem',
        slot: 'menu-radio-item',
        state,
        ref: [itemRef, listItem.ref],
        stateAttributesMapping: itemMapping,
        props: [
          itemProps,
          () => ({
            role: 'menuitemradio' as const,
            'aria-checked': checked(),
            onClick: handleClick,
          }),
          elementProps,
          getItemProps,
        ],
      })}
    </MenuRadioItemContext.Provider>
  );
}

export interface MenuRadioItemState {
  /**
   * Whether the item is disabled.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
  /**
   * Whether the item is currently selected.
   */
  checked: boolean;
}

export interface MenuRadioItemProps
  extends NonNativeButtonProps,
    BaseUIComponentProps<'div', MenuRadioItemState> {
  /**
   * The unique value of the radio item.
   */
  value: any;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
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

export namespace MenuRadioItem {
  export type State = MenuRadioItemState;
  export type Props = MenuRadioItemProps;
}
