// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { TestCombobox } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Trigger />', () => {
  it('renders a native button', () => {
    render(() => <TestCombobox renderTrigger />);
    expect(screen.getByTestId('trigger').tagName).toBe('BUTTON');
  });

  it('opens the popup and moves focus to the input when the input lives outside the popup', async () => {
    render(() => <TestCombobox renderTrigger />);
    const trigger = screen.getByTestId('trigger');
    fireEvent.mouseDown(trigger);
    await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
  });

  it('opens the popup with ArrowDown', async () => {
    render(() => <TestCombobox renderTrigger />);
    const trigger = screen.getByTestId('trigger');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
  });

  it('reflects open state via aria-expanded', async () => {
    render(() => <TestCombobox renderTrigger rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('trigger')).toHaveAttribute('aria-expanded', 'true');
  });
});
