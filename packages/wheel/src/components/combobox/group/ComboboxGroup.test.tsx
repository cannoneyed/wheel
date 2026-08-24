// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Group />', () => {
  it('sets role=group and aria-labelledby from a nested GroupLabel', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultOpen>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {() => (
                  <Combobox.Group data-testid="group">
                    <Combobox.GroupLabel data-testid="group-label">Fruits</Combobox.GroupLabel>
                  </Combobox.Group>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const group = screen.getAllByTestId('group')[0];
    const label = screen.getAllByTestId('group-label')[0];
    expect(group).toHaveAttribute('role', 'group');
    expect(group).toHaveAttribute('aria-labelledby', label.id);
  });
});
