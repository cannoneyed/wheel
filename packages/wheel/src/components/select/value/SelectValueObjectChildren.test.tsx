// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { Select } from '../index';

const methods = [
  { id: 'a', name: 'A' },
  { id: 'b', name: 'B' },
];

describe('<Select.Value /> function children with object values', () => {
  afterEach(cleanup);

  // Regression: closing the popup deregisters items one at a time; the positioner's
  // item-map prune must not treat the emptying registry as "the selected item was
  // removed" and reset the value to null (upstream guards this via a cleared values
  // array; our items null their slots without shrinking it).
  it('never passes null to the children callback across open/close', async () => {
    const seen: any[] = [];
    const { getByRole } = render(() => (
      <Select.Root defaultValue={methods[0]} itemToStringValue={(m: any) => m.id}>
        <Select.Trigger>
          <Select.Value>
            {(m: any) => {
              seen.push(m);
              return <span>{m.name}</span>;
            }}
          </Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner>
            <Select.Popup>
              <Select.List>
                {methods.map((m) => (
                  <Select.Item value={m}>
                    <Select.ItemText>{m.name}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    ));

    const trigger = getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(seen.every((m) => m != null)).toBe(true);
  });
});
