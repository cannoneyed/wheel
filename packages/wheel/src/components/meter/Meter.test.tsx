// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Meter } from './index';

function formatPercent(value: number) {
  return value.toLocaleString(undefined, { style: 'percent' });
}

describe('<Meter.Root />', () => {
  it('renders a div with role="meter"', () => {
    const { getByRole } = render(() => <Meter.Root value={50} />);
    expect(getByRole('meter').tagName).toBe('DIV');
  });

  describe('ARIA attributes', () => {
    it('sets the correct aria attributes', () => {
      const { getByRole, getByText } = render(() => (
        <Meter.Root value={30}>
          <Meter.Label>Battery Level</Meter.Label>
          <Meter.Track>
            <Meter.Indicator />
          </Meter.Track>
        </Meter.Root>
      ));

      const meter = getByRole('meter');
      expect(meter).toHaveAttribute('aria-valuenow', '30');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '100');
      expect(meter).toHaveAttribute('aria-valuetext', formatPercent(0.3));
      expect(meter.getAttribute('aria-labelledby')).toBe(
        getByText('Battery Level').getAttribute('id'),
      );
    });

    it('refreshes aria-valuenow, aria-valuetext, the value text, and the indicator when value changes', () => {
      const [value, setValue] = createSignal(50);
      const fiftyPercent = formatPercent(0.5);
      const seventySevenPercent = formatPercent(0.77);

      const { getByRole, getByTestId } = render(() => (
        <Meter.Root value={value()}>
          <Meter.Value data-testid="value" />
          <Meter.Track>
            <Meter.Indicator data-testid="indicator" />
          </Meter.Track>
        </Meter.Root>
      ));
      const meter = getByRole('meter');

      expect(meter).toHaveAttribute('aria-valuenow', '50');
      expect(meter).toHaveAttribute('aria-valuetext', fiftyPercent);
      expect(getByTestId('value').textContent).toBe(fiftyPercent);
      expect(getByTestId('indicator').style.width).toBe('50%');

      setValue(77);

      expect(meter).toHaveAttribute('aria-valuenow', '77');
      expect(meter).toHaveAttribute('aria-valuetext', seventySevenPercent);
      expect(getByTestId('value').textContent).toBe(seventySevenPercent);
      expect(getByTestId('indicator').style.width).toBe('77%');
    });
  });

  describe('prop: getAriaValueText', () => {
    it('uses the returned text and receives the formatted and raw value', () => {
      const formatted = formatPercent(0.3);
      const getAriaValueText = vi.fn(
        (formattedValue: string, value: number) => `${value} of 100 (${formattedValue})`,
      );

      const { getByRole, getByTestId } = render(() => (
        <Meter.Root value={30} getAriaValueText={getAriaValueText}>
          <Meter.Value data-testid="value" />
        </Meter.Root>
      ));

      const meter = getByRole('meter');
      expect(getAriaValueText).toHaveBeenCalledWith(formatted, 30);
      expect(meter).toHaveAttribute('aria-valuetext', `30 of 100 (${formatted})`);
      // getAriaValueText only affects the spoken text, not the visible value.
      expect(getByTestId('value').textContent).toBe(formatted);
    });
  });

  describe('range', () => {
    it.each([
      { label: 'value exceeds max', props: { value: 150 }, ariaValueNow: '100', ariaValueText: formatPercent(1) },
      { label: 'value is below min', props: { value: -10 }, ariaValueNow: '0', ariaValueText: formatPercent(0) },
      {
        label: 'min equals max',
        props: { value: 5, min: 5, max: 5 },
        ariaValueNow: '5',
        ariaValueText: formatPercent(0),
      },
      {
        label: 'value is NaN',
        props: { value: Number.NaN },
        ariaValueNow: '0',
        ariaValueText: formatPercent(0),
      },
    ] as const)(
      'normalizes aria attributes when $label',
      ({ props, ariaValueNow, ariaValueText }) => {
        const { getByRole } = render(() => <Meter.Root {...props} />);

        const meter = getByRole('meter');
        expect(meter).toHaveAttribute('aria-valuenow', ariaValueNow);
        expect(meter).toHaveAttribute('aria-valuetext', ariaValueText);
      },
    );
  });

  describe('prop: format', () => {
    it('formats the raw value while clamping range attributes and indicator width', () => {
      const format: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
      const expectedValue = new Intl.NumberFormat(undefined, format).format(150);

      const { getByRole, getByTestId } = render(() => (
        <Meter.Root value={150} format={format}>
          <Meter.Value data-testid="value" />
          <Meter.Track>
            <Meter.Indicator data-testid="indicator" />
          </Meter.Track>
        </Meter.Root>
      ));

      const meter = getByRole('meter');
      expect(getByTestId('value').textContent).toBe(expectedValue);
      expect(meter).toHaveAttribute('aria-valuenow', '100');
      expect(meter).toHaveAttribute('aria-valuetext', expectedValue);
      expect(getByTestId('indicator').style.width).toBe('100%');
    });
  });

  describe('prop: locale', () => {
    it('sets the locale when formatting the value', () => {
      const expectedValue = new Intl.NumberFormat('de-DE').format(86.49);

      const { getByTestId } = render(() => (
        <Meter.Root
          value={86.49}
          format={{ style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          locale="de-DE"
        >
          <Meter.Value data-testid="value" />
        </Meter.Root>
      ));

      expect(getByTestId('value').textContent).toBe(expectedValue);
    });
  });
});

describe('<Meter.Value />', () => {
  it('renders the value when children is not provided', () => {
    const { getByTestId } = render(() => (
      <Meter.Root value={30}>
        <Meter.Value data-testid="value" />
      </Meter.Root>
    ));

    expect(getByTestId('value').textContent).toBe((0.3).toLocaleString(undefined, { style: 'percent' }));
  });

  it('accepts a render function and passes updated arguments when value changes', () => {
    const renderSpy = vi.fn(() => <span>rendered</span>);
    const [value, setValue] = createSignal(30);

    render(() => (
      <Meter.Root value={value()}>
        <Meter.Value>{renderSpy}</Meter.Value>
      </Meter.Root>
    ));

    expect(renderSpy.mock.lastCall?.[0]).toEqual((0.3).toLocaleString(undefined, { style: 'percent' }));
    expect(renderSpy.mock.lastCall?.[1]).toEqual(30);

    setValue(60);

    expect(renderSpy.mock.lastCall?.[0]).toEqual((0.6).toLocaleString(undefined, { style: 'percent' }));
    expect(renderSpy.mock.lastCall?.[1]).toEqual(60);
  });
});

describe('<Meter.Indicator />', () => {
  it('clamps the width to 100% when the value exceeds max', () => {
    const { getByTestId } = render(() => (
      <Meter.Root value={150}>
        <Meter.Track>
          <Meter.Indicator data-testid="indicator" />
        </Meter.Track>
      </Meter.Root>
    ));

    expect(getByTestId('indicator').style.width).toBe('100%');
  });

  it('clamps the width to 0% when the value is below min', () => {
    const { getByTestId } = render(() => (
      <Meter.Root value={-10}>
        <Meter.Track>
          <Meter.Indicator data-testid="indicator" />
        </Meter.Track>
      </Meter.Root>
    ));

    expect(getByTestId('indicator').style.width).toBe('0%');
  });
});

describe('<Meter.Label />', () => {
  it('renders with role="presentation" and registers its id on the root', () => {
    const { getByRole, getByText } = render(() => (
      <Meter.Root value={50}>
        <Meter.Label>Battery Level</Meter.Label>
      </Meter.Root>
    ));

    const label = getByText('Battery Level');
    expect(label).toHaveAttribute('role', 'presentation');
    expect(getByRole('meter').getAttribute('aria-labelledby')).toBe(label.getAttribute('id'));
  });
});
