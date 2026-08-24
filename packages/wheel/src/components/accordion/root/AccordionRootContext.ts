/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { AccordionRoot, AccordionRootState, AccordionValue } from './AccordionRoot';

export interface AccordionRootContext<Value = any> {
  disabled: Accessor<boolean>;
  handleValueChange: (
    newValue: AccordionValue<Value>[number],
    nextOpen: boolean,
    eventDetails: AccordionRoot.ChangeEventDetails,
  ) => void;
  hiddenUntilFound: Accessor<boolean>;
  keepMounted: Accessor<boolean>;
  state: AccordionRootState<Value>;
  value: Accessor<AccordionValue<Value>>;
}

export const AccordionRootContext = createContext<AccordionRootContext<any> | undefined>(
  undefined,
);

export function useAccordionRootContext<Value = any>(): AccordionRootContext<Value> {
  const context = useContext(AccordionRootContext) as AccordionRootContext<Value> | undefined;
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: AccordionRootContext is missing. Accordion parts must be placed within <Accordion.Root>.',
    );
  }
  return context;
}
