/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { ToastViewportState } from './ToastViewport';

const EXPANDED_HOOK = { 'data-expanded': '' };

export const stateAttributesMapping: StateAttributesMapping<ToastViewportState> = {
  expanded(value) {
    return value ? EXPANDED_HOOK : null;
  },
};
