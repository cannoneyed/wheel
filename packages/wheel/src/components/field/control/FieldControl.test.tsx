// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Field } from '../index';

describe('<Field.Control />', () => {
  it('renders a native input element', () => {
    const { getByRole } = render(() => (
      <Field.Root>
        <Field.Control />
      </Field.Root>
    ));

    expect(getByRole('textbox').tagName).toBe('INPUT');
  });

  it('is labelled by Field.Label automatically', () => {
    const { getByRole, getByText } = render(() => (
      <Field.Root>
        <Field.Label>Name</Field.Label>
        <Field.Control />
      </Field.Root>
    ));

    const input = getByRole('textbox');
    const label = getByText('Name');
    expect(input).toHaveAttribute('aria-labelledby', label.id);
  });

  it('works outside of a Field.Root', () => {
    const { getByRole } = render(() => <Field.Control placeholder="standalone" />);
    expect(getByRole('textbox')).toHaveAttribute('placeholder', 'standalone');
  });
});
