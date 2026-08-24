// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Field } from '../index';

describe('<Field.Description />', () => {
  it('should set aria-describedby on the control automatically', () => {
    const { getByRole, getByText } = render(() => (
      <Field.Root>
        <Field.Control />
        <Field.Description>Description</Field.Description>
      </Field.Root>
    ));

    const input = getByRole('textbox');
    const description = getByText('Description');

    expect(input).toHaveAttribute('aria-describedby', description.id);
  });

  it('should preserve user aria-describedby values on the control', () => {
    const { getByRole, getByText } = render(() => (
      <Field.Root>
        <Field.Control aria-describedby="custom-id" />
        <Field.Description>Description</Field.Description>
      </Field.Root>
    ));

    const input = getByRole('textbox');
    const description = getByText('Description');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toContain('custom-id');
    expect(describedBy).toContain(description.id);
  });

  it('reflects the disabled state from Field.Item', () => {
    const { getByText } = render(() => (
      <Field.Root>
        <Field.Item disabled>
          <Field.Description>Description</Field.Description>
        </Field.Item>
      </Field.Root>
    ));

    expect(getByText('Description')).toHaveAttribute('data-disabled', '');
  });
});
