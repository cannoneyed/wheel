/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { ProgressRootState, ProgressStatus } from './ProgressRoot';

export interface ProgressRootContext {
  /**
   * Formatted value of the component.
   */
  formattedValue: Accessor<string>;
  /**
   * The maximum value.
   */
  max: Accessor<number>;
  /**
   * The minimum value.
   */
  min: Accessor<number>;
  /**
   * The value normalized to a `0`–`100` percentage of the range, clamped to those bounds.
   * `null` while the progress is indeterminate.
   */
  percentageValue: Accessor<number | null>;
  /**
   * Value of the component.
   */
  value: Accessor<number | null>;
  setLabelId: (id: string | undefined) => void;
  state: ProgressRootState;
  status: Accessor<ProgressStatus>;
}

/**
 * @internal
 */
export const ProgressRootContext = createContext<ProgressRootContext | undefined>(undefined);

export function useProgressRootContext() {
  const context = useContext(ProgressRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: ProgressRootContext is missing. Progress parts must be placed within <Progress.Root>.',
    );
  }

  return context;
}
