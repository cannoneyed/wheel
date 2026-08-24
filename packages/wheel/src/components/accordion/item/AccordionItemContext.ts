/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { AccordionItemState } from './AccordionItem';

export interface AccordionItemContext {
  open: Accessor<boolean>;
  state: AccordionItemState;
  setTriggerId: (id: string | undefined) => void;
  triggerId: Accessor<string | undefined>;
}

export const AccordionItemContext = createContext<AccordionItemContext | undefined>(undefined);

export function useAccordionItemContext(): AccordionItemContext {
  const context = useContext(AccordionItemContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: AccordionItemContext is missing. Accordion parts must be placed within <Accordion.Item>.',
    );
  }
  return context;
}
