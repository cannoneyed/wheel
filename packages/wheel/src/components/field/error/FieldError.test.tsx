// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Field } from '../index';
import { Form } from '../../form';

describe('<Field.Error />', () => {
  it('should not render by default when the field is valid', () => {
    const { queryByTestId } = render(() => (
      <Field.Root>
        <Field.Control />
        <Field.Error data-testid="error" />
      </Field.Root>
    ));

    expect(queryByTestId('error')).toBe(null);
  });

  it('should show error messages after a failed validation', async () => {
    const user = userEvent.setup();
    const { getByRole, getByTestId } = render(() => (
      <Field.Root validationMode="onBlur" validate={() => 'This field is required'}>
        <Field.Control />
        <Field.Error data-testid="error" />
      </Field.Root>
    ));

    const input = getByRole('textbox');
    await user.click(input);
    await user.click(document.body);

    expect(getByTestId('error')).toHaveTextContent('This field is required');
  });

  describe('prop: match', () => {
    it('only renders when `match` matches constraint validation', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId } = render(() => (
        <Field.Root validationMode="onBlur">
          <Field.Control required />
          <Field.Error data-testid="error" match="valueMissing" />
        </Field.Root>
      ));

      const input = getByRole('textbox');
      await user.type(input, 'a');
      await user.clear(input);
      await user.click(document.body);

      expect(queryByTestId('error')).not.toBe(null);
    });

    it('always renders the error message when `match` is true', () => {
      const { getByTestId } = render(() => (
        <Field.Root>
          <Field.Control />
          <Field.Error data-testid="error" match />
        </Field.Root>
      ));

      expect(getByTestId('error')).not.toBe(null);
    });
  });

  it('renders errors provided by <Form> for the matching field name', () => {
    const { getByTestId } = render(() => (
      <Form errors={{ email: 'Invalid email address' }}>
        <Field.Root name="email">
          <Field.Control />
          <Field.Error data-testid="error" />
        </Field.Root>
      </Form>
    ));

    expect(getByTestId('error')).toHaveTextContent('Invalid email address');
  });

  it('renders Form error arrays with more than one item as a list', () => {
    const { getByTestId } = render(() => (
      <Form errors={{ email: ['Required', 'Too short'] }}>
        <Field.Root name="email">
          <Field.Control />
          <Field.Error data-testid="error" />
        </Field.Root>
      </Form>
    ));

    const items = getByTestId('error').querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Required');
    expect(items[1]).toHaveTextContent('Too short');
  });

  it('marks the control as invalid when a Form error is present', () => {
    const { getByRole } = render(() => (
      <Form errors={{ email: 'Invalid email address' }}>
        <Field.Root name="email">
          <Field.Control />
          <Field.Error />
        </Field.Root>
      </Form>
    ));

    expect(getByRole('textbox')).toHaveAttribute('data-invalid', '');
  });
});
