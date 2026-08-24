/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { EMPTY_OBJECT } from '../base-utils/empty';
import { DISABLED_TRANSITIONS_STYLE } from '../internals/constants';
import type { TransitionStatus } from '../internals/createTransitionStatus';

export function getDisabledMountTransitionStyles(transitionStatus: TransitionStatus): {
  style?: JSX.CSSProperties | undefined;
} {
  return transitionStatus === 'starting' ? DISABLED_TRANSITIONS_STYLE : EMPTY_OBJECT;
}
