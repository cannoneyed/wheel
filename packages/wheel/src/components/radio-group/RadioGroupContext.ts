/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { BaseUIEventReasons } from '../internals/reasons';
import type { FieldValidation } from '../internals/field-root-context/FieldRootContext';

export interface RadioGroupContext<Value = any> {
  disabled: Accessor<boolean>;
  readOnly: Accessor<boolean>;
  required: Accessor<boolean>;
  form: Accessor<string | undefined>;
  name: Accessor<string | undefined>;
  checkedValue: Accessor<Value | undefined>;
  setCheckedValue: (
    value: Value,
    eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
  ) => void;
  /**
   * Whether the group was navigated to via arrow keys since the last focus
   * (drives Radio.Root's "select on arrow-key focus" behavior).
   */
  touched: Accessor<boolean>;
  setTouched: (next: boolean) => void;
  validation: FieldValidation;
  registerControlRef: (element: HTMLElement | null, disabled?: boolean) => void;
  registerInputRef: (input: HTMLInputElement | null) => void;
}

export const RadioGroupContext = createContext<RadioGroupContext<any> | undefined>(undefined);

export function useRadioGroupContext() {
  return useContext(RadioGroupContext);
}
