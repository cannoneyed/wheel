/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import type { CheckboxGroupState } from './CheckboxGroup';
import { fieldValidityMapping } from '../internals/field-constants/constants';
import { CheckboxGroupDataAttributes } from './CheckboxGroupDataAttributes';

export const stateAttributesMapping: StateAttributesMapping<CheckboxGroupState> = {
  disabled(value): Record<string, string> | null {
    if (value) {
      return { [CheckboxGroupDataAttributes.disabled]: '' };
    }
    return null;
  },
  ...fieldValidityMapping,
};
