// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Field } from '../index';

describe('<Field.Validity />', () => {
  it('passes the initial validity data', () => {
    let received: Field.ValidityData['state'] | undefined;

    render(() => (
      <Field.Root>
        <Field.Control />
        <Field.Validity>
          {(state) => {
            received = state.validity;
            return null;
          }}
        </Field.Validity>
      </Field.Root>
    ));

    expect(received?.valid).toBe(null);
  });

  it('reflects a failed validation', async () => {
    let received: boolean | null | undefined;

    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Field.Root validationMode="onBlur" validate={() => 'nope'}>
        <Field.Control />
        <Field.Validity>
          {(state) => {
            received = state.validity.valid;
            return null;
          }}
        </Field.Validity>
      </Field.Root>
    ));

    const input = getByRole('textbox');
    await user.click(input);
    await user.click(document.body);

    expect(received).toBe(false);
  });

  it('passes the error message returned by validate', async () => {
    let received: string | string[] | undefined;

    const user = userEvent.setup();
    const { getByRole } = render(() => (
      <Field.Root validationMode="onBlur" validate={() => 'custom error'}>
        <Field.Control />
        <Field.Validity>
          {(state) => {
            received = state.error;
            return null;
          }}
        </Field.Validity>
      </Field.Root>
    ));

    const input = getByRole('textbox');
    await user.click(input);
    await user.click(document.body);

    expect(received).toBe('custom error');
  });
});
