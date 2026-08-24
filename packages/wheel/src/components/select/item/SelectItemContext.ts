/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface SelectItemContext {
  selected: Accessor<boolean>;
  index: Accessor<number>;
  textRef: { current: HTMLElement | null };
  selectedByFocus: Accessor<boolean>;
  hasRegistered: Accessor<boolean>;
}

export const SelectItemContext = createContext<SelectItemContext | undefined>(undefined);

export function useSelectItemContext(): SelectItemContext {
  const context = useContext(SelectItemContext);
  if (!context) {
    throw new Error(
      'Base UI: SelectItemContext is missing. SelectItem parts must be placed within <Select.Item>.',
    );
  }
  return context;
}
