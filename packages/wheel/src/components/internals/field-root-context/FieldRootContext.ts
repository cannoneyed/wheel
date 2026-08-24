/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import { NOOP, EMPTY_OBJECT } from '../../base-utils/empty';
import type { HTMLProps } from '../types';
import type { FieldValidityData, FieldRootState, ValidationMode } from '../../field/root/FieldRoot';

// Source-of-truth types now live in `field/root/FieldRoot.tsx` (matching upstream); re-exported
// here so existing imports (`from '.../field-root-context/FieldRootContext'`) keep working.
export type { FieldValidityData, FieldRootState, ValidationMode };

export interface FieldValidation {
  getValidationProps: (disabled: boolean, props?: HTMLProps) => HTMLProps;
  inputRef: { current: HTMLElement | null };
  registerInput: (element: HTMLElement | null) => void;
  commit: (value?: unknown, revalidate?: boolean) => Promise<void>;
  change: (value: unknown) => void;
}

export interface FieldControlRegistration {
  id: Accessor<string | undefined>;
  value: Accessor<unknown>;
  getValueForForm?: (() => unknown) | undefined;
  enabled: Accessor<boolean>;
  name: Accessor<string | undefined>;
  /**
   * The control's DOM element, used by `<Form>` to focus the first invalid
   * control on submit.
   */
  controlRef: { current: HTMLElement | null };
}

export interface FieldRootContext {
  invalid: Accessor<boolean | undefined>;
  name: Accessor<string | undefined>;
  validityData: Accessor<FieldValidityData>;
  setValidityData: (next: FieldValidityData | ((prev: FieldValidityData) => FieldValidityData)) => void;
  disabled: Accessor<boolean | undefined>;
  touched: Accessor<boolean>;
  setTouched: (next: boolean) => void;
  dirty: Accessor<boolean>;
  setDirty: (next: boolean) => void;
  filled: Accessor<boolean>;
  setFilled: (next: boolean) => void;
  focused: Accessor<boolean>;
  setFocused: (next: boolean) => void;
  validate: (
    value: unknown,
    formValues: Record<string, unknown>,
  ) => string | string[] | null | Promise<string | string[] | null>;
  validationMode: Accessor<ValidationMode>;
  validationDebounceTime: Accessor<number>;
  shouldValidateOnChange: () => boolean;
  state: FieldRootState;
  markedDirty: { current: boolean };
  registerFieldControl: (
    source: symbol,
    registration: FieldControlRegistration | undefined,
  ) => void;
  validation: FieldValidation;
}

const DEFAULT_VALIDITY_DATA: FieldValidityData = {
  state: {
    badInput: false,
    customError: false,
    patternMismatch: false,
    rangeOverflow: false,
    rangeUnderflow: false,
    stepMismatch: false,
    tooLong: false,
    tooShort: false,
    typeMismatch: false,
    valueMissing: false,
    valid: null,
  },
  errors: [],
  error: '',
  value: '',
  initialValue: null,
};

export const DEFAULT_FIELD_ROOT_CONTEXT: FieldRootContext = {
  invalid: () => undefined,
  name: () => undefined,
  validityData: () => DEFAULT_VALIDITY_DATA,
  setValidityData: NOOP,
  disabled: () => undefined,
  touched: () => false,
  setTouched: NOOP,
  dirty: () => false,
  setDirty: NOOP,
  filled: () => false,
  setFilled: NOOP,
  focused: () => false,
  setFocused: NOOP,
  validate: () => null,
  validationMode: () => 'onSubmit',
  validationDebounceTime: () => 0,
  shouldValidateOnChange: () => false,
  state: {
    disabled: false,
    touched: false,
    dirty: false,
    valid: null,
    filled: false,
    focused: false,
  },
  markedDirty: { current: false },
  registerFieldControl: NOOP,
  validation: {
    getValidationProps: (_disabled: boolean, props: HTMLProps = EMPTY_OBJECT) => props,
    inputRef: { current: null },
    registerInput: NOOP,
    commit: async () => {},
    change: NOOP,
  },
};

export const FieldRootContext = createContext<FieldRootContext>(DEFAULT_FIELD_ROOT_CONTEXT);

export function useFieldRootContext(optional = true) {
  const context = useContext(FieldRootContext);

  if (context.setValidityData === NOOP && !optional) {
    throw new Error(
      'Base UI Solid: FieldRootContext is missing. Field parts must be placed within <Field.Root>.',
    );
  }

  return context;
}
