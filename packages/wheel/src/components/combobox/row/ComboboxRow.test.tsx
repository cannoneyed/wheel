// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Row />', () => {
  it('renders role=row and switches item role to gridcell within it', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} grid defaultOpen>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {() => (
                  <Combobox.Row data-testid="row">
                    <Combobox.Item value="a" data-testid="cell-a">
                      a
                    </Combobox.Item>
                  </Combobox.Row>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const row = screen.getAllByTestId('row')[0];
    const cell = screen.getAllByTestId('cell-a')[0];
    expect(row).toHaveAttribute('role', 'row');
    expect(cell).toHaveAttribute('role', 'gridcell');
  });
});
