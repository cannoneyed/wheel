/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createContext, useContext, type Accessor } from 'solid-js';

export type TextDirection = 'ltr' | 'rtl';

export interface DirectionContextValue {
  direction: Accessor<TextDirection>;
}

/**
 * @internal
 */
export const DirectionContext = createContext<DirectionContextValue | undefined>(undefined);

/**
 * Solid port of upstream's `useDirection`. Returns an accessor rather than a
 * snapshot so consumers stay reactive to direction changes.
 */
export function useDirection(): Accessor<TextDirection> {
  const context = useContext(DirectionContext);
  return () => context?.direction() ?? 'ltr';
}
