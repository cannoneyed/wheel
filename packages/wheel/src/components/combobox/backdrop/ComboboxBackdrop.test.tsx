// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Backdrop />', () => {
  it('is hidden while closed and visible while open', async () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} modal defaultOpen>
        <Combobox.Input data-testid="input" />
        <Combobox.Portal>
          <Combobox.Backdrop data-testid="backdrop" />
          <Combobox.Positioner>
            <Combobox.Popup data-testid="popup" />
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const backdrop = await screen.findByTestId('backdrop');
    await waitFor(() => expect(backdrop).toHaveAttribute('data-open'));
  });
});
