/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/* eslint-disable wheel/require-effect-reason -- These effects preserve the audited Base UI lifecycle synchronization documented by the surrounding implementation. */
import { useSignal } from '../../../core/local-state';
import { createEffect, splitProps, type JSX } from 'solid-js';
import { renderElement } from '../../internals/renderElement';
import type { BaseUIComponentProps } from '../../internals/types';
import { FieldRootContext } from '../../internals/field-root-context/FieldRootContext';
import { DEFAULT_VALIDITY_STATE, fieldValidityMapping } from '../../internals/field-constants/constants';
import { useFieldsetRootContext } from '../../fieldset/root/FieldsetRootContext';
import { useFormContext } from '../../internals/form-context/FormContext';
import { LabelableProvider } from '../../internals/labelable-provider';
import { useFieldValidation } from './useFieldValidation';
import { useFieldControlRegistration } from '../../internals/field-register-control/useFieldControlRegistration';
import type { FieldRootContext as FieldRootContextValue } from '../../internals/field-root-context/FieldRootContext';

/**
 * @internal
 */
function FieldRootInner(componentProps: FieldRoot.Props): JSX.Element {
  const [, elementProps] = splitProps(componentProps, [
    'class',
    'style',
    'as',
    'asChild',
    'children',
    'disabled',
    'name',
    'validate',
    'validationMode',
    'validationDebounceTime',
    'invalid',
    'dirty',
    'touched',
    'actionsRef',
  ]);

  const { errors, validationMode: formValidationMode, submitAttempted } = useFormContext();

  const fieldsetContext = useFieldsetRootContext(true);

  const validate = (value: unknown, formValues: Record<string, unknown>) =>
    componentProps.validate?.(value, formValues) ?? null;

  const disabled = () => (fieldsetContext?.disabled() || componentProps.disabled) ?? false;

  const [touchedState, setTouchedState] = useSignal(false, 'touchedState');
  const [dirtyState, setDirtyState] = useSignal(false, 'dirtyState');
  const [filled, setFilled] = useSignal(false, 'filled');
  const [focused, setFocused] = useSignal(false, 'focused');

  const dirty = () => componentProps.dirty ?? dirtyState();
  const touched = () => componentProps.touched ?? touchedState();

  const markedDirty: { current: boolean } = { current: dirty() };
  const registeredFieldId: { current: string | undefined } = { current: undefined };
  const [registeredFieldName, setRegisteredFieldName] = useSignal<string | undefined>(undefined, 'registeredFieldName');
  const effectiveName = () => componentProps.name ?? registeredFieldName();

  createEffect(() => {
    if (componentProps.dirty !== undefined) {
      markedDirty.current = componentProps.dirty;
    }
  });

  const getRegisteredFieldId = () => registeredFieldId.current;
  const setRegisteredFieldId = (id: string | undefined) => {
    registeredFieldId.current = id;
  };

  const setDirty = (value: boolean) => {
    if (componentProps.dirty !== undefined) {
      return;
    }
    if (value) {
      markedDirty.current = true;
    }
    setDirtyState(value);
  };

  const setTouched = (value: boolean) => {
    if (componentProps.touched !== undefined) {
      return;
    }
    setTouchedState(value);
  };

  const validationMode = () => componentProps.validationMode ?? formValidationMode();
  const validationDebounceTime = () => componentProps.validationDebounceTime ?? 0;

  const shouldValidateOnChange = () =>
    validationMode() === 'onChange' || (validationMode() === 'onSubmit' && submitAttempted.current);

  const formError = () => {
    const name = effectiveName();
    return name && Object.hasOwn(errors(), name) ? errors()[name] : null;
  };
  const hasFormError = () => {
    const error = formError();
    return !!(Array.isArray(error) ? error.length : error);
  };
  const invalid = () => componentProps.invalid === true || hasFormError();

  const [validityData, setValidityData] = useSignal<FieldValidityData>({
    state: DEFAULT_VALIDITY_STATE,
    error: '',
    errors: [],
    value: null,
    initialValue: null,
  }, 'validityData');

  // App-controlled invalidity (the `invalid` prop and `<Form>` errors) keeps the field marked
  // invalid even while disabled. Only computed validity (native constraints and `validate`)
  // is suppressed when disabled, matching `:disabled` not participating in constraint validation.
  const valid = () => !invalid() && (disabled() ? null : validityData().state.valid);

  const state: FieldRoot.State = {
    get disabled() {
      return disabled();
    },
    get touched() {
      return touched();
    },
    get dirty() {
      return dirty();
    },
    get valid() {
      return valid();
    },
    get filled() {
      return filled();
    },
    get focused() {
      return focused();
    },
  };

  const validation = useFieldValidation({
    setValidityData,
    validate,
    validityData,
    validationDebounceTime,
    invalid,
    markedDirty,
    state,
    shouldValidateOnChange,
    getRegisteredFieldId,
  });

  const [validateFieldControl, registerFieldControl] = useFieldControlRegistration({
    commit: validation.commit,
    invalid,
    markedDirty,
    name: () => componentProps.name,
    setRegisteredFieldName,
    setRegisteredFieldId,
    setValidityData,
    validityData,
  });

  createEffect(() => {
    if (componentProps.actionsRef) {
      componentProps.actionsRef.current = { validate: validateFieldControl };
    }
  });

  const contextValue: FieldRootContextValue = {
    invalid,
    name: effectiveName,
    validityData,
    setValidityData,
    disabled,
    touched,
    setTouched,
    dirty,
    setDirty,
    filled,
    setFilled,
    focused,
    setFocused,
    validate,
    validationMode,
    validationDebounceTime,
    shouldValidateOnChange,
    state,
    markedDirty,
    registerFieldControl,
    validation,
  };

  return (
    <FieldRootContext.Provider value={contextValue}>
      {renderElement('div', componentProps, {
        defaultClass: 'wheel-Field-Root',
        slot: 'field-root',
        state,
        props: elementProps as Record<string, any>,
        stateAttributesMapping: fieldValidityMapping,
      })}
    </FieldRootContext.Provider>
  );
}

