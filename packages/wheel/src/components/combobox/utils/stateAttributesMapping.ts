import { pressableTriggerOpenStateMapping } from '../../utils/popupStateMapping';
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { Side } from '../../utils/useAnchorPositioning';
import { fieldValidityMapping } from '../../internals/field-constants/constants';

/**
 * Solid port of upstream's `combobox/utils/stateAttributesMapping.ts`.
 */
export const triggerStateAttributesMapping = {
  ...pressableTriggerOpenStateMapping,
  ...fieldValidityMapping,
  popupSide: (side: Side | null) => (side ? { 'data-popup-side': side } : null),
  listEmpty: (empty: boolean) => (empty ? { 'data-list-empty': '' } : null),
} satisfies StateAttributesMapping<{
  open: boolean;
  valid: boolean | null;
  popupSide: Side | null;
  listEmpty: boolean;
  placeholder: boolean;
}>;
