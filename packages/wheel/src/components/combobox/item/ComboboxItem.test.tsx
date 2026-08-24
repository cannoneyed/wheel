// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { TestCombobox, clickItem } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

async function open(input: HTMLElement) {
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
}

describe('<Combobox.Item />', () => {
  it('selects item and closes in single mode', async () => {
    const onValueChange = vi.fn();
    render(() => <TestCombobox rootProps={{ onValueChange }} />);
    const input = screen.getByTestId('input');
    await open(input);

    clickItem(screen.getByTestId('item-b'));

    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('b', expect.anything()));
    await waitFor(() => expect(screen.queryByTestId('popup')).not.toBeInTheDocument());
  });

  it('does not select a disabled item', async () => {
    const onValueChange = vi.fn();
    render(() => (
      <TestCombobox
        items={[
          { value: 'a', label: 'Apple' },
          { value: 'b', label: 'Banana', disabled: true },
        ]}
        rootProps={{ onValueChange }}
      />
    ));
    const input = screen.getByTestId('input');
    await open(input);

    clickItem(screen.getByTestId('item-b'));

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('Enter selects the highlighted item', async () => {
    const onValueChange = vi.fn();
    render(() => <TestCombobox rootProps={{ onValueChange }} />);
    const input = screen.getByTestId('input');
    await open(input);
    // Opening via ArrowDown already highlights the first item.
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveAttribute('data-highlighted'));

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('a', expect.anything()));
  });

  it('multiple mode toggles selection and stays open', async () => {
    const onValueChange = vi.fn();
    render(() => <TestCombobox rootProps={{ multiple: true, onValueChange }} />);
    const input = screen.getByTestId('input');
    await open(input);

    clickItem(screen.getByTestId('item-a'));
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(['a'], expect.anything()));
    expect(screen.getByTestId('popup')).toBeInTheDocument();

    onValueChange.mockClear();
    clickItem(screen.getByTestId('item-a'));
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith([], expect.anything()));
  });

  it('reflects selected value with aria-selected when reopened', async () => {
    render(() => <TestCombobox rootProps={{ defaultValue: 'a' }} />);
    const input = screen.getByTestId('input');
    await open(input);
    await waitFor(() => expect(screen.getByTestId('item-a')).toHaveAttribute('aria-selected', 'true'));
  });

  it('prevents default on mousedown so pointer selection does not steal input focus', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const item = screen.getByTestId('item-a');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    item.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('renders role=option and no explicit tabIndex (virtual focus via aria-activedescendant)', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    const item = screen.getByTestId('item-a');
    expect(item).toHaveAttribute('role', 'option');
    expect(item).not.toHaveAttribute('tabindex');
  });
});
