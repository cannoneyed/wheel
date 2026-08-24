// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Status />', () => {
  it('renders role=status with a polite, atomic live region', () => {
    render(() => (
      <Combobox.Root items={['a', 'b']}>
        <Combobox.Input />
        <Combobox.Status data-testid="status">Loaded 2 results</Combobox.Status>
      </Combobox.Root>
    ));
    const status = screen.getByTestId('status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveTextContent('Loaded 2 results');
  });
});
