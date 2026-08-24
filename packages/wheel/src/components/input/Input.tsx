/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { FieldControl } from '../field/control/FieldControl';
import type {
  FieldControlProps,
  FieldControlState,
  FieldControlChangeEventReason,
  FieldControlChangeEventDetails,
} from '../field/control/FieldControl';

/**
 * A native input element that automatically works with [Field](https://base-ui.com/react/components/field).
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Input](https://base-ui.com/react/components/input)
 */
export function Input(props: Input.Props): JSX.Element {
  return <FieldControl {...props} defaultClass="wheel-Input" slot="input" />;
}

export interface InputProps extends FieldControlProps {}

export interface InputState extends FieldControlState {}

export type InputChangeEventReason = FieldControlChangeEventReason;
export type InputChangeEventDetails = FieldControlChangeEventDetails;

export namespace Input {
  export type Props = InputProps;
  export type State = InputState;
  export type ChangeEventReason = InputChangeEventReason;
  export type ChangeEventDetails = InputChangeEventDetails;
}
