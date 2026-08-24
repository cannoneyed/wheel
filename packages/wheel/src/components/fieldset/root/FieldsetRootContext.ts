/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface FieldsetRootContext {
  legendId: Accessor<string | undefined>;
  setLegendId: (id: string | undefined) => void;
  disabled: Accessor<boolean | undefined>;
}

export const FieldsetRootContext = createContext<FieldsetRootContext | undefined>(undefined);

export function useFieldsetRootContext(optional: true): FieldsetRootContext | undefined;
export function useFieldsetRootContext(optional?: false): FieldsetRootContext;
export function useFieldsetRootContext(optional = false) {
  const context = useContext(FieldsetRootContext);
  if (!context && !optional) {
    throw new Error(
      'Base UI Solid: FieldsetRootContext is missing. Fieldset parts must be placed within <Fieldset.Root>.',
    );
  }
  return context;
}
