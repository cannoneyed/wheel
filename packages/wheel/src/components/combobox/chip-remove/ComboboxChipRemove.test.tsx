// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

function Fixture(props: { onValueChange?: (value: string[]) => void }) {
  return (
    <Combobox.Root
      items={['a', 'b']}
      multiple
      defaultValue={['a', 'b']}
      onValueChange={props.onValueChange}
    >
      <Combobox.Chips data-testid="chips">
        <Combobox.Chip data-testid="chip-a">
          a
          <Combobox.ChipRemove data-testid="remove-a" />
        </Combobox.Chip>
        <Combobox.Chip data-testid="chip-b">
          b
          <Combobox.ChipRemove data-testid="remove-b" />
        </Combobox.Chip>
      </Combobox.Chips>
      <Combobox.Input data-testid="input" />
    </Combobox.Root>
  );
}

describe('<Combobox.ChipRemove />', () => {
  it('renders a native button', () => {
    render(() => <Fixture />);
    expect(screen.getByTestId('remove-a').tagName).toBe('BUTTON');
  });

  it('removes the corresponding chip value on click', () => {
    const onValueChange = vi.fn();
    render(() => <Fixture onValueChange={onValueChange} />);
    fireEvent.click(screen.getByTestId('remove-b'));
    expect(onValueChange).toHaveBeenCalledWith(['a'], expect.anything());
  });

  it('removes the corresponding chip value on Enter', () => {
    const onValueChange = vi.fn();
    render(() => <Fixture onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByTestId('remove-a'), { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith(['b'], expect.anything());
  });

  it('focuses the input after removing a chip', () => {
    render(() => <Fixture />);
    fireEvent.click(screen.getByTestId('remove-a'));
    expect(document.activeElement).toBe(screen.getByTestId('input'));
  });
});
