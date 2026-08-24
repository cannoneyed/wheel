/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import { NOOP } from '../../base-utils/empty';
import type { FieldValidityData, ValidationMode } from '../field-root-context/FieldRootContext';

export type Errors = Record<string, string | string[]>;

export interface FormContext {
  errors: () => Errors;
  clearErrors: (name: string | undefined) => void;
  formRef: {
    current: {
      fields: Map<
        string,
        {
          name: string | undefined;
          /**
           * After this returns, the field registry entry reflects the latest
           * synchronous validity verdict. Async validators do not block submit.
           */
          validate: () => void;
          validityData: FieldValidityData;
          controlRef: { current: HTMLElement | null };
          getValue: () => unknown;
        }
      >;
    };
  };
  validationMode: () => ValidationMode;
  submitAttempted: { current: boolean };
}

const DEFAULT_FORM_CONTEXT: FormContext = {
  formRef: {
    current: {
      fields: new Map(),
    },
  },
  errors: () => ({}),
  clearErrors: NOOP,
  validationMode: () => 'onSubmit',
  submitAttempted: {
    current: false,
  },
};

export const FormContext = createContext<FormContext>(DEFAULT_FORM_CONTEXT);

export function useFormContext() {
  return useContext(FormContext);
}
