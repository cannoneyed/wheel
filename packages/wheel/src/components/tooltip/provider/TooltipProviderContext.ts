/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface TooltipProviderContext {
  delay: number | undefined;
  closeDelay: number | undefined;
}

export const TooltipProviderContext = createContext<TooltipProviderContext | undefined>(undefined);

export function useTooltipProviderContext(): TooltipProviderContext | undefined {
  return useContext(TooltipProviderContext);
}
