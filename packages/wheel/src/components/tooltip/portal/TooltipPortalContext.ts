/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const TooltipPortalContext = createContext<boolean | undefined>(undefined);

export function useTooltipPortalContext(): boolean {
  const value = useContext(TooltipPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <Tooltip.Portal> is missing.');
  }
  return value;
}
