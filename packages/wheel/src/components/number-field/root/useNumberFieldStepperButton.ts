import { splitProps, type JSX } from 'solid-js';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types';
import { renderElement } from '../../internals/renderElement';
import { createButton } from '../../internals/use-button/createButton';
import { useNumberFieldRootContext } from './NumberFieldRootContext';
import { useNumberFieldButton } from './useNumberFieldButton';
import type { NumberFieldRootState } from './NumberFieldRoot';
import { stateAttributesMapping } from '../utils/stateAttributesMapping';

type StepperButtonProps = NativeButtonProps & BaseUIComponentProps<'button', NumberFieldRootState>;

/**
 * Shared implementation for the increment and decrement stepper buttons. They differ only in the
 * direction they step and the boundary (`max` vs `min`) at which they become disabled.
 * Solid port of upstream's `useNumberFieldStepperButton`.
 */
export function useNumberFieldStepperButton(
  componentProps: StepperButtonProps,
  isIncrement: boolean,
): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'nativeButton',
  ]);

  const disabledProp = () => componentProps.disabled ?? false;
  const nativeButton = () => componentProps.nativeButton ?? true;

  const context = useNumberFieldRootContext();

  const isAtBoundary = () => {
    const value = context.value();
    if (value == null) {
      return false;
    }
    return isIncrement ? value >= context.maxWithDefault() : value <= context.minWithDefault();
  };

  const disabled = () => disabledProp() || context.disabled() || isAtBoundary();

  const buttonProps = useNumberFieldButton({
    isIncrement,
    inputRef: context.inputRef,
    inputValue: context.inputValue,
    disabled,
    readOnly: context.readOnly,
    id: context.id,
    setValue: context.setValue,
    getStepAmount: context.getStepAmount,
    incrementValue: context.incrementValue,
    allowInputSyncRef: context.allowInputSyncRef,
    format: context.format,
    valueRef: context.valueRef,
    locale: context.locale,
    lastChangedValueRef: context.lastChangedValueRef,
    onValueCommitted: context.onValueCommitted,
  });

  const { getButtonProps, buttonRef } = createButton({
    // Read-only steppers are exposed as unavailable through button disabled semantics, while
    // `data-readonly` (from `state`) is preserved for styling. `aria-readonly` isn't valid on the
    // `button` role, so it's intentionally not set.
    disabled: () => disabled() || context.readOnly(),
    native: nativeButton,
    focusableWhenDisabled: () => true,
  });

  // Delegating getters (rather than `{ ...context.state, disabled }`) so every field but
  // `disabled` stays live: a plain object spread of a getter-based object reads each getter once
  // and freezes the result, which would silently stop the button's `data-*` attributes (dirty,
  // touched, valid, …) from updating after the first render.
  const buttonState: NumberFieldRootState = {
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return context.state.readOnly;
    },
    get required() {
      return context.state.required;
    },
    get value() {
      return context.state.value;
    },
    get inputValue() {
      return context.state.inputValue;
    },
    get scrubbing() {
      return context.state.scrubbing;
    },
    get touched() {
      return context.state.touched;
    },
    get dirty() {
      return context.state.dirty;
    },
    get valid() {
      return context.state.valid;
    },
    get filled() {
      return context.state.filled;
    },
    get focused() {
      return context.state.focused;
    },
  };

  return renderElement('button', componentProps, {
    defaultClass: isIncrement ? 'wheel-NumberField-Increment' : 'wheel-NumberField-Decrement',
    slot: isIncrement ? 'number-field-increment' : 'number-field-decrement',
    ref: buttonRef,
    state: buttonState,
    props: [buttonProps, elementProps as Record<string, any>, getButtonProps],
    stateAttributesMapping,
  });
}
