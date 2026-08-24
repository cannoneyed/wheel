/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export interface NumberFieldScrubAreaContext {
  isScrubbing: Accessor<boolean>;
  isTouchInput: Accessor<boolean>;
  isPointerLockDenied: Accessor<boolean>;
  scrubAreaCursorRef: { current: HTMLSpanElement | null };
}

export const NumberFieldScrubAreaContext = createContext<NumberFieldScrubAreaContext | undefined>(
  undefined,
);

export function useNumberFieldScrubAreaContext() {
  const context = useContext(NumberFieldScrubAreaContext);
  if (context === undefined) {
    throw new Error(
      'Base UI Solid: NumberFieldScrubAreaContext is missing. NumberFieldScrubArea parts must be placed within <NumberField.ScrubArea>.',
    );
  }
  return context;
}
