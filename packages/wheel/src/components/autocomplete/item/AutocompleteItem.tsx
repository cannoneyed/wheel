/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { ComboboxItem } from '../../combobox/item/ComboboxItem';
import type { BaseUIComponentProps, NonNativeButtonProps } from '../../internals/types';
import type { JSX } from 'solid-js';

/**
 * An individual item in the list.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 *
 * Solid port: identical component to `Combobox.Item` — upstream aliases the very same
 * implementation under the `Autocomplete` namespace with its own prop/state type names. Since the
 * combobox is always in `selectionMode: 'none'` under `Autocomplete.Root`, `ComboboxItem` never
 * marks the item `data-selected` (its `selectable`/`aria-selected` computation already gates on
 * `selectionMode() !== 'none'`).
 */
export const AutocompleteItem = ComboboxItem;

export interface AutocompleteItemState {
  /**
   * Whether the item should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the item is highlighted.
   */
  highlighted: boolean;
}

export interface AutocompleteItemProps
  extends NonNativeButtonProps,
    Omit<BaseUIComponentProps<'div', AutocompleteItemState>, 'id'> {
  children?: JSX.Element;
  /**
   * An optional click handler for the item when selected.
   * It fires when clicking the item with the pointer, as well as when pressing `Enter` with the keyboard if the item is highlighted when the `Input` or `List` element has focus.
   */
  onClick?: BaseUIComponentProps<'div', AutocompleteItemState>['onClick'] | undefined;
  /**
   * The index of the item in the list. Improves performance when specified by avoiding the need to calculate the index automatically from the DOM.
   */
  index?: number | undefined;
  /**
   * A unique value that identifies this item.
   * @default null
   */
  value?: any;
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace AutocompleteItem {
  export type State = AutocompleteItemState;
  export type Props = AutocompleteItemProps;
}
