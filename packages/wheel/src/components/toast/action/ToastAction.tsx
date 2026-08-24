/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { useToastRootContext } from '../root/ToastRootContext';
import { createButton } from '../../internals/use-button/createButton';
import { renderElement } from '../../internals/renderElement';

/**
 * Performs an action when clicked.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Toast](https://base-ui.com/react/components/toast)
 */
export function ToastAction(componentProps: ToastAction.Props): JSX.Element {
  const [local, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const context = useToastRootContext();

  const disabled = () => local.disabled ?? false;
  const nativeButton = () => local.nativeButton ?? true;

  const computedChildren = () => context.toast.actionProps?.children ?? local.children;
  const shouldRender = () => Boolean(computedChildren());

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    native: nativeButton,
  });

  const state: ToastActionState = {
    get type() {
      return context.toast.type;
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: 'wheel-Toast-Action',
    slot: 'toast-action',
    ref: buttonRef,
    state,
    props: [elementProps, () => context.toast.actionProps ?? {}, getButtonProps],
    // `renderElement` strips a `children` key from the `props` array (it's not a DOM attribute);
    // the rendered content must come through this dedicated accessor instead.
    children: computedChildren,
    enabled: () => shouldRender(),
  });
}

export interface ToastActionState {
  /**
   * The type of the toast.
   */
  type: string | undefined;
}

export interface ToastActionProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ToastActionState> {}

export namespace ToastAction {
  export type State = ToastActionState;
  export type Props = ToastActionProps;
}
