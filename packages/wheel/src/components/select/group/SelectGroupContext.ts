/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor, type Setter } from 'solid-js';

export interface SelectGroupContext {
  labelId: Accessor<string | undefined>;
  setLabelId: Setter<string | undefined>;
}

export const SelectGroupContext = createContext<SelectGroupContext | undefined>(undefined);

export function useSelectGroupContext(): SelectGroupContext {
  const context = useContext(SelectGroupContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: SelectGroupContext is missing. SelectGroup parts must be placed within <Select.Group>.',
    );
  }
  return context;
}
