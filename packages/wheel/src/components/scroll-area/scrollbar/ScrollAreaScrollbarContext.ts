/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface ScrollAreaScrollbarContextValue {
  orientation: Accessor<'horizontal' | 'vertical'>;
}

export const ScrollAreaScrollbarContext = createContext<
  ScrollAreaScrollbarContextValue | undefined
>(undefined);

export function useScrollAreaScrollbarContext(): ScrollAreaScrollbarContextValue {
  const context = useContext(ScrollAreaScrollbarContext);
  if (context === undefined) {
    throw new Error(
      'Base UI: ScrollAreaScrollbarContext is missing. ScrollAreaScrollbar parts must be placed within <ScrollArea.Scrollbar>.',
    );
  }
  return context;
}
