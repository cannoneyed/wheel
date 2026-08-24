/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface ScrollAreaViewportContextValue {
  computeThumbPosition: () => void;
}

export const ScrollAreaViewportContext = createContext<ScrollAreaViewportContextValue | undefined>(
  undefined,
);

export function useScrollAreaViewportContext(): ScrollAreaViewportContextValue {
  const context = useContext(ScrollAreaViewportContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: ScrollAreaViewportContext missing. ScrollAreaViewport parts must be placed within <ScrollArea.Viewport>.',
    );
  }
  return context;
}
