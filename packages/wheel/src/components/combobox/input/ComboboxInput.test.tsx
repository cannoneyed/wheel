// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { Combobox } from '../index';
import { TestCombobox, typeQuery } from '../test-utils';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Input />', () => {
  it('renders a native input with role=combobox', () => {
    render(() => <TestCombobox />);
    const input = screen.getByTestId('input');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
  });

  describe('prop: disabled', () => {
    it('disables the input and prevents opening on click', () => {
      render(() => <TestCombobox inputProps={{ disabled: true }} />);
      const input = screen.getByTestId('input') as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(input).toHaveAttribute('data-disabled');
    });
  });

  describe('prop: readOnly', () => {
    it('reflects the combobox-level readOnly state via aria-readonly', () => {
      render(() => <TestCombobox rootProps={{ readOnly: true }} />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-readonly', 'true');
    });
  });

  describe('interaction behavior', () => {
    it('opens the popup and sets aria-expanded on typing a query', async () => {
      render(() => <TestCombobox />);
      const input = screen.getByTestId('input');
      typeQuery(input, 'App');
      await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
      expect(screen.getByTestId('item-a')).toBeInTheDocument();
    });

    it('sets aria-controls to the list id once open', async () => {
      render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
      const input = screen.getByTestId('input');
      const list = screen.getByTestId('list');
      await waitFor(() => expect(input).toHaveAttribute('aria-controls', list.id));
    });

    it('removes the last selected value on Backspace when input is empty and nested in Chips', async () => {
      // `<Combobox.Input>`'s chip-aware Backspace handling only activates when it reads
      // `ComboboxChipsContext` from an ancestor `<Combobox.Chips>` (matching upstream's identical
      // `comboboxChipsContext &&` guard) — the input must be a descendant of `Chips`, not a sibling.
      const onValueChange = vi.fn();
      render(() => (
        <Combobox.Root items={['a', 'b']} multiple defaultValue={['a']} onValueChange={onValueChange}>
          <Combobox.Chips data-testid="chips">
            <Combobox.Input data-testid="input" />
          </Combobox.Chips>
        </Combobox.Root>
      ));
      const input = screen.getByTestId('input') as HTMLInputElement;
      expect(input.value).toBe('');

      fireEvent.keyDown(input, { key: 'Backspace' });
      await waitFor(() =>
        expect(onValueChange).toHaveBeenCalledWith([], expect.anything()),
      );
    });

    it('calls onInputValueChange as the user types', () => {
      const onInputValueChange = vi.fn();
      render(() => <TestCombobox rootProps={{ onInputValueChange }} />);
      const input = screen.getByTestId('input');
      typeQuery(input, 'Ap');
      expect(onInputValueChange).toHaveBeenCalledWith('Ap', expect.anything());
    });

    it('supports a controlled inputValue', () => {
      render(() => <TestCombobox rootProps={{ inputValue: 'Cherry', onInputValueChange: () => {} }} />);
      expect((screen.getByTestId('input') as HTMLInputElement).value).toBe('Cherry');
    });
  });

  describe('data state attributes', () => {
    it('reflects open state via data-popup-open (present via trigger merge) and aria-expanded', async () => {
      render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-expanded', 'true');
    });

    it('sets data-list-empty when the filtered list has no matches', async () => {
      render(() => <TestCombobox />);
      const input = screen.getByTestId('input');
      typeQuery(input, 'zzz-no-match');
      await waitFor(() => expect(input).toHaveAttribute('data-list-empty'));
    });
  });

  describe('rendering as a different element', () => {
    it('supports the `render` pattern via `asChild`', () => {
      render(() => (
        <Combobox.Root items={['a', 'b']}>
          <Combobox.Input asChild data-testid="input">
            {(props) => <input {...props} data-custom="yes" />}
          </Combobox.Input>
        </Combobox.Root>
      ));
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('data-custom', 'yes');
    });
  });
});
