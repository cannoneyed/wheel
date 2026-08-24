// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Fieldset } from '../index';

describe('<Fieldset.Legend />', () => {
  it('should set aria-labelledby on the fieldset automatically', () => {
    const { container, getByText } = render(() => (
      <Fieldset.Root>
        <Fieldset.Legend>Legend</Fieldset.Legend>
      </Fieldset.Root>
    ));

    const fieldset = container.querySelector('fieldset')!;
    const legend = getByText('Legend');

    expect(fieldset).toHaveAttribute('aria-labelledby', legend.id);
  });

  it('should set aria-labelledby on the fieldset with a custom id', () => {
    const { container, getByText } = render(() => (
      <Fieldset.Root>
        <Fieldset.Legend id="custom-legend">Legend</Fieldset.Legend>
      </Fieldset.Root>
    ));

    const fieldset = container.querySelector('fieldset')!;
    expect(getByText('Legend').id).toBe('custom-legend');
    expect(fieldset).toHaveAttribute('aria-labelledby', 'custom-legend');
  });

  it('throws a descriptive error when rendered outside <Fieldset.Root>', () => {
    expect(() => render(() => <Fieldset.Legend>Legend</Fieldset.Legend>)).toThrow(
      /Fieldset parts must be placed within <Fieldset.Root>/,
    );
  });
});
