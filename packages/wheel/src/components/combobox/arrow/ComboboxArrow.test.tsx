// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Arrow />', () => {
  it('renders with aria-hidden and side/align data attributes once positioned', async () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultOpen>
        <Combobox.Input data-testid="input" />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.Arrow data-testid="arrow" />
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const arrow = await screen.findByTestId('arrow');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(arrow).toHaveAttribute('data-side'));
  });
});
