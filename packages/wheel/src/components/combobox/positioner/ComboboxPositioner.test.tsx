// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { TestCombobox } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Positioner />', () => {
  it('is not rendered while the popup is closed (Portal renders nothing)', () => {
    render(() => <TestCombobox />);
    expect(screen.queryByTestId('positioner')).not.toBeInTheDocument();
  });

  it('is visible while the popup is open and exposes side/align data attributes', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const positioner = await screen.findByTestId('positioner');
    await waitFor(() => expect(positioner).not.toHaveAttribute('hidden'));
    expect(positioner).toHaveAttribute('data-side');
    expect(positioner).toHaveAttribute('data-align');
  });
});
