/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const PopoverPortalContext = createContext<boolean | undefined>(undefined);

export function usePopoverPortalContext(): boolean {
  const value = useContext(PopoverPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <Popover.Portal> is missing.');
  }
  return value;
}
