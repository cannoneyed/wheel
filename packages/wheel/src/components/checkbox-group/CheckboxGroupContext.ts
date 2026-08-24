/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { BaseUIEventReasons } from '../internals/reasons';
import type { FieldValidation } from '../internals/field-root-context/FieldRootContext';

// Mirrors upstream's `CheckboxGroupContext` shape (accessor-based, following
// `ToggleGroupContext`'s pattern). Provided by `CheckboxGroup` (see
// `CheckboxGroup.tsx`); `Checkbox.Root` reads it to derive grouped
// checked-state and parent/child tri-state cascading
// (`getParentProps`/`getChildProps`, see `useCheckboxGroupParent.ts`).
// When no `<CheckboxGroup>` ancestor exists, `useCheckboxGroupContext()`
// returns `undefined` and `Checkbox.Root` runs its plain standalone code path.

export interface CheckboxGroupParent {
  id: Accessor<string | undefined>;
  indeterminate: Accessor<boolean>;
  disabledStatesRef: { current: Map<string, boolean> };
  getParentProps: () => Record<string, any>;
  getChildProps: (value: string) => Record<string, any>;
}

export interface CheckboxGroupContext {
  value: Accessor<readonly string[] | undefined>;
  defaultValue: readonly string[] | undefined;
  setValue: (
    value: string[],
    eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
  ) => void;
  allValues: Accessor<readonly string[] | undefined>;
  parent: CheckboxGroupParent;
  disabled: Accessor<boolean>;
  validation: FieldValidation;
  registerControlRef: (element: HTMLElement | null) => void;
}

export const CheckboxGroupContext = createContext<CheckboxGroupContext | undefined>(undefined);

export function useCheckboxGroupContext(optional = true) {
  const context = useContext(CheckboxGroupContext);
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI Solid: CheckboxGroupContext is missing. CheckboxGroup parts must be placed within <CheckboxGroup>.',
    );
  }

  return context;
}
