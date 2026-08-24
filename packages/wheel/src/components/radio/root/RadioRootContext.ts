/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { RadioRootState } from './RadioRoot';

export type RadioRootContext = RadioRootState;

export const RadioRootContext = createContext<RadioRootContext | undefined>(undefined);

export function useRadioRootContext() {
  const context = useContext(RadioRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: RadioRootContext is missing. Radio parts must be placed within <Radio.Root>.',
    );
  }

  return context;
}
