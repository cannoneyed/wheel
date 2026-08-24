// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.GroupLabel />', () => {
  it('registers its id on the parent group', () => {
    render(() => (
      <Combobox.Root items={['a']} defaultOpen>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.Group data-testid="group">
                <Combobox.GroupLabel data-testid="label">Fruits</Combobox.GroupLabel>
              </Combobox.Group>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const group = screen.getByTestId('group');
    const label = screen.getByTestId('label');
    expect(group.getAttribute('aria-labelledby')).toBe(label.id);
  });
});
