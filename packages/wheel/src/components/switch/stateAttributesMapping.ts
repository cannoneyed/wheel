/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { SwitchRootState } from './root/SwitchRoot';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import { fieldValidityMapping } from '../internals/field-constants/constants';

export const stateAttributesMapping: StateAttributesMapping<SwitchRootState> = {
  ...fieldValidityMapping,
  checked(value): Record<string, string> {
    if (value) {
      return {
        'data-checked': '',
      };
    }

    return {
      'data-unchecked': '',
    };
  },
};
