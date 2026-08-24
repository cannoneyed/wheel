/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { useDrawerRootContext } from '../root/DrawerRootContext';
import { renderElement } from '../../internals/renderElement';
import { createButton } from '../../internals/use-button/createButton';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';

/**
 * A button that closes the drawer.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Drawer](https://base-ui.com/react/components/drawer)
 *
 * Deviation: upstream re-exports `Dialog.Close` directly. This Solid port's Drawer owns a separate
 * `DrawerStore` (see `DrawerStore`'s doc comment), so this is its own component — structurally
 * identical to `DialogClose` otherwise.
 */
export function DrawerClose(componentProps: DrawerClose.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const store = useDrawerRootContext();
  const open = store.useState('open');

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const state: DrawerClose.State = {
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
    defaultClass: 'wheel-Drawer-Close',
    slot: 'drawer-close',
    state,
    ref: buttonRef,
    props: [{ onClick: handleClick }, elementProps, getButtonProps],
  });
}

export interface DrawerCloseProps
  extends NativeButtonProps, BaseUIComponentProps<'button', DrawerCloseState> {}

export interface DrawerCloseState {
  /**
   * Whether the button is currently disabled.
   */
  disabled: boolean;
}

export namespace DrawerClose {
  export type Props = DrawerCloseProps;
  export type State = DrawerCloseState;
}
