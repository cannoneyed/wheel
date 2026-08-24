// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { Autocomplete } from '../index';
import { TestAutocomplete, clickItem, typeQuery } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Autocomplete.Item />', () => {
  describe('prop: onClick', () => {
    it('calls onClick when clicked with a pointer', () => {
      const handleClick = vi.fn();
      render(() => (
        <Autocomplete.Root items={['apple', 'banana']} openOnInputClick>
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  {(item: string) => (
                    <Autocomplete.Item value={item} onClick={handleClick}>
                      {item}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const input = screen.getByTestId('input');
      fireEvent.mouseDown(input);
      fireEvent.click(input);

      const option = screen.getByRole('option', { name: 'banana' });
      clickItem(option);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('calls onClick when selected with Enter key (via root interaction)', async () => {
      const handleClick = vi.fn();
      render(() => (
        <Autocomplete.Root items={['one', 'two']} openOnInputClick>
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List data-testid="list">
                  {(item: string) => (
                    <Autocomplete.Item value={item} onClick={handleClick}>
                      {item}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const input = screen.getByTestId('input');
      fireEvent.mouseDown(input);
      fireEvent.click(input);
      await waitFor(() => expect(screen.getByRole('listbox')).not.toBe(null));

      // Move highlight to an option then press Enter to select it.
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  it('does not expose data-selected when reopening after a value is chosen', async () => {
    render(() => <TestAutocomplete rootProps={{ openOnInputClick: true }} />);

    const input = screen.getByTestId('input');

    fireEvent.mouseDown(input);
    fireEvent.click(input);
    const banana = await screen.findByRole('option', { name: 'Banana' });
    clickItem(banana);

    fireEvent.mouseDown(input);
    fireEvent.click(input);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Banana' })).not.toHaveAttribute('data-selected'),
    );
  });

  it('highlights (not selects) items — selectionMode is always "none" under Autocomplete.Root', async () => {
    render(() => <TestAutocomplete />);

    const input = screen.getByTestId('input');
    typeQuery(input, 'a');

    const apple = await screen.findByRole('option', { name: 'Apple' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    await waitFor(() => expect(apple).toHaveAttribute('data-highlighted'));
    expect(apple).not.toHaveAttribute('aria-selected');
    expect(apple).not.toHaveAttribute('data-selected');
  });
});
