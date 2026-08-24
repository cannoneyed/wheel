/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { renderElement } from '../internals/renderElement';
import { createButton } from '../internals/use-button/createButton';
import type { BaseUIComponentProps, NativeButtonProps } from '../internals/types';

/**
 * A button component that can be used to trigger actions.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Button](https://base-ui.com/react/components/button)
 */
export function Button(componentProps: Button.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'focusableWhenDisabled',
    'nativeButton',
  ]);

  const disabled = () => local.disabled ?? false;
  const focusableWhenDisabled = () => local.focusableWhenDisabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled,
    native: nativeButton,
  });

  const state: Button.State = {
    get disabled() {
      return disabled();
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Button',
    slot: 'button',
    state,
    ref: buttonRef,
    props: [elementProps, getButtonProps],
  });
}

export interface ButtonState {
  /**
   * Whether the button should ignore user interaction.
   */
  disabled: boolean;
}

export interface ButtonProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ButtonState> {
  /**
   * Whether the button should be focusable when disabled.
   * @default false
   */
  focusableWhenDisabled?: boolean | undefined;
}

export namespace Button {
  export type State = ButtonState;
  export type Props = ButtonProps;
}
