// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { TestCombobox, typeQuery } from '../test-utils';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Empty />', () => {
  it('renders its children only when the filtered list is empty', async () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultOpen>
        <Combobox.Input data-testid="input" />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.Empty data-testid="empty">No results</Combobox.Empty>
              <Combobox.List>
                {(value: string) => <Combobox.Item value={value}>{value}</Combobox.Item>}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const empty = screen.getByTestId('empty');
    expect(empty).toBeEmptyDOMElement();

    typeQuery(screen.getByTestId('input'), 'zzz-no-match');
    await waitFor(() => expect(empty).toHaveTextContent('No results'));
  });

  it('sets role=status with a polite live region', () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} children={<Combobox.Empty data-testid="empty" />} />);
    const empty = screen.getByTestId('empty');
    expect(empty).toHaveAttribute('role', 'status');
    expect(empty).toHaveAttribute('aria-live', 'polite');
  });
});
