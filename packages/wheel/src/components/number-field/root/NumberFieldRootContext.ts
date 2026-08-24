/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { NumberFieldRoot, NumberFieldRootState } from './NumberFieldRoot';
import type { EventWithOptionalKeyState, IncrementValueParameters } from '../utils/types';

export type InputMode = 'numeric' | 'decimal' | 'text';

/**
 * Solid port of upstream's `NumberFieldRootContext`. React refs (`useRef`) become plain
 * `{ current }` objects. `formatOptionsRef` collapses to a plain `format` accessor (Solid
 * accessors are always live, so there's no stale-closure to dodge there). `valueRef`, however,
 * is kept as a real ref: `useNumberFieldButton`'s `commitValue` deliberately writes the *raw
 * unclamped* parsed number into it (while the reactive `value` stores the clamped result), so a
 * dirty-input step computes its base from the literal typed value, not the clamped one. That
 * divergence is intentional and would be lost if callers just read the `value` accessor instead.
 */
export interface NumberFieldRootContext {
  inputValue: Accessor<string>;
  value: Accessor<number | null>;
  minWithDefault: Accessor<number>;
  maxWithDefault: Accessor<number>;
  disabled: Accessor<boolean>;
  readOnly: Accessor<boolean>;
  id: Accessor<string | undefined>;
  setValue: (value: number | null, details: NumberFieldRoot.ChangeEventDetails) => boolean;
  getStepAmount: (event?: EventWithOptionalKeyState) => number;
  incrementValue: (amount: number, params: IncrementValueParameters) => boolean;
  inputRef: { current: HTMLInputElement | null };
  allowInputSyncRef: { current: boolean };
  format: Accessor<Intl.NumberFormatOptions | undefined>;
  valueRef: { current: number | null };
  lastChangedValueRef: { current: number | null };
  hasPendingCommitRef: { current: boolean };
  name: Accessor<string | undefined>;
  nameProp: Accessor<string | undefined>;
  required: Accessor<boolean>;
  invalid: Accessor<boolean | undefined>;
  inputMode: Accessor<InputMode>;
  getAllowedNonNumericKeys: () => Set<string>;
  min: Accessor<number | undefined>;
  max: Accessor<number | undefined>;
  setInputValue: (next: string) => void;
  locale: Accessor<Intl.LocalesArgument | undefined>;
  isScrubbing: Accessor<boolean>;
  setIsScrubbing: (next: boolean) => void;
  state: NumberFieldRootState;
  onValueCommitted: (
    value: number | null,
    eventDetails: NumberFieldRoot.CommitEventDetails,
  ) => void;
}

export const NumberFieldRootContext = createContext<NumberFieldRootContext | undefined>(undefined);

export function useNumberFieldRootContext() {
  const context = useContext(NumberFieldRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: NumberFieldRootContext is missing. NumberField parts must be placed within <NumberField.Root>.',
    );
  }

  return context;
}
