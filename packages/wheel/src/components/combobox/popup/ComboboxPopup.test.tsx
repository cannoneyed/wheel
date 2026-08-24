// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { Combobox } from '../index';
import { TestCombobox } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Popup />', () => {
  it('exposes open state via data attributes mapping', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const popup = await screen.findByTestId('popup');
    expect(popup).toHaveAttribute('data-open');
  });

  it('sets role to presentation when the input renders outside the popup', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const popup = await screen.findByTestId('popup');
    expect(popup).toHaveAttribute('role', 'presentation');
  });

  it('sets role to dialog when the input renders inside the popup', async () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultOpen>
        <Combobox.Portal>
          <Combobox.Positioner data-testid="positioner">
            <Combobox.Popup data-testid="popup-inside">
              <Combobox.Input data-testid="input-inside" />
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    await waitFor(() => expect(screen.getByTestId('popup-inside')).toHaveAttribute('role', 'dialog'));
  });

  it('renders the popup positioned within a Portal Positioner container', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const popup = await screen.findByTestId('popup');
    const positioner = screen.getByTestId('positioner');
    expect(positioner.contains(popup)).toBe(true);
  });
});
