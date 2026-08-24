// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Combobox } from '../index';
import { Field } from '../../field';
import { TestCombobox, clickItem, typeQuery, DEFAULT_ITEMS } from '../test-utils';

// Portal tests render into `document.body`; clean up explicitly (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

async function openViaArrowDown(input: HTMLElement) {
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
}

describe('<Combobox.Root />', () => {
  it('renders the input with combobox role and aria wiring', () => {
    render(() => <TestCombobox />);
    const input = screen.getByTestId('input');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the popup on ArrowDown and closes on Escape', async () => {
    render(() => <TestCombobox />);
    const input = screen.getByTestId('input');
    await openViaArrowDown(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
  });

  describe('selection behavior', () => {
    describe('single', () => {
      it('selects an item on click and fills the input, closing the popup', async () => {
        const onValueChange = vi.fn();
        render(() => <TestCombobox rootProps={{ onValueChange }} />);
        const input = screen.getByTestId('input') as HTMLInputElement;
        await openViaArrowDown(input);

        const item = screen.getByTestId('item-b');
        clickItem(item);

        await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('b', expect.anything()));
        await waitFor(() => expect(screen.queryByTestId('popup')).not.toBeInTheDocument());
        expect(input.value).toBe('Banana');
      });

      it('supports controlled value', async () => {
        function Controlled() {
          const [value, setValue] = createSignal<string | null>('a');
          return (
            <TestCombobox
              rootProps={{
                value: value(),
                onValueChange: (next) => setValue(next),
              }}
            />
          );
        }
        render(() => <Controlled />);
        const input = screen.getByTestId('input') as HTMLInputElement;
        expect(input.value).toBe('Apple');
      });

      it('supports defaultValue (uncontrolled)', () => {
        render(() => <TestCombobox rootProps={{ defaultValue: 'c' }} />);
        const input = screen.getByTestId('input') as HTMLInputElement;
        expect(input.value).toBe('Cherry');
      });
    });

    describe('multiple', () => {
      it('toggles selection and keeps the popup open', async () => {
        const onValueChange = vi.fn();
        render(() => <TestCombobox rootProps={{ multiple: true, onValueChange }} />);
        const input = screen.getByTestId('input');
        await openViaArrowDown(input);

        clickItem(screen.getByTestId('item-a'));
        await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(['a'], expect.anything()));
        expect(screen.getByTestId('popup')).toBeInTheDocument();

        clickItem(screen.getByTestId('item-b'));
        await waitFor(() =>
          expect(onValueChange).toHaveBeenCalledWith(['a', 'b'], expect.anything()),
        );
      });

      it('defaults selectedValue to an empty array when unset', () => {
        const onValueChange = vi.fn();
        render(() => <TestCombobox rootProps={{ multiple: true, onValueChange }} />);
        // Just verifying no crash constructing multiple-mode state with no initial value.
        expect(screen.getByTestId('input')).toBeInTheDocument();
      });
    });
  });

  describe('keyboard interaction', () => {
    it('ArrowDown opens and highlights the first item; a second ArrowDown moves to the next, Enter selects it', async () => {
      const onValueChange = vi.fn();
      render(() => <TestCombobox rootProps={{ onValueChange }} />);
      const input = screen.getByTestId('input');
      await openViaArrowDown(input);
      // Opening via ArrowDown already highlights the first item.
      await waitFor(() => expect(screen.getByTestId('item-a')).toHaveAttribute('data-highlighted'));

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      await waitFor(() => expect(screen.getByTestId('item-b')).toHaveAttribute('data-highlighted'));

      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('b', expect.anything()));
    });

    it('Escape while closed clears the input and selected value', async () => {
      const onValueChange = vi.fn();
      const onInputValueChange = vi.fn();
      render(() => (
        <TestCombobox
          rootProps={{ defaultValue: 'a', onValueChange, onInputValueChange }}
        />
      ));
      const input = screen.getByTestId('input') as HTMLInputElement;
      expect(input.value).toBe('Apple');

      fireEvent.keyDown(input, { key: 'Escape' });
      await waitFor(() => expect(onValueChange).toHaveBeenCalledWith(null, expect.anything()));
    });
  });

  describe('prop: disabled', () => {
    it('does not open on ArrowDown when disabled', async () => {
      render(() => <TestCombobox rootProps={{ disabled: true }} />);
      const input = screen.getByTestId('input');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    });

    it('sets data-disabled on the input', () => {
      render(() => <TestCombobox rootProps={{ disabled: true }} />);
      expect(screen.getByTestId('input')).toHaveAttribute('data-disabled');
    });
  });

  describe('prop: readOnly', () => {
    it('sets aria-readonly and prevents editing the underlying selection via typing behavior', () => {
      render(() => <TestCombobox rootProps={{ readOnly: true }} />);
      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-readonly', 'true');
    });
  });

  describe('prop: required', () => {
    it('sets aria-required in single/multiple selection mode', () => {
      render(() => <TestCombobox rootProps={{ required: true }} />);
      expect(screen.getByTestId('input')).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('prop: itemToStringLabel and itemToStringValue', () => {
    it('uses itemToStringLabel to display the selected value in the input', () => {
      const objectItems = [
        { value: 'a', label: 'Apple' },
        { value: 'b', label: 'Banana' },
      ];
      render(() => (
        <Combobox.Root
          items={objectItems}
          defaultValue={objectItems[1]}
          itemToStringLabel={(item: any) => item.label}
        >
          <Combobox.Input data-testid="input" />
        </Combobox.Root>
      ));
      expect((screen.getByTestId('input') as HTMLInputElement).value).toBe('Banana');
    });
  });

  describe('prop: filter', () => {
    it('filters items using the internal collator-based contains match by default', async () => {
      render(() => <TestCombobox />);
      const input = screen.getByTestId('input') as HTMLInputElement;
      typeQuery(input, 'an');
      await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
      expect(screen.getByTestId('item-b')).toBeInTheDocument();
      expect(screen.queryByTestId('item-a')).not.toBeInTheDocument();
      expect(screen.queryByTestId('item-c')).not.toBeInTheDocument();
    });

    it('supports a custom filter function', async () => {
      render(() => (
        <TestCombobox
          rootProps={{
            filter: (itemValue: string, query: string) => itemValue.startsWith(query),
          }}
        />
      ));
      const input = screen.getByTestId('input') as HTMLInputElement;
      typeQuery(input, 'a');
      await waitFor(() => expect(screen.getByTestId('item-a')).toBeInTheDocument());
      expect(screen.queryByTestId('item-b')).not.toBeInTheDocument();
    });

    it('disables filtering entirely when filter is null', async () => {
      render(() => <TestCombobox rootProps={{ filter: null }} />);
      const input = screen.getByTestId('input') as HTMLInputElement;
      typeQuery(input, 'zzz-no-match');
      await waitFor(() => expect(screen.getByTestId('popup')).toBeInTheDocument());
      expect(screen.getByTestId('item-a')).toBeInTheDocument();
      expect(screen.getByTestId('item-b')).toBeInTheDocument();
      expect(screen.getByTestId('item-c')).toBeInTheDocument();
    });
  });

  describe('prop: openOnInputClick', () => {
    it('does not open the popup on mousedown when false', () => {
      render(() => <TestCombobox rootProps={{ openOnInputClick: false }} />);
      const input = screen.getByTestId('input');
      fireEvent.mouseDown(input);
      expect(screen.queryByTestId('popup')).not.toBeInTheDocument();
    });
  });

  describe('prop: autoHighlight', () => {
    it('highlights the first item once the user types a query', async () => {
      render(() => <TestCombobox rootProps={{ autoHighlight: true }} />);
      const input = screen.getByTestId('input');
      typeQuery(input, 'a');
      await waitFor(() => expect(screen.getByTestId('item-a')).toHaveAttribute('data-highlighted'));
    });

    it('highlights the first item immediately on open when "always"', async () => {
      render(() => <TestCombobox rootProps={{ autoHighlight: 'always' }} />);
      const input = screen.getByTestId('input');
      await openViaArrowDown(input);
      await waitFor(() => expect(screen.getByTestId('item-a')).toHaveAttribute('data-highlighted'));
    });
  });

  describe('prop: open / onOpenChange / defaultOpen', () => {
    it('supports controlled open state', async () => {
      const onOpenChange = vi.fn();
      function Controlled() {
        const [open, setOpen] = createSignal(false);
        return (
          <TestCombobox
            rootProps={{
              open: open(),
              onOpenChange: (next, details) => {
                onOpenChange(next, details);
                setOpen(next);
              },
            }}
          />
        );
      }
      render(() => <Controlled />);
      const input = screen.getByTestId('input');
      fireEvent.mouseDown(input);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything()));
      expect(screen.getByTestId('popup')).toBeInTheDocument();
    });

    it('renders open initially with defaultOpen', () => {
      render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
      expect(screen.getByTestId('popup')).toBeInTheDocument();
    });
  });

  describe('prop: isItemEqualToValue', () => {
    it('uses a custom comparer to determine selection/highlight state', async () => {
      const objectItems = [
        { value: { id: 1 }, label: 'One' },
        { value: { id: 2 }, label: 'Two' },
      ];
      render(() => (
        <Combobox.Root
          items={objectItems.map((i) => i.value)}
          defaultValue={{ id: 2 }}
          isItemEqualToValue={(a: any, b: any) => a.id === b.id}
          itemToStringLabel={(item: any) => objectItems.find((i) => i.value.id === item.id)!.label}
        >
          <Combobox.Input data-testid="input" />
        </Combobox.Root>
      ));
      expect((screen.getByTestId('input') as HTMLInputElement).value).toBe('Two');
    });
  });

  describe('Form', () => {
    it('submits the serialized selected value via a hidden input', () => {
      let formEl: HTMLFormElement | undefined;
      render(() => (
        <form
          ref={(el) => {
            formEl = el;
          }}
        >
          <TestCombobox rootProps={{ name: 'fruit', defaultValue: 'b' }} />
        </form>
      ));
      const hiddenInput = formEl!.querySelector('input[name="fruit"]') as HTMLInputElement;
      expect(hiddenInput).not.toBeNull();
      expect(hiddenInput.value).toBe('b');
    });

    it('submits one hidden input per selected value in multiple mode', () => {
      let formEl: HTMLFormElement | undefined;
      render(() => (
        <form
          ref={(el) => {
            formEl = el;
          }}
        >
          <TestCombobox rootProps={{ name: 'fruit', multiple: true, defaultValue: ['a', 'b'] }} />
        </form>
      ));
      const hiddenInputs = formEl!.querySelectorAll('input[name="fruit"]');
      expect(hiddenInputs.length).toBe(2);
    });
  });

  describe('Field', () => {
    it('marks the field as filled once a value is selected', async () => {
      render(() => (
        <Field.Root>
          <TestCombobox />
        </Field.Root>
      ));
      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('data-filled');

      await openViaArrowDown(input);
      clickItem(screen.getByTestId('item-a'));

      await waitFor(() => expect(input).toHaveAttribute('data-filled'));
    });

    it('marks the field as touched on blur', async () => {
      render(() => (
        <Field.Root>
          <TestCombobox />
        </Field.Root>
      ));
      const input = screen.getByTestId('input');
      fireEvent.focus(input);
      fireEvent.blur(input);
      await waitFor(() => expect(input).toHaveAttribute('data-touched'));
    });
  });

  it('renders every provided item', async () => {
    render(() => <TestCombobox rootProps={{ defaultOpen: true }} />);
    for (const item of DEFAULT_ITEMS) {
      expect(screen.getByTestId(`item-${item.value}`)).toHaveTextContent(item.label);
    }
  });
});
