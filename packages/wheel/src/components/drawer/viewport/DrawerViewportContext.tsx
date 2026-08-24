/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type JSX } from 'solid-js';

export interface DrawerViewportContextValue {
  swiping: boolean;
  getDragStyles: () => JSX.CSSProperties;
  swipeStrength: number | null;
  setSwipeDismissed: (dismissed: boolean) => void;
}

export const DrawerViewportContext = createContext<DrawerViewportContextValue | null>(null);

export function useDrawerViewportContext(optional?: false): DrawerViewportContextValue;
export function useDrawerViewportContext(optional: true): DrawerViewportContextValue | null;
export function useDrawerViewportContext(optional?: boolean) {
  const context = useContext(DrawerViewportContext);

  if (optional === false && context === null) {
    throw new Error(
      'Base UI: DrawerViewportContext is missing. Drawer parts must be placed within <Drawer.Viewport>.',
    );
  }

  return context;
}
