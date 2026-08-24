// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { Slider } from '../index';

afterEach(cleanup);

describe('<Slider.Label />', () => {
  it('associates itself with the slider thumb via aria-labelledby', () => {
    const { getByTestId, getByRole } = render(() => (
      <Slider.Root defaultValue={30}>
        <Slider.Label data-testid="label">Volume</Slider.Label>
        <Slider.Control>
          <Slider.Thumb />
        </Slider.Control>
      </Slider.Root>
    ));

    const label = getByTestId('label');
    const slider = getByRole('slider');

    expect(label.id).not.toBe('');
    expect(slider).toHaveAttribute('aria-labelledby', label.id);
  });

  it('focuses the thumb when clicked', () => {
    const { getByTestId, getByRole } = render(() => (
      <Slider.Root defaultValue={30}>
        <Slider.Label data-testid="label">Volume</Slider.Label>
        <Slider.Control>
          <Slider.Thumb />
        </Slider.Control>
      </Slider.Root>
    ));

    const label = getByTestId('label');
    const slider = getByRole('slider');

    label.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(slider).toHaveFocus();
  });
});
