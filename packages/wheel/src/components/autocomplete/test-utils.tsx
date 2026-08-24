/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import type { JSX } from 'solid-js';
import { Autocomplete } from './index';

/**
 * Shared test fixture for autocomplete part tests (mirrors `Combobox`'s `test-utils.tsx`, scoped
 * to the autocomplete part-test files).
 */
export interface TestItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export const DEFAULT_ITEMS: TestItem[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

export interface TestAutocompleteProps {
  rootProps?: Autocomplete.Root.Props<any>;
  inputProps?: Autocomplete.Input.Props;
  items?: TestItem[];
  renderTrigger?: boolean;
  children?: JSX.Element;
}

export function TestAutocomplete(props: TestAutocompleteProps): JSX.Element {
  const items = props.items ?? DEFAULT_ITEMS;
  // Filtering/highlighting matches against the item *value* (via `itemToStringValue`, falling
  // back to `String(value)`), not the rendered `<Autocomplete.Item>` children — so this default
  // maps each short test value (`'a'`) to its full display label (`'Apple'`) for query-matching
  // tests, the same way a real consumer's `itemToStringValue` would when values are opaque ids.
  const defaultItemToStringValue = (value: string) =>
    items.find((i) => i.value === value)?.label ?? value;
  return (
    <Autocomplete.Root
      items={items.map((i) => i.value)}
      itemToStringValue={defaultItemToStringValue}
      {...props.rootProps}
    >
      <Autocomplete.Input data-testid="input" {...props.inputProps} />
      {props.renderTrigger && <Autocomplete.Trigger data-testid="trigger" />}
      <Autocomplete.Portal>
        <Autocomplete.Positioner data-testid="positioner">
          <Autocomplete.Popup data-testid="popup">
            <Autocomplete.List data-testid="list">
              {(value: string) => {
                const item = items.find((i) => i.value === value)!;
                return (
                  <Autocomplete.Item
                    value={item.value}
                    disabled={item.disabled}
                    data-testid={`item-${item.value}`}
                  >
                    {item.label}
                  </Autocomplete.Item>
                );
              }}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
      {props.children}
    </Autocomplete.Root>
  );
}

// Framework-agnostic DOM event helpers — reused as-is from the combobox test suite (see there for
// the full rationale behind each).
export { clickItem, typeQuery } from '../combobox/test-utils';
