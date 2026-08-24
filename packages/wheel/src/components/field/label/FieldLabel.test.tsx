// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Field } from '../index';

describe('<Field.Label />', () => {
  it('should set htmlFor referencing the control automatically', () => {
    const { getByText, getByRole } = render(() => (
      <Field.Root>
        <Field.Label>Label</Field.Label>
        <Field.Control />
      </Field.Root>
    ));

    const label = getByText('Label');
    const input = getByRole('textbox');

    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', input.id);
  });

  it('clicking the label focuses the control', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = render(() => (
      <Field.Root>
        <Field.Label>Label</Field.Label>
        <Field.Control />
      </Field.Root>
    ));

    const label = getByText('Label');
    const input = getByRole('textbox');

    expect(input).not.toHaveFocus();
    await user.click(label);
    expect(input).toHaveFocus();
  });

  it('when nativeLabel={false}, clicking focuses the associated control', async () => {
    const user = userEvent.setup();
    const { getByText, getByRole } = render(() => (
      <Field.Root>
        <Field.Label nativeLabel={false} as="span">
          Label
        </Field.Label>
        <Field.Control />
      </Field.Root>
    ));

    const label = getByText('Label') as unknown as HTMLElement;
    const input = getByRole('textbox');

    await user.click(label);
    expect(input).toHaveFocus();
  });

  it('reflects the disabled state from Field.Item', () => {
    const { getByText } = render(() => (
      <Field.Root>
        <Field.Item disabled>
          <Field.Label>Label</Field.Label>
        </Field.Item>
      </Field.Root>
    ));

    expect(getByText('Label')).toHaveAttribute('data-disabled', '');
  });
});
