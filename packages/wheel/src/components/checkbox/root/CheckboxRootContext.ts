/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { CheckboxRootState } from './CheckboxRoot';

export type CheckboxRootContext = CheckboxRootState;

export const CheckboxRootContext = createContext<CheckboxRootContext | undefined>(undefined);

export function useCheckboxRootContext() {
  const context = useContext(CheckboxRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: CheckboxRootContext is missing. Checkbox parts must be placed within <Checkbox.Root>.',
    );
  }

  return context;
}
