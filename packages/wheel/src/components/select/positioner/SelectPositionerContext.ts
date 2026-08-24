/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor, type Setter } from 'solid-js';
import type { Side, UseAnchorPositioningReturnValue } from '../../utils/useAnchorPositioning';

export interface SelectPositionerContext extends Omit<UseAnchorPositioningReturnValue, 'side'> {
  side: Accessor<Side | 'none'>;
  alignItemWithTriggerActive: Accessor<boolean>;
  setControlledAlignItemWithTrigger: Setter<boolean>;
  scrollUpArrowRef: { current: HTMLDivElement | null };
  scrollDownArrowRef: { current: HTMLDivElement | null };
}

export const SelectPositionerContext = createContext<SelectPositionerContext | undefined>(undefined);

export function useSelectPositionerContext(): SelectPositionerContext {
  const context = useContext(SelectPositionerContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: SelectPositionerContext is missing. Select parts must be placed within <Select.Positioner>.',
    );
  }
  return context;
}
