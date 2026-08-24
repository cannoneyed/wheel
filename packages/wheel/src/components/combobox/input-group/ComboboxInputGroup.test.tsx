// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.InputGroup />', () => {
  it('renders role=group', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.InputGroup data-testid="group">
          <Combobox.Input data-testid="input" />
        </Combobox.InputGroup>
      </Combobox.Root>
    ));
    expect(screen.getByTestId('group')).toHaveAttribute('role', 'group');
  });

  it('focuses the input when the group (but not an interactive descendant) is pressed', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.InputGroup data-testid="group">
          <Combobox.Input data-testid="input" />
        </Combobox.InputGroup>
      </Combobox.Root>
    ));
    const group = screen.getByTestId('group');
    const input = screen.getByTestId('input') as HTMLInputElement;
    fireEvent.mouseDown(group);
    expect(document.activeElement).toBe(input);
  });
});
