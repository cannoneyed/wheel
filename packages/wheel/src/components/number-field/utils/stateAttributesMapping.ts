/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { NumberFieldRootState } from '../root/NumberFieldRoot';
import { fieldValidityMapping } from '../../internals/field-constants/constants';

export const stateAttributesMapping: StateAttributesMapping<NumberFieldRootState> = {
  inputValue: () => null,
  value: () => null,
  ...fieldValidityMapping,
};
