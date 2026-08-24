// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function MultiCombobox(props: { defaultValue?: string[] }) {
  return (
    <Combobox.Root items={['a', 'b', 'c']} multiple defaultValue={props.defaultValue ?? []}>
      <Combobox.Chips data-testid="chips">
        <Combobox.Value>
          {(value: string[]) =>
            value.map((v) => (
              <Combobox.Chip data-testid={`chip-${v}`}>
                {v}
                <Combobox.ChipRemove data-testid={`chip-remove-${v}`} />
              </Combobox.Chip>
            ))
          }
        </Combobox.Value>
      </Combobox.Chips>
      <Combobox.Input data-testid="input" />
    </Combobox.Root>
  );
}

describe('<Combobox.Chips />', () => {
  it('does not set role="toolbar" when there are no chips', () => {
    render(() => <MultiCombobox />);
    expect(screen.getByTestId('chips')).not.toHaveAttribute('role');
  });

  it('sets role="toolbar" when there is at least one chip', () => {
    render(() => <MultiCombobox defaultValue={['a']} />);
    expect(screen.getByTestId('chips')).toHaveAttribute('role', 'toolbar');
  });

  it('focuses the input when clicking anywhere in the chips area', () => {
    render(() => <MultiCombobox defaultValue={['a']} />);
    const chips = screen.getByTestId('chips');
    const input = screen.getByTestId('input') as HTMLInputElement;
    fireEvent.mouseDown(chips);
    expect(document.activeElement).toBe(input);
  });

  it('lets onMouseDown prevent the built-in focus and open behavior', () => {
    // Base UI's own event-cancellation convention (`event.preventBaseUIHandler()`), not the
    // native `event.preventDefault()` — handlers merged via `mergeProps` chain right-to-left and
    // only the former stops an earlier (built-in) handler from running; see CONVENTIONS.md.
    render(() => (
      <Combobox.Root items={['a', 'b']} multiple defaultValue={['a']}>
        <Combobox.Chips
          data-testid="chips"
          onMouseDown={(event: any) => event.preventBaseUIHandler()}
        />
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    const chips = screen.getByTestId('chips');
    const input = screen.getByTestId('input') as HTMLInputElement;
    fireEvent.mouseDown(chips);
    expect(document.activeElement).not.toBe(input);
  });

  it('renders one chip per selected value', () => {
    render(() => <MultiCombobox defaultValue={['a', 'b']} />);
    expect(screen.getByTestId('chip-a')).toBeInTheDocument();
    expect(screen.getByTestId('chip-b')).toBeInTheDocument();
  });

  it('removes a chip when its ChipRemove button is clicked', () => {
    const onValueChange = vi.fn();
    render(() => (
      <Combobox.Root items={['a', 'b']} multiple defaultValue={['a', 'b']} onValueChange={onValueChange}>
        <Combobox.Chips data-testid="chips">
          <Combobox.Chip data-testid="chip-a">
            a
            <Combobox.ChipRemove data-testid="remove-a" />
          </Combobox.Chip>
        </Combobox.Chips>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    fireEvent.click(screen.getByTestId('remove-a'));
    expect(onValueChange).toHaveBeenCalledWith(['b'], expect.anything());
  });
});
