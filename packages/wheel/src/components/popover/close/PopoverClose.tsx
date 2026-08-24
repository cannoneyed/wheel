/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { usePopoverRootContext } from '../root/PopoverRootContext';
import { renderElement } from '../../internals/renderElement';
import { createButton } from '../../internals/use-button/createButton';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { createClosePartRegistration } from '../../utils/closePart';

/**
 * A button that closes the popover.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Popover](https://base-ui.com/react/components/popover)
 */
export function PopoverClose(componentProps: PopoverClose.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled: () => false,
    native: nativeButton,
  });

  const store = usePopoverRootContext();
  createClosePartRegistration();

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Popover-Close',
    slot: 'popover-close',
    ref: buttonRef,
    props: [
      () => ({
        onClick(event: MouseEvent) {
          store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
        },
      }),
      elementProps,
      getButtonProps,
    ],
  });
}

export interface PopoverCloseState {}

export interface PopoverCloseProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', PopoverCloseState> {}

export namespace PopoverClose {
  export type State = PopoverCloseState;
  export type Props = PopoverCloseProps;
}
