// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Form } from './index';
import { Field } from '../field';

describe('<Form />', () => {
  it('renders a form element', () => {
    const { container } = render(() => <Form />);
    expect(container.querySelector('form')).not.toBe(null);
    expect(container.querySelector('form')).toHaveAttribute('novalidate');
  });

  it('does not submit (blocks onFormSubmit) when a field is invalid', async () => {
    const onFormSubmit = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Form onFormSubmit={onFormSubmit}>
        <Field.Root name="email">
          <Field.Control required />
        </Field.Root>
        <button type="submit">Submit</button>
      </Form>
    ));

    await user.click(getByRole('button', { name: 'Submit' }));

    expect(onFormSubmit).not.toHaveBeenCalled();
  });

  it('submits when every field is valid', async () => {
    const onFormSubmit = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Form onFormSubmit={onFormSubmit}>
        <Field.Root name="email">
          <Field.Control defaultValue="a@example.com" />
        </Field.Root>
        <button type="submit">Submit</button>
      </Form>
    ));

    await user.click(getByRole('button', { name: 'Submit' }));

    expect(onFormSubmit).toHaveBeenCalledTimes(1);
    expect(onFormSubmit.mock.calls[0][0]).toEqual({ email: 'a@example.com' });
  });

  describe('prop: errors', () => {
    it('marks the matching Field.Control as invalid and populates Field.Error', () => {
      const { getByRole, getByTestId } = render(() => (
        <Form errors={{ email: 'Invalid email address' }}>
          <Field.Root name="email">
            <Field.Control />
            <Field.Error data-testid="error" />
          </Field.Root>
        </Form>
      ));

      expect(getByRole('textbox')).toHaveAttribute('data-invalid', '');
      expect(getByTestId('error')).toHaveTextContent('Invalid email address');
    });

    it('does not mark the control as invalid when no error is provided for it', () => {
      const { getByRole } = render(() => (
        <Form errors={{ password: 'Too short' }}>
          <Field.Root name="email">
            <Field.Control />
          </Field.Root>
        </Form>
      ));

      expect(getByRole('textbox')).not.toHaveAttribute('data-invalid');
    });

    it('clears the error for a field once its value changes', async () => {
      const user = userEvent.setup();
      const { getByRole, queryByTestId } = render(() => (
        <Form errors={{ email: 'Invalid email address' }}>
          <Field.Root name="email">
            <Field.Control />
            <Field.Error data-testid="error" />
          </Field.Root>
        </Form>
      ));

      expect(queryByTestId('error')).not.toBe(null);

      await user.type(getByRole('textbox'), 'a');

      expect(queryByTestId('error')).toBe(null);
    });
  });

  it('focuses the first invalid control on submit', async () => {
    const user = userEvent.setup();
    const { getByTestId, getByRole } = render(() => (
      <Form>
        <Field.Root name="first">
          <Field.Control data-testid="first" />
        </Field.Root>
        <Field.Root name="second">
          <Field.Control data-testid="second" required />
        </Field.Root>
        <button type="submit">Submit</button>
      </Form>
    ));

    await user.click(getByRole('button', { name: 'Submit' }));

    expect(getByTestId('second')).toHaveFocus();
  });

  describe('prop: actionsRef', () => {
    it('validates all fields when the `validate` action is called', () => {
      const actionsRef = { current: null as Form.Actions | null };
      const { getByRole } = render(() => (
        <Form actionsRef={actionsRef}>
          <Field.Root name="email">
            <Field.Control required />
          </Field.Root>
        </Form>
      ));

      expect(getByRole('textbox')).not.toHaveAttribute('data-invalid');

      actionsRef.current?.validate();

      expect(getByRole('textbox')).toHaveAttribute('data-invalid', '');
    });

    it('validates a single field by name', () => {
      const actionsRef = { current: null as Form.Actions | null };
      const { getAllByRole } = render(() => (
        <Form actionsRef={actionsRef}>
          <Field.Root name="first">
            <Field.Control required />
          </Field.Root>
          <Field.Root name="second">
            <Field.Control required />
          </Field.Root>
        </Form>
      ));

      actionsRef.current?.validate('first');

      const [first, second] = getAllByRole('textbox');
      expect(first).toHaveAttribute('data-invalid', '');
      expect(second).not.toHaveAttribute('data-invalid');
    });
  });
});
