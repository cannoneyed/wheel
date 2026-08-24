/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-use-signal -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { createSignal, splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { useToastProviderContext } from '../provider/ToastProviderContext';
import { createButton } from '../../internals/use-button/createButton';
import { renderElement } from '../../internals/renderElement';

/**
 * Closes the toast when clicked.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastClose(componentProps: ToastClose.Props): JSX.Element {
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

  const store = useToastProviderContext();
  const context = useToastRootContext();
  const expanded = store.useState('expanded');

  const [hasFocus, setHasFocus] = createSignal(false);

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const state: ToastCloseState = {
    get type() {
      return context.toast.type;
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Toast-Close',
    slot: 'toast-close',
    ref: buttonRef,
    state,
    props: [
      () => ({
        'aria-hidden': !expanded() && !hasFocus(),
        onClick() {
          store.closeToast(context.toast.id);
        },
        onFocus() {
          setHasFocus(true);
        },
        onBlur() {
          setHasFocus(false);
        },
      }),
      elementProps,
      getButtonProps,
    ],
  });
}

export interface ToastCloseState {
  /**
   * The type of the toast.
   */
  type: string | undefined;
}

export interface ToastCloseProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ToastCloseState> {}

export namespace ToastClose {
  export type State = ToastCloseState;
  export type Props = ToastCloseProps;
}
