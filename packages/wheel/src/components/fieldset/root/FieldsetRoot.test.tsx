// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Fieldset } from '../index';
import { Field } from '../../field';

describe('<Fieldset.Root />', () => {
  it('renders a fieldset element', () => {
    const { container } = render(() => <Fieldset.Root />);
    expect(container.querySelector('fieldset')).not.toBe(null);
  });

  it('sets the native disabled attribute', () => {
    const { container } = render(() => <Fieldset.Root disabled />);
    const fieldset = container.querySelector('fieldset')!;
    expect(fieldset).toHaveAttribute('disabled');
    expect(fieldset).toHaveAttribute('data-disabled', '');
  });

  it('keeps nested fieldsets disabled when an ancestor fieldset is disabled', () => {
    const { container } = render(() => (
      <Fieldset.Root disabled data-testid="outer">
        <Fieldset.Root data-testid="inner" />
      </Fieldset.Root>
    ));

    const [outer, inner] = container.querySelectorAll('fieldset');
    expect(outer).toHaveAttribute('disabled');
    expect(inner).toHaveAttribute('disabled');
  });

  it('does not disable an unrelated fieldset', () => {
    const { container } = render(() => (
      <div>
        <Fieldset.Root disabled />
        <Fieldset.Root />
      </div>
    ));

    const [first, second] = container.querySelectorAll('fieldset');
    expect(first).toHaveAttribute('disabled');
    expect(second).not.toHaveAttribute('disabled');
  });

  it('natively disables a nested Field.Control through nested fieldsets', () => {
    const { getByTestId } = render(() => (
      <Fieldset.Root disabled>
        <Fieldset.Root>
          <Field.Root>
            <Field.Control data-testid="control" />
          </Field.Root>
        </Fieldset.Root>
      </Fieldset.Root>
    ));

    // Native `<fieldset disabled>` cascades to every descendant form control regardless of
    // intervening component boundaries; no explicit Field<->Fieldset wiring is required.
    expect(getByTestId('control')).toBeDisabled();
  });

  // Upstream also verifies that `disabled` reaches a `RadioGroup`/`CheckboxGroup`/`Slider.Root`
  // used as `Fieldset.Root`'s `render` element. That exercises the generic `as`-composition
  // prop-forwarding mechanic (covered by `internals/renderElement.test.tsx`) together with
  // `Slider`, which hasn't been ported to this repo yet, so it's not ported here.
});
