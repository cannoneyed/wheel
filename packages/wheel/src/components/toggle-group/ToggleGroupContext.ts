/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { Orientation } from '../internals/types';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { BaseUIEventReasons } from '../internals/reasons';

export interface ToggleGroupContext<Value> {
  value: Accessor<readonly Value[]>;
  setGroupValue: (
    newValue: Value,
    nextPressed: boolean,
    eventDetails: BaseUIChangeEventDetails<BaseUIEventReasons['none']>,
  ) => void;
  disabled: Accessor<boolean>;
  orientation: Accessor<Orientation>;
  /**
   * Indicates whether the value has been initialized via `value` or
   * `defaultValue` props. Used to determine if Toggle should warn users about
   * data inconsistency problems.
   */
  isValueInitialized: Accessor<boolean>;
}

export const ToggleGroupContext = createContext<ToggleGroupContext<any> | undefined>(undefined);

export function useToggleGroupContext<Value>(optional = true) {
  const context = useContext(ToggleGroupContext) as ToggleGroupContext<Value> | undefined;
  if (context === undefined && !optional) {
    throw new Error(
      'Base UI Solid: ToggleGroupContext is missing. ToggleGroup parts must be placed within <ToggleGroup>.',
    );
  }

  return context;
}
