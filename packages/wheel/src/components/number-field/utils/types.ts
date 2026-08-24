/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/**
 * Solid port of upstream's `number-field/utils/types.ts` — framework-neutral, ported unchanged
 * aside from dropping the React-specific `SyntheticEvent` union member (Solid has no synthetic
 * event system; only native DOM events flow through handlers).
 */
export type Direction = -1 | 1;

export type DirectionalChangeReason =
  | 'increment-press'
  | 'decrement-press'
  | 'wheel'
  | 'scrub'
  | 'keyboard';

export interface ChangeEventCustomProperties {
  direction?: Direction | undefined;
}

export interface IncrementValueParameters {
  direction: Direction;
  event?: Event | undefined;
  reason: DirectionalChangeReason;
  currentValue?: number | null | undefined;
}

export interface EventWithOptionalKeyState {
  altKey?: boolean | undefined;
  shiftKey?: boolean | undefined;
}
