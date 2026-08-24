/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
/**
 * Solid port of upstream's `combobox/root/utils/constants.ts` — framework-neutral, ported
 * unchanged.
 */
export const NO_ACTIVE_VALUE = Symbol('none');
export const INITIAL_LAST_HIGHLIGHT: { value: any; index: number } = {
  value: NO_ACTIVE_VALUE,
  index: -1,
} as const;
