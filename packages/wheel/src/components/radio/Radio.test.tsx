// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { Radio } from './index';
import { RadioGroup } from '../radio-group';

describe('<Radio.Root />', () => {
  it('renders a span with role="radio" and a hidden radio input', () => {
    const { getByRole, container } = render(() => <Radio.Root value="" />);
    const radio = getByRole('radio');
    expect(radio.tagName).toBe('SPAN');
    const input = container.querySelector('input[type="radio"]')!;
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('does not forward the `value` prop to the rendered element', () => {
    const { getByTestId } = render(() => (
      <RadioGroup>
        <Radio.Root value="test" data-testid="radio-root" />
      </RadioGroup>
    ));

    expect(getByTestId('radio-root')).not.toHaveAttribute('value');
  });

  describe('prop: disabled', () => {
    it('uses aria-disabled instead of HTML disabled on the root, but sets it on the hidden input', () => {
      const { getByTestId, container } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" disabled data-testid="radio" />
        </RadioGroup>
      ));

      const radio = getByTestId('radio');
      expect(radio).not.toHaveAttribute('disabled');
      expect(radio).toHaveAttribute('aria-disabled', 'true');

      const input = container.querySelector('input[type="radio"]');
      expect(input).toHaveAttribute('disabled');
    });
  });

  describe('prop: readOnly', () => {
    it('has the aria-readonly attribute and blocks selection', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" readOnly data-testid="radio" />
        </RadioGroup>
      ));

      const radio = getByTestId('radio');
      expect(radio).toHaveAttribute('aria-readonly', 'true');
      expect(radio).toHaveAttribute('aria-checked', 'false');

      await user.click(radio);
      expect(radio).toHaveAttribute('aria-checked', 'false');
    });
  });

  describe('style hooks', () => {
    it('applies data-checked/data-unchecked based on the group value', async () => {
      const user = userEvent.setup();
      const { getByTestId } = render(() => (
        <RadioGroup>
          <Radio.Root value="a" data-testid="a" />
          <Radio.Root value="b" data-testid="b" />
        </RadioGroup>
      ));

      const a = getByTestId('a');
      const b = getByTestId('b');

      expect(a).toHaveAttribute('data-unchecked', '');
      expect(b).toHaveAttribute('data-unchecked', '');

      await user.click(a);

      expect(a).toHaveAttribute('data-checked', '');
      expect(b).toHaveAttribute('data-unchecked', '');
    });
  });
});

describe('<Radio.Indicator />', () => {
  it('does not render by default', () => {
    const { queryByTestId } = render(() => (
      <RadioGroup>
        <Radio.Root value="a">
          <Radio.Indicator data-testid="indicator" />
        </Radio.Root>
      </RadioGroup>
    ));
    expect(queryByTestId('indicator')).toBe(null);
  });

  it('renders when the radio is checked', () => {
    const { getByTestId } = render(() => (
      <RadioGroup defaultValue="a">
        <Radio.Root value="a">
          <Radio.Indicator data-testid="indicator" />
        </Radio.Root>
      </RadioGroup>
    ));
    expect(getByTestId('indicator')).not.toBe(null);
  });

  describe('prop: keepMounted', () => {
    it('keeps the indicator mounted when unchecked and reflects data-checked/unchecked', async () => {
      const [value, setValue] = createSignal('b');
      const { getByTestId } = render(() => (
        <RadioGroup value={value()} onValueChange={(v) => setValue(v)}>
          <Radio.Root value="a">
            <Radio.Indicator data-testid="indicator" keepMounted />
          </Radio.Root>
        </RadioGroup>
      ));

      const indicator = getByTestId('indicator');
      expect(indicator).not.toBe(null);
      expect(indicator).toHaveAttribute('data-unchecked', '');

      setValue('a');
      expect(indicator).toHaveAttribute('data-checked', '');
    });
  });
});
