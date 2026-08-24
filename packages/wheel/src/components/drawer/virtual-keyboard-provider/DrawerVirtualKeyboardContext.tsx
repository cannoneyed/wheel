/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext } from 'solid-js';

export interface DrawerVirtualKeyboardContext {
  onTouchStart: (event: TouchEvent) => void;
  // Driven by the viewport's native `touchmove` listener so it still fires when the
  // swipe gesture claims the event with `stopPropagation()`.
  onTouchMove: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
  onTouchCancel: () => void;
}

export const DrawerVirtualKeyboardContext = createContext<DrawerVirtualKeyboardContext | undefined>(
  undefined,
);

export function useDrawerVirtualKeyboardContext() {
  return useContext(DrawerVirtualKeyboardContext);
}
