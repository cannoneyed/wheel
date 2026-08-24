import type { StateAttributesMapping } from '../../internals/getStateAttributesProps';
import { transitionStatusMapping } from '../../internals/stateAttributesMapping';
import { MenuCheckboxItemDataAttributes } from '../checkbox-item/MenuCheckboxItemDataAttributes';

/**
 * Shared by `Menu.CheckboxItem`, `Menu.CheckboxItemIndicator`, `Menu.RadioItem`, and
 * `Menu.RadioItemIndicator`: maps a `checked` boolean to exactly one of `data-checked`/
 * `data-unchecked` (never both, never neither), and spreads in the transition-status mapping.
 */
export const itemMapping: StateAttributesMapping<{ checked: boolean }> = {
  checked(value): Record<string, string> {
    if (value) {
      return { [MenuCheckboxItemDataAttributes.checked]: '' };
    }
    return { [MenuCheckboxItemDataAttributes.unchecked]: '' };
  },
  ...transitionStatusMapping,
};
