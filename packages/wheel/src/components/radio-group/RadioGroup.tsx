/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { useSignal } from '../../core/local-state';
import { splitProps } from 'solid-js';
import { createControllableSignal } from '../base-utils/createControllableSignal';
import { createValueChanged } from '../base-utils/createValueChanged';
import { CompositeRoot } from '../internals/composite/root/CompositeRoot';
import { SHIFT, type ModifierKey } from '../internals/composite/composite';
import { contains } from '../internals/shadowDom';
import { createBaseUiId } from '../internals/createBaseUiId';
import {
  useFieldRootContext,
  type FieldRootState,
} from '../internals/field-root-context/FieldRootContext';
import { registerFieldControl } from '../internals/field-register-control/registerFieldControl';
import { useFormContext } from '../internals/form-context/FormContext';
import { useLabelableContext } from '../internals/labelable-provider/LabelableContext';
import { useAriaLabelledBy } from '../internals/labelable-provider/useAriaLabelledBy';
import { useFieldsetRootContext } from '../fieldset/root/FieldsetRootContext';
import { fieldValidityMapping } from '../internals/field-constants/constants';
import { RadioGroupContext } from './RadioGroupContext';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import { REASONS } from '../internals/reasons';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types';

const MODIFIER_KEYS: ModifierKey[] = [SHIFT];

/**
 * Provides a shared state to a series of radio buttons.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Radio Group](https://base-ui.com/react/components/radio)
 */
