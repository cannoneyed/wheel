// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Toolbar } from '../index';

describe('<Toolbar.Link />', () => {
  describe('ARIA attributes', () => {
    it('renders an anchor', () => {
      const { getByTestId, getByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Link data-testid="link" href="https://base-ui.com" />
        </Toolbar.Root>
      ));

      expect(getByTestId('link')).toBe(getByRole('link'));
    });
  });
});
