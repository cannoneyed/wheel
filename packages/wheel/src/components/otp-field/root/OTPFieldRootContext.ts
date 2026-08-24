/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { JSX } from 'solid-js';
import type { OTPFieldRoot, OTPFieldRootState } from './OTPFieldRoot';
import type { OTPFieldInputState } from '../input/OTPFieldInput';

/**
 * Solid port of upstream's `OTPFieldRootContext`. Context values carry accessors, not
 * snapshots, so descendant `<OTPField.Input>` parts stay reactive.
 */
export interface OTPFieldRootContext {
  activeIndex: Accessor<number>;
  autoComplete: Accessor<string | undefined>;
  disabled: Accessor<boolean>;
  form: Accessor<string | undefined>;
  focusInput: (index: number) => void;
  queueFocusInput: (index: number, value: string) => void;
  getInputId: (index: number) => string | undefined;
  handleInputBlur: (event: FocusEvent) => void;
  handleInputFocus: (index: number, event: FocusEvent) => void;
  inputMode: Accessor<JSX.IntrinsicElements['input']['inputMode']>;
  inputAriaLabelledBy: Accessor<string | undefined>;
  invalid: Accessor<boolean | undefined>;
  length: Accessor<number>;
  mask: Accessor<boolean>;
  pattern: Accessor<string | undefined>;
  reportValueInvalid: (value: string, details: OTPFieldRoot.InvalidEventDetails) => void;
  readOnly: Accessor<boolean>;
  required: Accessor<boolean>;
  normalizeValue: Accessor<((value: string) => string) | undefined>;
  setValue: (
    value: string,
    details: OTPFieldRoot.ChangeEventDetails,
    onBeforeCommit?: (committedValue: string) => void,
  ) => string | null;
  state: OTPFieldRootState;
  validationType: Accessor<OTPFieldRoot.ValidationType>;
  value: Accessor<string>;
}

export const OTPFieldRootContext = createContext<OTPFieldRootContext | undefined>(undefined);

export function useOTPFieldRootContext() {
  const context = useContext(OTPFieldRootContext);

  if (context === undefined) {
    throw new Error(
      'Base UI Solid: OTPFieldRootContext is missing. OTPField parts must be placed within <OTPField.Root>.',
    );
  }

  return context;
}

/**
 * Derives the per-slot state seen by an `<OTPField.Input>` from the root's reactive state
 * plus the slot's own value/index. Solid port of upstream's `getOTPFieldInputState`: instead
 * of spreading (which would freeze a snapshot), each property is re-exposed as a getter so the
 * derived state keeps observing the root state's own getters.
 */
export function getOTPFieldInputState(
  rootState: OTPFieldRootState,
  slotValue: Accessor<string>,
  index: Accessor<number>,
): OTPFieldInputState {
  return {
    get complete() {
      return rootState.complete;
    },
    get disabled() {
      return rootState.disabled;
    },
    get length() {
      return rootState.length;
    },
    get readOnly() {
      return rootState.readOnly;
    },
    get required() {
      return rootState.required;
    },
    get touched() {
      return rootState.touched;
    },
    get dirty() {
      return rootState.dirty;
    },
    get valid() {
      return rootState.valid;
    },
    get focused() {
      return rootState.focused;
    },
    get value() {
      return slotValue();
    },
    get index() {
      return index();
    },
    get filled() {
      return slotValue() !== '';
    },
  };
}
