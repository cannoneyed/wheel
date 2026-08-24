/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, HTMLProps } from '../../internals/types';
import { createFocusableWhenDisabled } from '../../utils/createFocusableWhenDisabled';
import type { ToolbarRootState } from '../root/ToolbarRoot';
import { useToolbarRootContext } from '../root/ToolbarRootContext';
import { useToolbarGroupContext } from '../group/ToolbarGroupContext';
import { CompositeItem } from '../../internals/composite/item/CompositeItem';

/**
 * A native input element that integrates with Toolbar keyboard navigation.
 * Renders an `<input>` element.
 *
 * Documentation: [Base UI Toolbar](https://base-ui.com/react/components/toolbar)
 */
export function ToolbarInput(componentProps: ToolbarInput.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'focusableWhenDisabled',
  ]);

  const disabledProp = () => componentProps.disabled ?? false;
  const focusableWhenDisabled = () => componentProps.focusableWhenDisabled ?? true;

  const { disabled: toolbarDisabled, orientation } = useToolbarRootContext();
  const groupContext = useToolbarGroupContext(true);

  const disabled = () =>
    toolbarDisabled() || (groupContext?.disabled() ?? false) || disabledProp();

  const itemMetadata: ToolbarInput.Metadata = {
    get disabled() {
      return disabled();
    },
    get focusableWhenDisabled() {
      return focusableWhenDisabled();
    },
  };

  const { props: focusableWhenDisabledProps } = createFocusableWhenDisabled({
    composite: () => true,
    disabled,
    focusableWhenDisabled,
    isNativeButton: () => false,
  });

  const state: ToolbarInput.State = {
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

  const defaultProps = (): HTMLProps => ({
    onClick(event: MouseEvent) {
      if (disabled()) {
        event.preventDefault();
      }
    },
    onPointerDown(event: PointerEvent) {
      if (disabled()) {
        event.preventDefault();
      }
    },
  });

  return (
    <CompositeItem
      defaultClass="wheel-Toolbar-Input"
      slot="toolbar-input"
      tag="input"
      as={componentProps.as}
      asChild={componentProps.asChild}
      class={componentProps.class}
      style={componentProps.style}
      metadata={itemMetadata}
      state={state}
      props={[defaultProps, elementProps as HTMLProps, focusableWhenDisabledProps]}
    >
      {componentProps.children}
    </CompositeItem>
  );
}

export interface ToolbarInputMetadata {
  disabled: boolean;
  focusableWhenDisabled: boolean;
}

export interface ToolbarInputState extends ToolbarRootState {
  /**
   * Whether the component is disabled.
   */
  disabled: boolean;
  /**
   * Whether the component remains focusable when disabled.
   */
  focusable: boolean;
}

export interface ToolbarInputProps extends BaseUIComponentProps<'input', ToolbarInputState> {
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

export namespace ToolbarInput {
  export type Metadata = ToolbarInputMetadata;
  export type State = ToolbarInputState;
  export type Props = ToolbarInputProps;
}