export function RadioGroup<Value = any>(componentProps: RadioGroup.Props<Value>) {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'readOnly',
    'required',
    'onValueChange',
    'value',
    'defaultValue',
    'form',
    'name',
    'inputRef',
    'id',
    'aria-labelledby',
  ]);

  const {
    setTouched: setFieldTouched,
    setFocused,
    validationMode,
    name: fieldName,
    disabled: fieldDisabled,
    state: fieldState,
    validation,
    setDirty,
    setFilled,
    validityData,
  } = useFieldRootContext();
  const { labelId } = useLabelableContext();
  const { clearErrors } = useFormContext();
  const fieldsetContext = useFieldsetRootContext(true);

  const disabled = () => (fieldDisabled() || componentProps.disabled) ?? false;
  const readOnly = () => componentProps.readOnly ?? false;
  const required = () => componentProps.required ?? false;
  const name = () => fieldName() ?? componentProps.name;
  const id = createBaseUiId(() => componentProps.id);

  const [checkedValue, setCheckedValueUnwrapped] = createControllableSignal<Value | undefined>({
    controlled: () => componentProps.value,
    default: componentProps.defaultValue,
    name: 'RadioGroup',
    state: 'value',
  });

  const [touched, setTouched] = useSignal(false, 'touched');

  const setCheckedValue = (value: Value, eventDetails: RadioGroup.ChangeEventDetails) => {
    componentProps.onValueChange?.(value, eventDetails);

    if (eventDetails.isCanceled) {
      return;
    }

    setCheckedValueUnwrapped(value as Exclude<Value, Function>);
  };

  const controlRef: { current: HTMLElement | null } = { current: null };
  let groupInputEl: HTMLInputElement | null = null;
  let firstEnabledInputEl: HTMLInputElement | null = null;

  function setInputRef(hiddenInput: HTMLInputElement | null) {
    componentProps.inputRef?.(hiddenInput as HTMLInputElement);
    groupInputEl = hiddenInput;
    validation.inputRef.current = hiddenInput;
  }

  const registerControlRef = (element: HTMLElement | null, isDisabled = false) => {
    if (!element) {
      return;
    }

    if (isDisabled) {
      if (controlRef.current === element) {
        controlRef.current = null;
      }
      return;
    }

    if (controlRef.current == null) {
      controlRef.current = element;
    }
  };

  const registerInputRef = (input: HTMLInputElement | null) => {
    if (!input || input.disabled) {
      return;
    }

    if (!firstEnabledInputEl) {
      firstEnabledInputEl = input;
    }

    const currentInput = groupInputEl;
    if (input.checked || currentInput == null || currentInput.disabled) {
      setInputRef(input);
    }
  };

  const getFormValue = () => {
    // Disabled radios are excluded from native form submission, so a disabled
    // selection shouldn't be reported as the field's value either.
    const input = groupInputEl;
    if (!input || input.disabled || !input.checked) {
      return null;
    }

    return checkedValue() ?? null;
  };

  registerFieldControl(
    controlRef,
    id,
    () => checkedValue() ?? null,
    getFormValue,
    () => !disabled(),
    () => componentProps.name,
  );

  createValueChanged(checkedValue, () => {
    clearErrors(name());

    setDirty(checkedValue() !== validityData().initialValue);
    setFilled(checkedValue() != null);

    validation.change(checkedValue());

    const fallbackInput = firstEnabledInputEl;
    if (checkedValue() == null && fallbackInput && !fallbackInput.disabled) {
      setInputRef(fallbackInput);
    }
  });

  // Upstream falls back to the enclosing `Fieldset`'s legend id when neither an
  // explicit `aria-labelledby` nor a `Field.Label` is present.
  const ariaLabelledBy = useAriaLabelledBy(
    () => componentProps['aria-labelledby'],
    () => labelId() ?? fieldsetContext?.legendId(),
  );

  const state: RadioGroup.State = {
    get disabled() {
      return disabled();
    },
    get readOnly() {
      return readOnly();
    },
    get required() {
      return required();
    },
    get touched() {
      return fieldState.touched;
    },
    get dirty() {
      return fieldState.dirty;
    },
    get valid() {
      return fieldState.valid;
    },
    get filled() {
      return fieldState.filled;
    },
    get focused() {
      return fieldState.focused;
    },
  };

  const contextValue: RadioGroupContext<Value> = {
    disabled,
    readOnly,
    required,
    form: () => componentProps.form,
    name,
    checkedValue,
    setCheckedValue,
    touched,
    setTouched,
    validation,
    registerControlRef,
    registerInputRef,
  };

  const defaultProps = (): HTMLProps => ({
    id: id(),
    role: 'radiogroup',
    'aria-required': required() || undefined,
    'aria-disabled': disabled() || undefined,
    'aria-readonly': readOnly() || undefined,
    'aria-labelledby': ariaLabelledBy(),
    // Deviation from upstream: native `focus`/`blur` don't bubble, so
    // group-level focus tracking uses `focusin`/`focusout` (which do)
    // instead of React's synthetically-bubbled `onFocus`/`onBlur`.
    onFocusIn() {
      setFocused(true);
    },
    onFocusOut(event: FocusEvent) {
      if (!contains(event.currentTarget as Element, event.relatedTarget as Element | null)) {
        setFieldTouched(true);
        setFocused(false);

        if (validationMode() === 'onBlur') {
          validation.commit(checkedValue());
        }
      }
    },
    // Deviation from upstream: upstream uses `onKeyDownCapture` here so the
    // group learns about arrow-key navigation before focus moves to the next
    // item. A regular (bubble-phase) `onKeyDown` is equivalent in practice:
    // `CompositeRoot`'s own navigation queues the actual `.focus()` call in a
    // microtask, and this handler runs synchronously beforehand regardless
    // of merge order, so `touched`/`focused` are always set before the next
    // item's `onFocus` (Radio.Root's select-on-arrow-focus check) fires.
    onKeyDown(event: KeyboardEvent) {
      if (event.key.startsWith('Arrow')) {
        setTouched(true);
        setFocused(true);
      }
    },
  });

  return (
    <RadioGroupContext.Provider value={contextValue}>
      <CompositeRoot
        defaultClass="wheel-RadioGroup"
        slot="radio-group"
        as={componentProps.as}
        asChild={componentProps.asChild}
        class={componentProps.class}
        style={componentProps.style}
        children={componentProps.children}
        state={state}
        props={[
          defaultProps,
          elementProps as Record<string, any>,
          (props: HTMLProps) => validation.getValidationProps(disabled(), props),
        ]}
        refs={componentProps.ref ? [componentProps.ref] : []}
        stateAttributesMapping={fieldValidityMapping}
        enableHomeAndEndKeys={false}
        modifierKeys={MODIFIER_KEYS}
      />
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupState extends FieldRootState {
  /**
   * Whether the user should be unable to select a different radio button in the group.
   */
  readOnly: boolean;
  /**
   * Whether the user must tick a radio button within the group before submitting a form.
   */
  required: boolean;
}

export interface RadioGroupProps<Value = any>
  extends Omit<BaseUIComponentProps<'div', RadioGroupState>, 'value'> {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Whether the user should be unable to select a different radio button in the group.
   * @default false
   */
  readOnly?: boolean | undefined;
  /**
   * Whether the user must choose a value before submitting a form.
   * @default false
   */
  required?: boolean | undefined;
  /**
   * Identifies the field when a form is submitted.
   */
  name?: string | undefined;
  /**
   * Identifies the form that owns the radio inputs.
   * Useful when the radio group is rendered outside the form.
   */
  form?: string | undefined;
  /**
   * The controlled value of the radio item that should be currently selected.
   *
   * To render an uncontrolled radio group, use the `defaultValue` prop instead.
   */
  value?: Value | undefined;
  /**
   * The uncontrolled value of the radio button that should be initially selected.
   *
   * To render a controlled radio group, use the `value` prop instead.
   */
  defaultValue?: Value | undefined;
  /**
   * Callback fired when the value changes.
   */
  onValueChange?: ((value: Value, eventDetails: RadioGroup.ChangeEventDetails) => void) | undefined;
  /**
   * A ref to access the hidden input element.
   */
  inputRef?: ((el: HTMLInputElement) => void) | undefined;
}

export type RadioGroupChangeEventReason = typeof REASONS.none;

export type RadioGroupChangeEventDetails = BaseUIChangeEventDetails<RadioGroupChangeEventReason>;

export namespace RadioGroup {
  export type State = RadioGroupState;
  export type Props<TValue = any> = RadioGroupProps<TValue>;
  export type ChangeEventReason = RadioGroupChangeEventReason;
  export type ChangeEventDetails = RadioGroupChangeEventDetails;
}
