// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Progress } from './index';

describe('<Progress.Root />', () => {
  it('renders a div with role="progressbar"', () => {
    const { getByRole } = render(() => <Progress.Root value={50} />);
    expect(getByRole('progressbar').tagName).toBe('DIV');
  });

  describe('ARIA attributes', () => {
    it('sets the correct aria attributes', () => {
      const { getByRole, getByText } = render(() => (
        <Progress.Root value={30}>
          <Progress.Label>Downloading</Progress.Label>
          <Progress.Value />
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
        </Progress.Root>
      ));

      const progressbar = getByRole('progressbar');
      const label = getByText('Downloading');

      expect(progressbar).toHaveAttribute('aria-valuenow', '30');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '100');
      expect(progressbar).toHaveAttribute(
        'aria-valuetext',
        (0.3).toLocaleString(undefined, { style: 'percent' }),
      );
      expect(progressbar.getAttribute('aria-labelledby')).toBe(label.getAttribute('id'));
    });

    it('updates aria-valuenow when value changes', () => {
      const [value, setValue] = createSignal(50);

      const { getByRole } = render(() => (
        <Progress.Root value={value()}>
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
        </Progress.Root>
      ));
      const progressbar = getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '50');
      setValue(77);
      expect(progressbar).toHaveAttribute('aria-valuenow', '77');
    });

    it('marks status data attributes', () => {
      const { getByRole } = render(() => <Progress.Root value={100} />);
      expect(getByRole('progressbar')).toHaveAttribute('data-complete', '');
    });

    it('marks indeterminate status when value is null', () => {
      const { getByRole } = render(() => <Progress.Root value={null} />);
      const progressbar = getByRole('progressbar');
      expect(progressbar).toHaveAttribute('data-indeterminate', '');
      expect(progressbar).toHaveAttribute('aria-valuetext', 'indeterminate progress');
      expect(progressbar).not.toHaveAttribute('aria-valuenow');
    });
  });

  describe('range', () => {
    it('normalizes the formatted value, aria-valuetext, and indicator within a custom range', () => {
      const expected = (0.5).toLocaleString(undefined, { style: 'percent' });

      const { getByRole, getByTestId } = render(() => (
        <Progress.Root min={20} max={40} value={30}>
          <Progress.Value data-testid="value" />
          <Progress.Track>
            <Progress.Indicator data-testid="indicator" />
          </Progress.Track>
        </Progress.Root>
      ));

      const progressbar = getByRole('progressbar');
      expect(getByTestId('indicator').style.width).toBe('50%');
      expect(getByTestId('value')).toHaveTextContent(expected);
      expect(progressbar).toHaveAttribute('aria-valuetext', expected);
    });

    it('clamps aria-valuenow, the value text, and the indicator when the value overshoots max', () => {
      const expected = (1).toLocaleString(undefined, { style: 'percent' });

      const { getByRole, getByTestId } = render(() => (
        <Progress.Root min={0} max={40} value={50}>
          <Progress.Value data-testid="value" />
          <Progress.Track>
            <Progress.Indicator data-testid="indicator" />
          </Progress.Track>
        </Progress.Root>
      ));

      const progressbar = getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '40');
      expect(progressbar).toHaveAttribute('aria-valuemax', '40');
      expect(progressbar).toHaveAttribute('aria-valuetext', expected);
      expect(getByTestId('value')).toHaveTextContent(expected);
      expect(getByTestId('indicator').style.width).toBe('100%');
    });

    it('normalizes aria attributes when min equals max', () => {
      const expected = (0).toLocaleString(undefined, { style: 'percent' });

      const { getByRole, getByTestId } = render(() => (
        <Progress.Root min={5} max={5} value={5}>
          <Progress.Value data-testid="value" />
          <Progress.Track>
            <Progress.Indicator data-testid="indicator" />
          </Progress.Track>
        </Progress.Root>
      ));

      const progressbar = getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '5');
      expect(progressbar).toHaveAttribute('aria-valuetext', expected);
      expect(getByTestId('value')).toHaveTextContent(expected);
      expect(getByTestId('indicator').style.width).toBe('0%');
    });
  });

  describe('prop: format', () => {
    it('formats the value', () => {
      const format: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
      function formatValue(v: number) {
        return new Intl.NumberFormat(undefined, format).format(v);
      }

      const { getByRole, getByTestId } = render(() => (
        <Progress.Root value={30} format={format}>
          <Progress.Value data-testid="value" />
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
        </Progress.Root>
      ));

      expect(getByTestId('value')).toHaveTextContent(formatValue(30));
      expect(getByRole('progressbar')).toHaveAttribute('aria-valuetext', formatValue(30));
    });
  });

  describe('prop: locale', () => {
    it('sets the locale when formatting the value', () => {
      const expectedValue = new Intl.NumberFormat('de-DE').format(70.51);

      const { getByTestId } = render(() => (
        <Progress.Root
          value={70.51}
          format={{ style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
          locale="de-DE"
        >
          <Progress.Value data-testid="value" />
        </Progress.Root>
      ));

      expect(getByTestId('value')).toHaveTextContent(expectedValue);
    });
  });
});

