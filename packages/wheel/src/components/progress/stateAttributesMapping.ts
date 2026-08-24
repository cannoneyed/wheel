/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import type { ProgressRootState } from './root/ProgressRoot';

export const stateAttributesMapping: StateAttributesMapping<ProgressRootState> = {
  status(value): Record<string, string> | null {
    if (value === 'progressing') {
      return { 'data-progressing': '' };
    }
    if (value === 'complete') {
      return { 'data-complete': '' };
    }
    if (value === 'indeterminate') {
      return { 'data-indeterminate': '' };
    }
    return null;
  },
};
