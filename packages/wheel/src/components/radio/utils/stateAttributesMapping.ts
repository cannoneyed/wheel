import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { TransitionStatus } from '../../internals/createTransitionStatus';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { fieldValidityMapping } from '../../internals/field-constants/constants';

/**
 * Shared between `Radio.Root` and `Radio.Indicator` (mirrors upstream, which
 * uses a single `radio/utils/stateAttributesMapping.ts` for both parts). The
 * `transitionStatus` entry is inert for `Radio.Root`'s state, which has no
 * `transitionStatus` key.
 */
export const stateAttributesMapping = {
  checked(value): Record<string, string> {
    if (value) {
      return { 'data-checked': '' };
    }
    return { 'data-unchecked': '' };
  },
  ...transitionStatusMapping,
  ...fieldValidityMapping,
} satisfies StateAttributesMapping<{
  checked: boolean;
  transitionStatus: TransitionStatus;
  valid: boolean | null;
}>;
