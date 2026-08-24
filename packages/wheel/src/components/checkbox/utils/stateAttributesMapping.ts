import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import type { CheckboxRootState } from '../root/CheckboxRoot';
import { fieldValidityMapping } from '../../internals/field-constants/constants';

/**
 * Solid port of upstream's `useStateAttributesMapping`. Not a hook: the
 * returned mapping's `checked` entry closes over `state`, so it stays
 * reactive to `state.indeterminate` without needing to be recreated on every
 * read (`renderElement`'s props memo re-invokes it reactively).
 */
export function checkboxStateAttributesMapping(
  state: Pick<CheckboxRootState, 'indeterminate'>,
): StateAttributesMapping<CheckboxRootState> {
  return {
    checked(value): Record<string, string> {
      if (state.indeterminate) {
        // `data-indeterminate` is already handled by the `indeterminate` state key.
        return {};
      }

      if (value) {
        return {
          'data-checked': '',
        };
      }

      return {
        'data-unchecked': '',
      };
    },
    ...fieldValidityMapping,
  };
}
