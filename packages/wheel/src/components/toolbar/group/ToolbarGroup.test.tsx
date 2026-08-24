// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { Toolbar } from '../index';

describe('<Toolbar.Group />', () => {
  describe('ARIA attributes', () => {
    it('renders a group', () => {
      const { getByTestId, getByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Group data-testid="group" />
        </Toolbar.Root>
      ));

      expect(getByTestId('group')).toBe(getByRole('group'));
    });
  });

  describe('prop: disabled', () => {
    it('disables all toolbar items except links in the group', () => {
      const { getByRole, getByText } = render(() => (
        <Toolbar.Root>
          <Toolbar.Group disabled>
            <Toolbar.Button />
            <Toolbar.Link href="https://base-ui.com">Link</Toolbar.Link>
            <Toolbar.Input defaultValue="" />
          </Toolbar.Group>
        </Toolbar.Root>
      ));

      [getByRole('button'), getByRole('textbox')].forEach((toolbarItem) => {
        expect(toolbarItem).toHaveAttribute('aria-disabled', 'true');
        expect(toolbarItem).toHaveAttribute('data-disabled');
      });

      expect(getByText('Link')).not.toHaveAttribute('data-disabled');
      expect(getByText('Link')).not.toHaveAttribute('aria-disabled');
    });
  });
});
