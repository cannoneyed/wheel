// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import { Slider } from '../index';

afterEach(cleanup);

describe('<Slider.Value />', () => {
  it('renders a single value', () => {
    const { getByTestId } = render(() => (
      <Slider.Root defaultValue={30}>
        <Slider.Value data-testid="value" />
        <Slider.Control>
          <Slider.Thumb />
        </Slider.Control>
      </Slider.Root>
    ));

    expect(getByTestId('value')).toHaveTextContent('30');
  });

  it('renders a range as an en dash-separated string', () => {
    const { getByTestId } = render(() => (
      <Slider.Root defaultValue={[20, 50]}>
        <Slider.Value data-testid="value" />
        <Slider.Control>
          <Slider.Thumb index={0} />
          <Slider.Thumb index={1} />
        </Slider.Control>
      </Slider.Root>
    ));

    expect(getByTestId('value')).toHaveTextContent('20 – 50');
  });

  it('accepts a render function receiving formatted values and raw values', () => {
    const { getByTestId } = render(() => (
      <Slider.Root defaultValue={[20, 50]}>
        <Slider.Value data-testid="value">
          {(formattedValues, values) => `${formattedValues.join('/')} (${values.join(',')})`}
        </Slider.Value>
        <Slider.Control>
          <Slider.Thumb index={0} />
          <Slider.Thumb index={1} />
        </Slider.Control>
      </Slider.Root>
    ));

    expect(getByTestId('value')).toHaveTextContent('20/50 (20,50)');
  });

  it('formats the value using the format option', () => {
    const format: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
    const expected = new Intl.NumberFormat(undefined, format).format(50);

    const { getByTestId } = render(() => (
      <Slider.Root defaultValue={50} format={format}>
        <Slider.Value data-testid="value" />
        <Slider.Control>
          <Slider.Thumb />
        </Slider.Control>
      </Slider.Root>
    ));

    expect(getByTestId('value')).toHaveTextContent(expected);
  });
});
