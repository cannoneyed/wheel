/* eslint-disable wheel/require-export-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { fireEvent } from '@solidjs/testing-library';
import type { JSX } from 'solid-js';
import { Combobox } from './index';

/**
 * Shared test fixture for combobox part tests (mirrors `Select.test.tsx`'s `TestSelect` helper,
 * scoped to the combobox part-test files instead of one giant combined file).
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

export interface TestComboboxProps {
  rootProps?: Combobox.Root.Props<any, any>;
  inputProps?: Combobox.Input.Props;
  items?: TestItem[];
  renderTrigger?: boolean;
  children?: JSX.Element;
}

export function TestCombobox(props: TestComboboxProps): JSX.Element {
  const items = props.items ?? DEFAULT_ITEMS;
  // Filtering matches against the item *value* (via `itemToStringLabel`, falling back to
  // `String(value)`), not the rendered `<Combobox.Item>` children — so this default maps each
  // short test value (`'a'`) to its full display label (`'Apple'`) for query-matching tests, the
  // same way a real consumer's `itemToStringLabel` would when values are opaque ids.
  const defaultItemToStringLabel = (value: string) =>
    items.find((i) => i.value === value)?.label ?? value;
  return (
    <Combobox.Root
      items={items.map((i) => i.value)}
      itemToStringLabel={defaultItemToStringLabel}
      {...props.rootProps}
    >
      <Combobox.Input data-testid="input" {...props.inputProps} />
      {props.renderTrigger && <Combobox.Trigger data-testid="trigger" />}
      <Combobox.Portal>
        <Combobox.Positioner data-testid="positioner">
          <Combobox.Popup data-testid="popup">
            <Combobox.List data-testid="list">
              {(value: string) => {
                const item = items.find((i) => i.value === value)!;
                return (
                  <Combobox.Item
                    value={item.value}
                    disabled={item.disabled}
                    data-testid={`item-${item.value}`}
                  >
                    {item.label}
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
      {props.children}
    </Combobox.Root>
  );
}

/**
 * A real user click always fires `pointerdown` before `click`. See `Select.test.tsx`'s identical
 * helper for the full rationale.
 */
export function clickItem(item: Element) {
  fireEvent.pointerDown(item, { pointerType: 'mouse' });
  fireEvent.mouseDown(item);
  fireEvent.mouseUp(item);
  fireEvent.click(item, { detail: 1 });
}

/**
 * Simulates the user typing a query into the combobox input.
 *
 * `ComboboxInput`'s `onChange` handler distinguishes a typed keystroke from a browser
 * autofill/programmatic value assignment by checking the native `InputEvent.inputType`
 * (`!inputType || inputType === 'insertReplacementText'` reads as "autofill-like"). `fireEvent.change`
 * dispatches a plain `Event` with no `inputType`, which that check treats as autofill and
 * therefore does NOT auto-open the popup or filter — exactly what a real keystroke's `input`
 * event (which always carries `inputType: 'insertText'`) is meant to do. Use this helper (not
 * `fireEvent.change`) whenever a test wants to simulate the user typing a query.
 */
export function typeQuery(input: HTMLElement, value: string) {
  fireEvent.input(input, { target: { value }, inputType: 'insertText' });
}
