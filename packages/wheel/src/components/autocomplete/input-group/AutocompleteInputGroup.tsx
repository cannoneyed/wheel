/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { ComboboxInputGroup } from '../../combobox/input-group/ComboboxInputGroup';
import type { FieldRoot } from '../../field/root/FieldRoot';
import type { BaseUIComponentProps } from '../../internals/types';
import type { Side } from '../../utils/useAnchorPositioning';

/**
 * A wrapper for the input and its associated controls.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 *
 * Solid port: identical component to `Combobox.InputGroup` — upstream aliases the very same
 * implementation under the `Autocomplete` namespace with its own prop/state type names.
 */
export const AutocompleteInputGroup = ComboboxInputGroup;

export interface AutocompleteInputGroupState extends FieldRoot.State {
  /**
   * Whether the corresponding popup is open.
   */
  open: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the component should ignore user edits.
   */
  readOnly: boolean;
  /**
   * Indicates which side the corresponding popup is positioned relative to its anchor.
   */
  popupSide: Side | null;
  /**
   * Present when the corresponding items list is empty.
   */
  listEmpty: boolean;
}

export interface AutocompleteInputGroupProps
  extends BaseUIComponentProps<'div', AutocompleteInputGroupState> {}

export namespace AutocompleteInputGroup {
  export type State = AutocompleteInputGroupState;
  export type Props = AutocompleteInputGroupProps;
}
