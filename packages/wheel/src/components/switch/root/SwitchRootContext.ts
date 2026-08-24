/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';
import type { SwitchRootState } from './SwitchRoot';

export type SwitchRootContext = SwitchRootState;

export const SwitchRootContext = createContext<SwitchRootContext | undefined>(undefined);

export function useSwitchRootContext() {
  const context = useContext(SwitchRootContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: SwitchRootContext is missing. Switch parts must be placed within <Switch.Root>.',
    );
  }

  return context;
}
