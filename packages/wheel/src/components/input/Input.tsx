/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { FieldControl } from '../field/control/FieldControl';
import type {
  FieldControlProps,
  FieldControlState,
  FieldControlChangeEventReason,
  FieldControlChangeEventDetails,
} from '../field/control/FieldControl';
import type { BaseUIComponentProps } from '../internals/types';

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'input' | 'ghost' | 'quiet';
export type InputStatus = 'success' | 'warning' | 'error';

/**
 * A native input element that automatically works with [Field](https://base-ui.com/react/components/field).
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Input](https://base-ui.com/react/components/input)
 */
export function Input(componentProps: Input.Props): JSX.Element {
  const [local, controlProps] = splitProps(componentProps, ['class', 'style', 'size', 'variant', 'status']);
  const size = (): InputSize => local.size ?? 'md';
  const variant = (): InputVariant => local.variant ?? 'input';
  const status = () => local.status;
  const withInputState = (state: FieldControlState): InputState => ({
    ...state,
    size: size(),
    variant: variant(),
    status: status(),
  });
  const inputClass = local.class;
  const inputStyle = local.style;

  return (
    <FieldControl
      {...controlProps}
      class={typeof inputClass === 'function' ? (state) => inputClass(withInputState(state)) : inputClass}
      style={typeof inputStyle === 'function' ? (state) => inputStyle(withInputState(state)) : inputStyle}
      data-size={size()}
      data-variant={variant()}
      data-status={status()}
      defaultClass="wheel-Input"
      slot="input"
    />
  );
}

export type InputProps = Omit<FieldControlProps, 'size' | 'class' | 'style'> &
  Pick<BaseUIComponentProps<'input', InputState>, 'class' | 'style'> & {
    /** Dense control size. @default 'md' */
    size?: InputSize | undefined;
    /** Resting field surface. @default 'input' */
    variant?: InputVariant | undefined;
    /** Visual validation tone. Native validity remains field-owned. */
    status?: InputStatus | undefined;
  };

export interface InputState extends FieldControlState {
  size: InputSize;
  variant: InputVariant;
  status: InputStatus | undefined;
}

export type InputChangeEventReason = FieldControlChangeEventReason;
export type InputChangeEventDetails = FieldControlChangeEventDetails;

export namespace Input {
  export type Props = InputProps;
  export type State = InputState;
  export type ChangeEventReason = InputChangeEventReason;
  export type ChangeEventDetails = InputChangeEventDetails;
}
