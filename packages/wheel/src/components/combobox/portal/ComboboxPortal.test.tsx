// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { TestCombobox } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Portal />', () => {
  it('renders the popup into document.body', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const popup = await screen.findByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
  });

  it('does not render its content while closed and not keepMounted', () => {
    render(() => <TestCombobox />);
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
  });
});
