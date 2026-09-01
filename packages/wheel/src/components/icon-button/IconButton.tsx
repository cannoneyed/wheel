/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
import { splitProps, type JSX } from 'solid-js';
import { renderButton, type ButtonProps, type ButtonState } from '../button/Button';

/**
 * Exposes one compact action through an icon and a required accessible label.
 *
 * Behavior contract: `packages/wheel/src/components/icon-button/icon-button.spec.md`.
 */
export function IconButton(componentProps: IconButton.Props): JSX.Element {
  const [local, buttonProps] = splitProps(componentProps, ['label', 'icon']);

  return renderButton(buttonProps as ButtonProps, {
    defaultClass: 'wheel-IconButton',
    slot: 'icon-button',
    iconOnly: true,
    icon: () => local.icon,
    label: () => local.label,
  });
}

export interface IconButtonProps
  extends Omit<ButtonProps, 'children' | 'icon' | 'endContent' | 'asChild'> {
  /** Accessible name for the icon-only action. */
  label: string;
  /** Icon rendered inside the square button. */
  icon: JSX.Element;
}

export type IconButtonState = ButtonState;

export namespace IconButton {
  export type State = IconButtonState;
  export type Props = IconButtonProps;
}
