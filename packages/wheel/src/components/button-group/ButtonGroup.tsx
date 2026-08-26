/* eslint-disable wheel/require-export-jsdoc -- Public guidance lives on the component and its stateful props; repeated alias comments hide that contract. */
import { splitProps, type JSX } from 'solid-js';
import type { ButtonSize, ButtonVariant } from '../button/Button';
import { CompositeRoot } from '../internals/composite/root/CompositeRoot';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types';
import { ButtonGroupContext, type ButtonGroupContext as ContextValue } from './ButtonGroupContext';

/**
 * Joins related action buttons into one connected, roving-focus control.
 *
 * Behavior contract: `packages/wheel/src/components/button-group/button-group.spec.md`.
 */
export function ButtonGroup(componentProps: ButtonGroup.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'orientation',
    'size',
    'variant',
    'loopFocus',
  ]);

  const disabled = () => componentProps.disabled ?? false;
  const orientation = (): Orientation => componentProps.orientation ?? 'horizontal';
  const size = (): ButtonSize => componentProps.size ?? 'md';
  const variant = (): ButtonVariant => componentProps.variant ?? 'secondary';

  const state: ButtonGroup.State = {
    get disabled() {
      return disabled();
    },
    get orientation() {
      return orientation();
    },
    get size() {
      return size();
    },
    get variant() {
      return variant();
    },
  };

  const contextValue: ContextValue = { disabled, orientation, size, variant };

  return (
    <ButtonGroupContext.Provider value={contextValue}>
      <CompositeRoot
        tag="div"
        as={componentProps.as}
        asChild={componentProps.asChild}
        class={componentProps.class}
        style={componentProps.style}
        state={state}
        refs={componentProps.ref ? [componentProps.ref] : undefined}
        props={[{ role: 'group' }, elementProps as HTMLProps]}
        defaultClass="wheel-ButtonGroup"
        slot="button-group"
        loopFocus={componentProps.loopFocus ?? true}
        enableHomeAndEndKeys
        orientation={orientation()}
      >
        {componentProps.children}
      </CompositeRoot>
    </ButtonGroupContext.Provider>
  );
}

export interface ButtonGroupState {
  /** Whether every member ignores user interaction. */
  disabled: boolean;
  /** The direction used for layout and arrow-key movement. */
  orientation: Orientation;
  /** The size inherited by members. */
  size: ButtonSize;
  /** The variant inherited by members. */
  variant: ButtonVariant;
}

export interface ButtonGroupProps extends BaseUIComponentProps<'div', ButtonGroupState> {
  /** Whether every member ignores user interaction. @default false */
  disabled?: boolean | undefined;
  /** Layout and arrow-key direction. @default 'horizontal' */
  orientation?: Orientation | undefined;
  /** Default member size. @default 'md' */
  size?: ButtonSize | undefined;
  /** Default member variant. @default 'secondary' */
  variant?: ButtonVariant | undefined;
  /** Whether arrow focus wraps at either end. @default true */
  loopFocus?: boolean | undefined;
}

export namespace ButtonGroup {
  export type State = ButtonGroupState;
  export type Props = ButtonGroupProps;
}
