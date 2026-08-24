// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Label />', () => {
  it('associates with the trigger when the input renders inside the popup', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.Label data-testid="label">Fruit</Combobox.Label>
        <Combobox.Trigger data-testid="trigger" />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.Input data-testid="input" />
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    ));
    const label = screen.getByTestId('label');
    const trigger = screen.getByTestId('trigger');
    expect(label).toHaveAttribute('id');
    expect(trigger).toHaveAttribute('aria-labelledby', label.id);
  });

  it('renders a <div> by default', () => {
    render(() => (
      <Combobox.Root items={['a']}>
        <Combobox.Label data-testid="label">Fruit</Combobox.Label>
        <Combobox.Input data-testid="input" />
      </Combobox.Root>
    ));
    expect(screen.getByTestId('label').tagName).toBe('DIV');
  });
});
