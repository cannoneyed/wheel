/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface MeterRootContext {
  formattedValue: Accessor<string>;
  max: Accessor<number>;
  min: Accessor<number>;
  /**
   * The value normalized to a `0`–`100` percentage of the range, clamped to those bounds.
   */
  percentageValue: Accessor<number>;
  setLabelId: (id: string | undefined) => void;
  value: Accessor<number>;
}

export const MeterRootContext = createContext<MeterRootContext | undefined>(undefined);

export function useMeterRootContext() {
  const context = useContext(MeterRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: MeterRootContext is missing. Meter parts must be placed within <Meter.Root>.',
    );
  }

  return context;
}
