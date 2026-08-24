/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface FieldItemContext {
  disabled: Accessor<boolean>;
}

export const FieldItemContext = createContext<FieldItemContext>({ disabled: () => false });

export function useFieldItemContext() {
  return useContext(FieldItemContext);
}
