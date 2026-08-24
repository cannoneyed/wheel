/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const DialogPortalContext = createContext<boolean | undefined>(undefined);

export function useDialogPortalContext(): boolean {
  const value = useContext(DialogPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <Dialog.Portal> is missing.');
  }
  return value;
}
