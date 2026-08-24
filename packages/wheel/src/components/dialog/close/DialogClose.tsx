/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDialogRootContext } from '../root/DialogRootContext';
import { renderElement } from '../../internals/renderElement';
import { createButton } from '../../internals/use-button/createButton';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';

/**
 * A button that closes the dialog.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Dialog](https://base-ui.com/react/components/dialog)
 */
export function DialogClose(componentProps: DialogClose.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const store = useDialogRootContext();
  const open = store.useState('open');

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const state: DialogClose.State = {
    get disabled() {
      return disabled();
    },
  };

  function handleClick(event: MouseEvent) {
    if (open()) {
      store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
    }
  }

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Dialog-Close',
    slot: 'dialog-close',
    state,
    ref: buttonRef,
    props: [{ onClick: handleClick }, elementProps, getButtonProps],
  });
}

export interface DialogCloseProps
  extends NativeButtonProps, BaseUIComponentProps<'button', DialogCloseState> {}

export interface DialogCloseState {
  /**
   * Whether the button is currently disabled.
   */
  disabled: boolean;
}

export namespace DialogClose {
  export type Props = DialogCloseProps;
  export type State = DialogCloseState;
}
