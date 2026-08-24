/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { ComboboxTrigger } from '../../combobox/trigger/ComboboxTrigger';
import type { FieldRoot } from '../../field/root/FieldRoot';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import type { Side } from '../../utils/useAnchorPositioning';

/**
 * A button that opens the popup.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 *
 * Solid port: identical component to `Combobox.Trigger` — upstream aliases the very same
 * implementation under the `Autocomplete` namespace with its own prop/state type names.
 */
export const AutocompleteTrigger = ComboboxTrigger;

export interface AutocompleteTriggerState extends FieldRoot.State {
  /**
   * Whether the popup is open.
   */
  open: boolean;
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Indicates which side the corresponding popup is positioned relative to its anchor.
   */
  popupSide: Side | null;
  /**
   * Present when the corresponding items list is empty.
   */
  listEmpty: boolean;
}

export interface AutocompleteTriggerProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', AutocompleteTriggerState> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
}

export namespace AutocompleteTrigger {
  export type State = AutocompleteTriggerState;
  export type Props = AutocompleteTriggerProps;
}
