// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { NumberField } from '../index';

/**
 * Solid port of upstream's `NumberFieldGroup.test.tsx`. `describeConformance` is upstream's
 * shared React-only conformance harness (ref forwarding, DOM tag, etc.) with no Solid equivalent;
 * only the behavioral `it` carries over.
 */
afterEach(cleanup);

describe('<NumberField.Group />', () => {
  it('has role prop', () => {
    render(() => (
      <NumberField.Root>
        <NumberField.Group />
      </NumberField.Root>
    ));
    expect(screen.queryByRole('group')).not.toBe(null);
  });
});
