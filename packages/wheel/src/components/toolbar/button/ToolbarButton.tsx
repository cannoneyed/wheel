/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import { EMPTY_OBJECT } from '../../base-utils/empty';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../../internals/types';
import { createButton } from '../../internals/use-button/createButton';
import type { ToolbarRootState } from '../root/ToolbarRoot';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import { useToolbarGroupContext } from '../group/ToolbarGroupContext';
import { CompositeItem } from '../../internals/composite/item/CompositeItem';

/**
 * A button that can be used as-is or as a trigger for other components.
 * Renders a `<button>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarButton(componentProps: ToolbarButton.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'focusableWhenDisabled',
    'nativeButton',
  ]);

  const disabledProp = () => componentProps.disabled ?? false;
  const focusableWhenDisabled = () => componentProps.focusableWhenDisabled ?? true;
  const nativeButton = () => componentProps.nativeButton ?? true;

  const { disabled: toolbarDisabled, orientation } = useToolbarRootContext();
  const groupContext = useToolbarGroupContext(true);

  const disabled = () =>
    toolbarDisabled() || (groupContext?.disabled() ?? false) || disabledProp();

  const itemMetadata: ToolbarButton.Metadata = {
    get disabled() {
      return disabled();
    },
    get focusableWhenDisabled() {
      return focusableWhenDisabled();
    },
  };

  const { getButtonProps, buttonRef } = createButton({
    disabled,
    focusableWhenDisabled,
    native: nativeButton,
  });

  const state: ToolbarButton.State = {
    get disabled() {
      return disabled();
    },
    get orientation() {
      return orientation();
    },
    get focusable() {
      return focusableWhenDisabled();
    },
  };

  return (
    <CompositeItem
      defaultClass="wheel-Toolbar-Button"
      slot="toolbar-button"
      tag="button"
      as={componentProps.as}
      asChild={componentProps.asChild}
      class={componentProps.class}
      style={componentProps.style}
      metadata={itemMetadata}
      state={state}
      refs={[buttonRef]}
      props={[
        elementProps as HTMLProps,
        // When a custom render target is provided (typically another Base UI
        // component like Menu.Trigger via `as`/`asChild`), forward `disabled`
        // so the rendered component can derive its own disabled state. For the
        // default toolbar button, avoid forwarding a `disabled` prop so
        // focusable disabled buttons remain hoverable for interactions like
        // tooltips.
        // TODO: follow up after https://github.com/mui/base-ui/issues/1976#issuecomment-2916905663
        () =>
          componentProps.as !== undefined || componentProps.asChild
            ? { disabled: disabled() }
            : (EMPTY_OBJECT as HTMLProps),
        getButtonProps,
      ]}
    >
      {componentProps.children}
    </CompositeItem>
  );
}

export interface ToolbarButtonMetadata {
  disabled: boolean;
  focusableWhenDisabled: boolean;
}

export interface ToolbarButtonState extends ToolbarRootState {
  /**
   * Whether the component is disabled.
   */
  disabled: boolean;
  /**
   * Whether the component remains focusable when disabled.
   */
  focusable: boolean;
}

export interface ToolbarButtonProps
  extends NativeButtonProps,
    BaseUIComponentProps<'button', ToolbarButtonState> {
  /**
   * When `true` the item is disabled.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * When `true` the item remains focusable when disabled.
   * @default true
   */
  focusableWhenDisabled?: boolean | undefined;
}

export namespace ToolbarButton {
  export type Metadata = ToolbarButtonMetadata;
  export type State = ToolbarButtonState;
  export type Props = ToolbarButtonProps;
}