describe('<Progress.Value />', () => {
  describe('prop: children', () => {
    it('renders the value when children is not provided', () => {
      const { getByTestId } = render(() => (
        <Progress.Root value={30}>
          <Progress.Value data-testid="value" />
        </Progress.Root>
      ));

      expect(getByTestId('value')).toHaveTextContent(
        (0.3).toLocaleString(undefined, { style: 'percent' }),
      );
    });

    it('accepts a render function receiving formatted value and raw value', () => {
      const renderSpy = vi.fn(() => <span>rendered</span>);
      const format: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD' };
      function formatValue(v: number) {
        return new Intl.NumberFormat(undefined, format).format(v);
      }

      render(() => (
        <Progress.Root value={30} format={format}>
          <Progress.Value data-testid="value">{renderSpy}</Progress.Value>
        </Progress.Root>
      ));

      expect(renderSpy.mock.lastCall?.[0]).toEqual(formatValue(30));
      expect(renderSpy.mock.lastCall?.[1]).toEqual(30);
    });

    it('passes "indeterminate" and null value when the progress is indeterminate', () => {
      const renderSpy = vi.fn(() => <span>rendered</span>);

      render(() => (
        <Progress.Root value={null}>
          <Progress.Value data-testid="value">{renderSpy}</Progress.Value>
        </Progress.Root>
      ));

      expect(renderSpy.mock.lastCall?.[0]).toEqual('indeterminate');
      expect(renderSpy.mock.lastCall?.[1]).toEqual(null);
    });
  });
});

describe('<Progress.Track />', () => {
  it('inherits status data attributes from the root', () => {
    const { getByTestId } = render(() => (
      <Progress.Root value={100}>
        <Progress.Track data-testid="track" />
      </Progress.Root>
    ));

    expect(getByTestId('track')).toHaveAttribute('data-complete', '');
  });
});

describe('<Progress.Indicator />', () => {
  it('sets zero width when value is 0', () => {
    const { getByTestId } = render(() => (
      <Progress.Root value={0}>
        <Progress.Track>
          <Progress.Indicator data-testid="indicator" />
        </Progress.Track>
      </Progress.Root>
    ));

    expect(getByTestId('indicator').style.width).toBe('0%');
  });

  it('leaves width unset while indeterminate', () => {
    const { getByTestId } = render(() => (
      <Progress.Root value={null}>
        <Progress.Track>
          <Progress.Indicator data-testid="indicator" />
        </Progress.Track>
      </Progress.Root>
    ));

    expect(getByTestId('indicator').style.width).toBe('');
  });
});

describe('<Progress.Label />', () => {
  it('renders with role="presentation" and registers its id on the root', () => {
    const { getByRole, getByText } = render(() => (
      <Progress.Root value={40}>
        <Progress.Label>Downloading</Progress.Label>
      </Progress.Root>
    ));

    const label = getByText('Downloading');
    expect(label).toHaveAttribute('role', 'presentation');
    expect(getByRole('progressbar').getAttribute('aria-labelledby')).toBe(
      label.getAttribute('id'),
    );
  });
});
