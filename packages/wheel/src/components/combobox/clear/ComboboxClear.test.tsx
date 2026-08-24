// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

describe('<Combobox.Clear />', () => {
  it('is not rendered when there is no value and keepMounted is false', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.Input data-testid="input" />
        <Combobox.Clear data-testid="clear" />
      </Combobox.Root>
    ));
    expect(screen.queryByTestId('clear')).not.toBeInTheDocument();
  });

  it('is rendered once a value is selected', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultValue="a">
        <Combobox.Input data-testid="input" />
        <Combobox.Clear data-testid="clear" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('clear')).toBeInTheDocument();
  });

  it('clears the selected value and input on click', () => {
    const onValueChange = vi.fn();
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultValue="a" onValueChange={onValueChange}>
        <Combobox.Input data-testid="input" />
        <Combobox.Clear data-testid="clear" />
      </Combobox.Root>
    ));
    fireEvent.click(screen.getByTestId('clear'));
    expect(onValueChange).toHaveBeenCalledWith(null, expect.anything());
  });

  it('remains mounted when keepMounted is true', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.Input data-testid="input" />
        <Combobox.Clear data-testid="clear" keepMounted />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('clear')).toBeInTheDocument();
  });
});
