/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { createControllableSignal } from '../../base-utils/createControllableSignal';
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
import { MenuCheckboxItemContext } from './MenuCheckboxItemContext';

/**
 * A menu item that toggles a setting on or off.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Menu](https://base-ui.com/react/components/menu)
 */
export function MenuCheckboxItem(componentProps: MenuCheckboxItem.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'checked',
    'defaultChecked',
    'onCheckedChange',
    'disabled',
    'label',
    'closeOnClick',
    'id',
    'nativeButton',
  ]);

  const { store } = useMenuRootContext();
  const positionerContext = useMenuPositionerContext(true);

  const disabled = () => local.disabled ?? false;
  const closeOnClick = () => local.closeOnClick ?? false;
  const nativeButton = () => local.nativeButton ?? false;
  const id = createBaseUiId(() => local.id);

  const [checked, setChecked] = createControllableSignal<boolean>({
    controlled: () => local.checked,
    default: local.defaultChecked ?? false,
    name: 'MenuCheckboxItem',
    state: 'checked',
  });

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

  function handleClick(event: MouseEvent) {
    const details = createChangeEventDetails(
      REASONS.itemPress,
      event,
      undefined,
    ) as BaseUIChangeEventDetails<typeof REASONS.itemPress> & { preventUnmountOnClose(): void };
    details.preventUnmountOnClose = () => {};

    local.onCheckedChange?.(!checked(), details);
    if (details.isCanceled) {
      return;
    }
    setChecked((current) => !current);
  }

  const state: MenuCheckboxItem.State = {
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
    <MenuCheckboxItemContext.Provider value={state}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Menu-CheckboxItem',
        slot: 'menu-checkbox-item',
        state,
        ref: [itemRef, listItem.ref],
        stateAttributesMapping: itemMapping,
        props: [
          itemProps,
          () => ({
            role: 'menuitemcheckbox' as const,
            'aria-checked': checked(),
            onClick: handleClick,
          }),
          elementProps,
          getItemProps,
        ],
      })}
    </MenuCheckboxItemContext.Provider>
  );
}

export interface MenuCheckboxItemState {
  /**
   * Whether the item is disabled.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
  /**
   * Whether the item is currently ticked.
   */
  checked: boolean;
}

export type MenuCheckboxItemChangeEventDetails = BaseUIChangeEventDetails<
  typeof REASONS.itemPress
> & {
  preventUnmountOnClose(): void;
};

export interface MenuCheckboxItemProps
  extends NonNativeButtonProps,
    BaseUIComponentProps<'div', MenuCheckboxItemState> {
  /**
   * Whether the checkbox item is currently ticked.
   */
  checked?: boolean | undefined;
  /**
   * Whether the checkbox item is initially ticked.
   * @default false
   */
  defaultChecked?: boolean | undefined;
  /**
   * Event handler called when the checkbox item is ticked or unticked.
   */
  onCheckedChange?:
    | ((checked: boolean, eventDetails: MenuCheckboxItem.ChangeEventDetails) => void)
    | undefined;
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

export namespace MenuCheckboxItem {
  export type State = MenuCheckboxItemState;
  export type Props = MenuCheckboxItemProps;
  export type ChangeEventDetails = MenuCheckboxItemChangeEventDetails;
}
