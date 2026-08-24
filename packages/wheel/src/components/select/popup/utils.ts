/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';

/**
 * Solid port of upstream's `select/popup/utils.ts` — framework-neutral, ported unchanged.
 */
export function clearStyles(element: HTMLElement | null, originalStyles: JSX.CSSProperties) {
  if (element) {
    Object.assign(element.style, originalStyles);
  }
}

export const LIST_FUNCTIONAL_STYLES: JSX.CSSProperties = {
  position: 'relative',
  'max-height': '100%',
  'overflow-x': 'hidden',
  'overflow-y': 'auto',
};
