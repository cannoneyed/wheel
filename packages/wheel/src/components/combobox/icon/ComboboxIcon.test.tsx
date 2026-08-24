// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Combobox } from '../index';

afterEach(cleanup);

describe('<Combobox.Icon />', () => {
  it('renders a span with aria-hidden', () => {
    render(() => (
      <Combobox.Root items={['a']}>
        <Combobox.Input />
        <Combobox.Icon data-testid="icon" />
      </Combobox.Root>
    ));
    const icon = screen.getByTestId('icon');
    expect(icon.tagName).toBe('SPAN');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