/**
 * Groups all parts of the field.
 * Renders a `<div>` element.
 *
 * Documentation: [Base UI Field](https://base-ui.com/react/components/field)
 */
export function FieldRoot(componentProps: FieldRoot.Props): JSX.Element {
  return (
    <LabelableProvider>
      <FieldRootInner {...componentProps} />
    </LabelableProvider>
  );
}

export interface FieldValidityData {
  state: {
    badInput: boolean;
    customError: boolean;
    patternMismatch: boolean;
    rangeOverflow: boolean;
    rangeUnderflow: boolean;
    stepMismatch: boolean;
    tooLong: boolean;
    tooShort: boolean;
    typeMismatch: boolean;
    valueMissing: boolean;
    valid: boolean | null;
  };
  error: string;
  errors: string[];
  value: unknown;
  initialValue: unknown;
}

export type ValidationMode = 'onSubmit' | 'onBlur' | 'onChange';

export interface FieldRootActions {
  validate: () => void;
}

export interface FieldRootState {
  /**
   * Whether the component should ignore user interaction.
   */
  disabled: boolean;
  /**
   * Whether the field has been touched.
   */
  touched: boolean;
  /**
   * Whether the field value has changed from its initial value.
   */
  dirty: boolean;
  /**
   * Whether the field is valid.
   */
  valid: boolean | null;
  /**
   * Whether the field has a value.
   */
  filled: boolean;
  /**
   * Whether the field is focused.
   */
  focused: boolean;
}

export interface FieldRootProps extends BaseUIComponentProps<'div', FieldRootState> {
  /**
   * Whether the component should ignore user interaction.
   * Takes precedence over the `disabled` prop on the `<Field.Control>` component.
   * @default false
   */
  disabled?: boolean | undefined;
  /**
   * Identifies the field when a form is submitted.
   * Takes precedence over the `name` prop on the `<Field.Control>` component.
   */
  name?: string | undefined;
  /**
   * A function for custom validation. Return a string or an array of strings with
   * the error message(s) if the value is invalid, or `null` if the value is valid.
   * Asynchronous functions are supported, but they do not prevent form submission
   * when using `validationMode="onSubmit"`.
   */
  validate?:
    | ((
        value: unknown,
        formValues: Record<string, unknown>,
      ) => string | string[] | null | Promise<string | string[] | null>)
    | undefined;
  /**
   * Determines when the field should be validated.
   * This takes precedence over the `validationMode` prop on `<Form>`.
   *
   * - `onSubmit`: triggers validation when the form is submitted, and re-validates on change after submission.
   * - `onBlur`: triggers validation when the control loses focus.
   * - `onChange`: triggers validation on every change to the control value.
   *
   * @default 'onSubmit'
   */
  validationMode?: ValidationMode | undefined;
  /**
   * How long to wait between `validate` callbacks if
   * `validationMode="onChange"` is used. Specified in milliseconds.
   * @default 0
   */
  validationDebounceTime?: number | undefined;
  /**
   * Whether the field is invalid.
   * Useful when the field state is controlled by an external library.
   */
  invalid?: boolean | undefined;
  /**
   * Whether the field's value has been changed from its initial value.
   * Useful when the field state is controlled by an external library.
   */
  dirty?: boolean | undefined;
  /**
   * Whether the field has been touched.
   * Useful when the field state is controlled by an external library.
   */
  touched?: boolean | undefined;
  /**
   * A ref to imperative actions.
   * - `validate`: Validates the field when called.
   */
  actionsRef?: { current: FieldRoot.Actions | null } | undefined;
}

export namespace FieldRoot {
  export type State = FieldRootState;
  export type Props = FieldRootProps;
  export type Actions = FieldRootActions;
}
