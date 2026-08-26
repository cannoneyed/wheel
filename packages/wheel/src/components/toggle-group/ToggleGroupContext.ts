/* eslint-disable wheel/require-export-jsdoc -- This internal context mirrors the public group contract without repeating it. */
import { createContext, useContext, type Accessor } from 'solid-js';
import type { ButtonSize, ButtonVariant } from '../button/Button';
import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails';
import type { Orientation } from '../internals/types';
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
  size: Accessor<ButtonSize>;
  variant: Accessor<ButtonVariant>;
  isValueInitialized: Accessor<boolean>;
}

export const ToggleGroupContext = createContext<ToggleGroupContext<any> | undefined>(undefined);

export function useToggleGroupContext<Value>(optional = true) {
  const context = useContext(ToggleGroupContext) as ToggleGroupContext<Value> | undefined;
  if (context === undefined && !optional) {
    throw new Error('ToggleGroup context is missing. Place Toggle children inside ToggleGroup.');
  }
  return context;
}
