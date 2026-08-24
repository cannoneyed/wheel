// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

function Fixture(props: { onValueChange?: (value: string[]) => void }) {
  return (
    <Combobox.Root items={['a', 'b']} multiple defaultValue={['a', 'b']} onValueChange={props.onValueChange}>
      <Combobox.Chips data-testid="chips">
        <Combobox.Chip data-testid="chip-a">a</Combobox.Chip>
        <Combobox.Chip data-testid="chip-b">b</Combobox.Chip>
      </Combobox.Chips>
      <Combobox.Input data-testid="input" />
    </Combobox.Root>
  );
}

describe('<Combobox.Chip />', () => {
  it('renders with tabIndex=-1 (not directly tabbable)', () => {
    render(() => <Fixture />);
    expect(screen.getByTestId('chip-a')).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves the highlighted chip forward and ArrowLeft moves it back', () => {
    render(() => <Fixture />);
    const chipA = screen.getByTestId('chip-a');
    chipA.focus();
    fireEvent.keyDown(chipA, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('chip-b'));

    fireEvent.keyDown(screen.getByTestId('chip-b'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(chipA);
  });

  it('Backspace removes the focused chip and moves selection appropriately', () => {
    const onValueChange = vi.fn();
    render(() => <Fixture onValueChange={onValueChange} />);
    const chipA = screen.getByTestId('chip-a');
    chipA.focus();
    fireEvent.keyDown(chipA, { key: 'Backspace' });
    expect(onValueChange).toHaveBeenCalledWith(['b'], expect.anything());
  });
});
