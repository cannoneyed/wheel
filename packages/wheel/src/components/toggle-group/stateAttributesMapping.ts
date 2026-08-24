/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { ToggleGroupState } from './ToggleGroup';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps';
import { ToggleGroupDataAttributes } from './ToggleGroupDataAttributes';

export const stateAttributesMapping: StateAttributesMapping<ToggleGroupState> = {
  multiple(value): Record<string, string> | null {
    if (value) {
      return { [ToggleGroupDataAttributes.multiple]: '' };
    }
    return null;
  },
};
