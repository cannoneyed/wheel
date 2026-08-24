// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Value />', () => {
  it('renders the placeholder when no value is selected', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <div data-testid="value">
          <Combobox.Value placeholder="Choose a fruit" />
        </div>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('value')).toHaveTextContent('Choose a fruit');
  });

  it('renders the resolved label of the selected value', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultValue="b">
        <div data-testid="value">
          <Combobox.Value />
        </div>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('value')).toHaveTextContent('b');
  });

  it('supports a render function receiving the current value', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']} defaultValue="a">
        <div data-testid="value">
          <Combobox.Value>{(value: string) => `selected:${value}`}</Combobox.Value>
        </div>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('value')).toHaveTextContent('selected:a');
  });

  it('joins multiple selected labels with a comma in multiple mode', () => {
    render(() => (
      <Combobox.Root items={['a', 'b', 'c']} multiple defaultValue={['a', 'c']}>
        <div data-testid="value">
          <Combobox.Value />
        </div>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('value')).toHaveTextContent('a, c');
  });
});
