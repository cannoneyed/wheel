// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Autocomplete } from '../index';
import { Field } from '../../field';
import { Form } from '../../form';
import { TestAutocomplete, clickItem, typeQuery } from '../test-utils';

// Portal tests render into `document.body`; clean up explicitly (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Autocomplete.Root />', () => {
  describe('keyboard interactions', () => {
    it('selecting with Enter fills the input and closes the popup; typing again reopens it', async () => {
      render(() => (
        <TestAutocomplete
          rootProps={{ autoHighlight: true }}
          items={[
            { value: 'alpha', label: 'alpha' },
            { value: 'alpine', label: 'alpine' },
            { value: 'beta', label: 'beta' },
          ]}
        />
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      input.focus();

      typeQuery(input, 'al');

      const firstOption = await screen.findByRole('option', { name: 'alpha' });
      expect(firstOption).toHaveAttribute('data-highlighted');

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input.value).toBe('alpha');

      await waitFor(() => expect(screen.queryByRole('listbox')).toBe(null));

      typeQuery(input, 'a');

      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBe(null));
    });
  });

  it('should handle browser autofill', async () => {
    render(() => (
      <Field.Root name="auto">
        <TestAutocomplete rootProps={{ defaultValue: '' }} />
      </Field.Root>
    ));

    // Hidden inputs are rendered without a name for selectionMode='none'; Field provides the
    // form input.
    const hidden = screen.getByRole('textbox', { hidden: true });
    fireEvent.change(hidden, { target: { value: 'Banana' } });

    // `selectionMode: 'none'` autofill applies the value via a queued microtask (mirrors upstream).
    const input = screen.getByTestId<HTMLInputElement>('input');
    await waitFor(() => expect(input.value).toBe('Banana'));
  });

  it('ignores hidden-input autofill when readOnly', async () => {
    const onValueChange = vi.fn();
    render(() => (
      <Field.Root name="auto">
        <TestAutocomplete rootProps={{ defaultValue: '', readOnly: true, onValueChange }} />
      </Field.Root>
    ));

    const hidden = screen.getByRole<HTMLInputElement>('textbox', { hidden: true });
    fireEvent.change(hidden, { target: { value: 'Banana' } });
    await Promise.resolve();

    const input = screen.getByTestId<HTMLInputElement>('input');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('ignores hidden-input autofill when disabled', async () => {
    const onValueChange = vi.fn();
    render(() => (
      <Field.Root name="auto">
        <TestAutocomplete rootProps={{ defaultValue: '', disabled: true, onValueChange }} />
      </Field.Root>
    ));

    const hidden = screen.getByRole<HTMLInputElement>('textbox', { hidden: true });
    fireEvent.change(hidden, { target: { value: 'Banana' } });
    await Promise.resolve();

    const input = screen.getByTestId<HTMLInputElement>('input');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('passes autoComplete straight through to the visible input as a native attribute', () => {
    render(() => (
      <TestAutocomplete
        rootProps={{ name: 'search' }}
        inputProps={{ autocomplete: 'on' } as any}
      />
    ));

    const input = screen.getByRole('combobox');
    const hiddenInput = screen.getByRole('textbox', { hidden: true });

    expect(input).toHaveAttribute('name', 'search');
    expect(input).toHaveAttribute('autocomplete', 'on');
    expect(hiddenInput).not.toHaveAttribute('name');
    expect(hiddenInput).toHaveAttribute('id');
  });

  it('does not expose data-placeholder on Trigger or InputGroup', () => {
    render(() => (
      <Autocomplete.Root items={['alpha', 'beta']} openOnInputClick>
        <Autocomplete.InputGroup data-testid="group">
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Trigger data-testid="trigger" />
        </Autocomplete.InputGroup>
        <Autocomplete.Portal>
          <Autocomplete.Positioner>
            <Autocomplete.Popup>
              <Autocomplete.List>
                {(item: string) => <Autocomplete.Item value={item}>{item}</Autocomplete.Item>}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
    ));

    const group = screen.getByTestId('group');
    const input = screen.getByTestId('input');
    const trigger = screen.getByTestId('trigger');

    expect(group).not.toHaveAttribute('data-placeholder');
    expect(trigger).not.toHaveAttribute('data-placeholder');

    typeQuery(input, 'al');

    expect(group).not.toHaveAttribute('data-placeholder');
    expect(trigger).not.toHaveAttribute('data-placeholder');
  });

  describe('prop: autoHighlight', () => {
    it('calls onItemHighlighted when the popup auto highlights on open', async () => {
      const onItemHighlighted = vi.fn();

      render(() => (
        <TestAutocomplete rootProps={{ autoHighlight: true, onItemHighlighted }} />
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');

      const firstOption = await screen.findByRole('option', { name: 'Apple' });
      expect(onItemHighlighted.mock.calls.length).toBeGreaterThan(0);

      const [value, eventDetails] = onItemHighlighted.mock.lastCall ?? [];
      expect(value).toBe('a');
      expect(eventDetails.reason).toBe('none');

      await waitFor(() => expect(firstOption).toHaveAttribute('data-highlighted'));
    });

    it('highlights the first item immediately when behavior is "always"', () => {
      render(() => (
        <TestAutocomplete rootProps={{ autoHighlight: 'always', defaultOpen: true }} />
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      const firstOption = screen.getByRole('option', { name: 'Apple' });

      expect(input).toHaveAttribute('aria-activedescendant', firstOption.id);
      expect(firstOption).toHaveAttribute('data-highlighted');
    });
  });

  describe('prop: keepHighlight', () => {
    it('keeps the current highlight when the pointer leaves the list', async () => {
      render(() => <TestAutocomplete rootProps={{ autoHighlight: true, keepHighlight: true }} />);

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');

      const apple = await screen.findByRole('option', { name: 'Apple' });
      await waitFor(() => expect(apple).toHaveAttribute('data-highlighted'));

      const outside = document.createElement('div');
      document.body.appendChild(outside);
      fireEvent.pointerLeave(apple, { pointerType: 'mouse', relatedTarget: outside });

      await waitFor(() => expect(apple).toHaveAttribute('data-highlighted'));
      outside.remove();
    });
  });

  describe('prop: mode', () => {
    it('mode="list" (default): no inline overlay, consumer-visible items are filtered', async () => {
      render(() => <TestAutocomplete rootProps={{ mode: 'list' }} />);

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2)); // Apple, Banana

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(input.value).toBe('a');
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('mode="both": inline overlay + autocomplete handles filtering', async () => {
      render(() => <TestAutocomplete rootProps={{ mode: 'both' }} />);

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2)); // Apple, Banana

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      await waitFor(() => expect(input.value).toBe('Apple'));
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });

    it('mode="both": hovering items should not change the inline overlay (preserve temporary value)', async () => {
      const user = userEvent.setup();
      render(() => (
        <TestAutocomplete
          rootProps={{ mode: 'both' }}
          items={[
            { value: 'alpha', label: 'alpha' },
            { value: 'alpine', label: 'alpine' },
            { value: 'beta', label: 'beta' },
          ]}
        />
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'al');

      fireEvent.keyDown(input, { key: 'ArrowDown' });
      await waitFor(() => expect(input.value).toBe('alpha'));

      // A real pointer hover fires a `pointermove` (which flips the "keyboard vs. pointer" reason
      // tracking `AutocompleteRoot` uses to ignore hover-driven highlight changes for the inline
      // overlay — see `ComboboxList.tsx`'s capture-phase listener) before `mousemove`; drive this
      // with `user-event`'s `hover`, which reproduces that full, correctly-ordered event sequence.
      await user.hover(screen.getByRole('option', { name: 'alpine' }));
      expect(input.value).toBe('alpha');
    });

    it('mode="inline": static items with inline overlay', async () => {
      render(() => <TestAutocomplete rootProps={{ mode: 'inline', openOnInputClick: true }} />);

      const input = screen.getByTestId<HTMLInputElement>('input');
      fireEvent.mouseDown(input);
      fireEvent.click(input);

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

      fireEvent.keyDown(input, { key: 'ArrowDown' });

      await waitFor(() => expect(input.value).toBe('Apple'));

      typeQuery(input, 'Appleb');

      expect(input.value).toBe('Appleb');
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });

    it('mode="none": static items without inline overlay', async () => {
      render(() => <TestAutocomplete rootProps={{ mode: 'none', openOnInputClick: true }} />);

      const input = screen.getByTestId<HTMLInputElement>('input');
      fireEvent.mouseDown(input);
      fireEvent.click(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(input.value).toBe('');
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));

      typeQuery(input, 'x');
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(input.value).toBe('x');
      expect(screen.getAllByRole('option')).toHaveLength(3);
    });
  });

  describe('prop: filter', () => {
    it('does not apply default filtering when filter is null', async () => {
      interface Movie {
        id: string;
        title: string;
      }

      const movies: Movie[] = [
        { id: '1', title: 'Pulp Fiction' },
        { id: '2', title: 'The Godfather' },
        { id: '3', title: 'The Dark Knight' },
      ];

      render(() => (
        <Autocomplete.Root items={movies} filter={null} itemToStringValue={(m: Movie) => m.title}>
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  {(movie: Movie) => (
                    <Autocomplete.Item value={movie}>{movie.title}</Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, '1994');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    });
  });

  describe('prop: submitOnItemClick', () => {
    it('prevents submit on Enter when an item is highlighted by default (false)', () => {
      let submitted = 0;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        submitted += 1;
      };

      render(() => (
        <form onSubmit={handleSubmit}>
          <Field.Root name="search">
            <TestAutocomplete rootProps={{ autoHighlight: true }} />
          </Field.Root>
        </form>
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(submitted).toBe(0);
    });

    it('when true, clicking with pointer submits the owning form', async () => {
      let submitValue: string | null = null;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        submitValue = data.get('q') as string | null;
      };

      render(() => (
        <form onSubmit={handleSubmit}>
          <Field.Root name="q">
            <TestAutocomplete rootProps={{ submitOnItemClick: true }} />
          </Field.Root>
        </form>
      ));

      const input = screen.getByTestId<HTMLInputElement>('input');
      typeQuery(input, 'a');

      const appleOption = await screen.findByRole('option', { name: 'Apple' });
      clickItem(appleOption);

      expect(submitValue).toBe('Apple');
    });
  });

  describe('Form', () => {
    it('submits the typed input value when wrapped in Field.Root', () => {
      let submitted: string | null = null;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        submitted = data.get('search') as string | null;
      };

      render(() => (
        <Form onSubmit={handleSubmit}>
          <Field.Root name="search">
            <TestAutocomplete />
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      const input = screen.getByTestId('input');
      typeQuery(input, 'hello world');
      fireEvent.click(screen.getByText('Submit'));

      expect(submitted).toBe('hello world');
    });

    it('submits the typed input value when name is provided on Autocomplete.Root', () => {
      let submitted: FormDataEntryValue | null = null;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        submitted = data.get('query');
      };

      render(() => (
        <Form onSubmit={handleSubmit}>
          <Field.Root name="query">
            <TestAutocomplete />
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      const input = screen.getByRole<HTMLInputElement>('combobox');
      typeQuery(input, 'apple');

      expect(input).toHaveAttribute('name', 'query');
      expect(input.value).toBe('apple');

      fireEvent.click(screen.getByText('Submit'));

      expect(submitted).toBe('apple');
    });

    it('submits the inline input value through native FormData', () => {
      let submitted: FormDataEntryValue | null = null;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        submitted = data.get('search');
      };

      render(() => (
        <Form onSubmit={handleSubmit}>
          <Field.Root name="search">
            <TestAutocomplete rootProps={{ inline: true, open: true }} />
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('name', 'search');

      const hiddenInput = screen.getByRole('textbox', { hidden: true });
      expect(hiddenInput).not.toHaveAttribute('name');

      typeQuery(input, 'ban');
      fireEvent.click(screen.getByText('Submit'));

      expect(submitted).toBe('ban');
    });

    it('triggers native validation when required and empty', () => {
      render(() => (
        <Form>
          <Field.Root name="auto" data-testid="field">
            <TestAutocomplete rootProps={{ required: true }} />
            <Field.Error match="valueMissing" data-testid="error">
              required
            </Field.Error>
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      expect(screen.queryByTestId('error')).toBe(null);

      fireEvent.click(screen.getByText('Submit'));

      const error = screen.getByTestId('error');
      expect(error).toHaveTextContent('required');
    });

    it('clears external errors on change', () => {
      render(() => (
        <Form errors={{ autocomplete: 'test' }}>
          <Field.Root name="autocomplete">
            <TestAutocomplete />
            <Field.Error data-testid="error" />
          </Field.Root>
        </Form>
      ));

      expect(screen.getByTestId('error')).toHaveTextContent('test');

      const input = screen.getByTestId('input');
      expect(input).toHaveAttribute('aria-invalid', 'true');

      typeQuery(input, 'test input');

      expect(screen.queryByTestId('error')).toBe(null);
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('submits the input value directly (not a selection value)', () => {
      let submitted: string | null = null;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget as HTMLFormElement);
        submitted = data.get('search') as string;
      };

      render(() => (
        <Form onSubmit={handleSubmit}>
          <Field.Root name="search">
            <TestAutocomplete />
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      const input = screen.getByTestId('input');
      // Type something that doesn't exactly match any option.
      typeQuery(input, 'appl');
      fireEvent.click(screen.getByText('Submit'));

      expect(submitted).toBe('appl');
    });

    it('Enter submits when no item is highlighted', async () => {
      let submitted = 0;
      const handleSubmit = (event: SubmitEvent) => {
        event.preventDefault();
        submitted += 1;
      };
      const user = userEvent.setup();

      render(() => (
        <Form onSubmit={handleSubmit}>
          <Field.Root name="search">
            <TestAutocomplete rootProps={{ openOnInputClick: true }} />
          </Field.Root>
          <button type="submit">Submit</button>
        </Form>
      ));

      const input = screen.getByRole('combobox');
      // `ComboboxInput`'s Enter handler only closes the popup and does not call
      // `preventDefault`/`stopEvent` when nothing is highlighted, relying on the browser's native
      // "Enter submits the form" default action — `fireEvent.keyDown` doesn't simulate that
      // default action in jsdom, so drive this with `user-event`, which does.
      await user.click(input);
      await user.keyboard('{Enter}');

      expect(submitted).toBe(1);
    });
  });

  describe('object item stringification', () => {
    it('filters and displays using label for {label} objects', async () => {
      const items = [{ label: 'United States' }, { label: 'Canada' }, { label: 'Australia' }];

      render(() => (
        <Autocomplete.Root items={items}>
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  {(item: { label: string }) => (
                    <Autocomplete.Item value={item}>{item.label}</Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const input = screen.getByTestId('input');
      typeQuery(input, 'can');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(screen.getByRole('option', { name: 'Canada' })).not.toBe(null);
    });

    it('uses itemToStringValue when object lacks label', async () => {
      const items = [{ country: 'United States' }, { country: 'Canada' }, { country: 'Australia' }];

      render(() => (
        <Autocomplete.Root items={items} itemToStringValue={(i: any) => i.country}>
          <Autocomplete.Input data-testid="input" />
          <Autocomplete.Portal>
            <Autocomplete.Positioner>
              <Autocomplete.Popup>
                <Autocomplete.List>
                  {(item: { country: string }) => (
                    <Autocomplete.Item value={item}>{item.country}</Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      ));

      const input = screen.getByTestId('input');
      typeQuery(input, 'can');

      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
      expect(screen.getByRole('option', { name: 'Canada' })).not.toBe(null);
    });
  });

  describe('Field', () => {
    it('sets `required` on the visible input', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete rootProps={{ required: true }} />
        </Field.Root>
      ));

      expect(screen.getByTestId('input')).toHaveAttribute('required');
    });

    it('[data-touched]', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete />
        </Field.Root>
      ));

      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('data-touched');

      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(input).toHaveAttribute('data-touched', '');
    });

    it('[data-dirty]', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete />
        </Field.Root>
      ));

      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('data-dirty');

      typeQuery(input, 'test');

      expect(input).toHaveAttribute('data-dirty', '');
    });

    describe('[data-filled]', () => {
      it('adds [data-filled] attribute when input has content', () => {
        render(() => (
          <Field.Root>
            <TestAutocomplete />
          </Field.Root>
        ));

        const input = screen.getByTestId('input');
        expect(input).not.toHaveAttribute('data-filled');

        typeQuery(input, 'test input');

        expect(input).toHaveAttribute('data-filled', '');
      });

      it('adds [data-filled] attribute when already filled with defaultValue', () => {
        render(() => (
          <Field.Root>
            <TestAutocomplete rootProps={{ defaultValue: 'initial value' }} />
          </Field.Root>
        ));

        expect(screen.getByTestId('input')).toHaveAttribute('data-filled');
      });
    });

    it('[data-focused]', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete />
        </Field.Root>
      ));

      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('data-focused');

      fireEvent.focus(input);
      expect(input).toHaveAttribute('data-focused', '');

      fireEvent.blur(input);
      expect(input).not.toHaveAttribute('data-focused');
    });

    it('[data-invalid]', () => {
      render(() => (
        <Field.Root invalid>
          <TestAutocomplete />
        </Field.Root>
      ));

      expect(screen.getByTestId('input')).toHaveAttribute('data-invalid', '');
    });

    it('prop: validate', () => {
      render(() => (
        <Field.Root validationMode="onBlur" validate={() => 'error'}>
          <TestAutocomplete />
        </Field.Root>
      ));

      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('aria-invalid');

      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('prop: validationMode=onSubmit', () => {
      render(() => (
        <Form>
          <Field.Root
            validate={(value) => (value === 'one' ? 'error' : null)}
          >
            <TestAutocomplete rootProps={{ required: true }} />
          </Field.Root>
          <button type="submit">submit</button>
        </Form>
      ));

      const input = screen.getByTestId('input');
      expect(input).not.toHaveAttribute('aria-invalid');

      fireEvent.click(screen.getByText('submit'));
      expect(input).toHaveAttribute('aria-invalid', 'true');

      typeQuery(input, 'two');
      expect(input).not.toHaveAttribute('aria-invalid');

      typeQuery(input, 'one');
      expect(input).toHaveAttribute('aria-invalid', 'true');

      typeQuery(input, 'three');
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('Field.Label', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete />
          <Field.Label data-testid="label" as="span" nativeLabel={false} />
        </Field.Root>
      ));

      expect(screen.getByTestId('input')).toHaveAttribute(
        'aria-labelledby',
        screen.getByTestId('label').id,
      );
    });

    it('Field.Description', () => {
      render(() => (
        <Field.Root>
          <TestAutocomplete />
          <Field.Description data-testid="description" />
        </Field.Root>
      ));

      expect(screen.getByTestId('input')).toHaveAttribute(
        'aria-describedby',
        screen.getByTestId('description').id,
      );
    });
  });
});
