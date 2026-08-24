/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export const PreviewCardPortalContext = createContext<boolean | undefined>(undefined);

export function usePreviewCardPortalContext(): boolean {
  const value = useContext(PreviewCardPortalContext);
  if (value === undefined) {
    throw new Error('Base UI: <PreviewCard.Portal> is missing.');
  }
  return value;
}
