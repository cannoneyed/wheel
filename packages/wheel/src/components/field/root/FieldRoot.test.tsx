// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Field } from '../index';

describe('<Field.Root />', () => {
  it('renders a div', () => {
    const { container } = render(() => <Field.Root data-testid="root" />);
    expect(container.querySelector('div[data-testid="root"]')).not.toBe(null);
  });

  describe('prop: disabled', () => {
    it('adds data-disabled to the field control', () => {
      const { getByRole } = render(() => (
        <Field.Root disabled>
          <Field.Control />
        </Field.Root>
      ));

      expect(getByRole('textbox')).toHaveAttribute('data-disabled', '');
      expect(getByRole('textbox')).toBeDisabled();
    });

    it('keeps the field valid=null while disabled', () => {
      const { getByRole } = render(() => (
        <Field.Root disabled invalid>
          <Field.Control />
        </Field.Root>
      ));

      // App-controlled invalidity keeps the field marked invalid even while disabled.
      expect(getByRole('textbox')).toHaveAttribute('data-invalid', '');
    });
  });

  describe('prop: validate', () => {
    it('does not run automatically when validationMode is onSubmit and the field is untouched', async () => {
      const validate = vi.fn(() => 'error');
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Field.Root validate={validate}>
          <Field.Control />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      await user.type(input, 'abc');
      await user.click(document.body);

      expect(validate).not.toHaveBeenCalled();
    });

    it('receives the current value', async () => {
      const validate = vi.fn(() => null);
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Field.Root validate={validate} validationMode="onBlur">
          <Field.Control />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      await user.type(input, 'abc');
      await user.click(document.body);

      expect(validate).toHaveBeenCalledWith('abc', expect.any(Object));
    });
  });

  describe('prop: validationMode', () => {
    it('onBlur: validates the field on blur', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId, getByTestId } = render(() => (
        <Field.Root validationMode="onBlur" validate={() => 'error'}>
          <Field.Control />
          <Field.Error data-testid="error" />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      await user.click(input);
      expect(queryByTestId('error')).toBe(null);

      await user.click(document.body);
      expect(getByTestId('error')).not.toBe(null);
      expect(input).toHaveAttribute('data-invalid', '');
    });

    it('onChange: validates the field on every change', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId } = render(() => (
        <Field.Root validationMode="onChange">
          <Field.Control required />
          <Field.Error data-testid="error" />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      await user.type(input, 'a');
      expect(queryByTestId('error')).toBe(null);

      await user.clear(input);
      expect(queryByTestId('error')).not.toBe(null);
    });
  });

  describe('prop: validationDebounceTime', () => {
    it('debounces validation', () => {
      vi.useFakeTimers();
      try {
        const validate = vi.fn(() => null);
        const { getByRole } = render(() => (
          <Field.Root
            validate={validate}
            validationMode="onChange"
            validationDebounceTime={100}
          >
            <Field.Control />
          </Field.Root>
        ));

        const input = getByRole('textbox') as HTMLInputElement;
        input.value = 'a';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(validate).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(validate).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('style hooks', () => {
    it('applies data-touched, data-dirty, data-filled, and data-focused to the control', async () => {
      const user = userEvent.setup();
      const { getByRole } = render(() => (
        <Field.Root>
          <Field.Control />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      expect(input).not.toHaveAttribute('data-touched');
      expect(input).not.toHaveAttribute('data-dirty');
      expect(input).not.toHaveAttribute('data-filled');
      expect(input).not.toHaveAttribute('data-focused');

      await user.click(input);
      expect(input).toHaveAttribute('data-focused', '');

      await user.type(input, 'a');
      expect(input).toHaveAttribute('data-dirty', '');
      expect(input).toHaveAttribute('data-filled', '');

      await user.click(document.body);
      expect(input).toHaveAttribute('data-touched', '');
      expect(input).not.toHaveAttribute('data-focused');
    });
  });
});
