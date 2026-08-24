// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import type { Orientation } from '../../internals/types';
import { ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT } from '../../internals/composite/composite';
import { Toolbar } from '../index';

// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see
// CONVENTIONS.md). Required here: several tests assert real Tab-key focus order, which
// spans the whole document rather than just this test's container.
afterEach(cleanup);

describe('<Toolbar.Input />', () => {
  describe('ARIA attributes', () => {
    it('renders a textbox', () => {
      const { getByTestId, getByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Input data-testid="input" />
        </Toolbar.Root>
      ));

      expect(getByTestId('input')).toBe(getByRole('textbox'));
    });
  });

  describe('keyboard navigation', () => {
    // Upstream also covers `orientation: 'horizontal'`, where the toolbar's
    // forward/backward keys (ArrowRight/ArrowLeft) are the *same* keys used to
    // move the text caret inside the input. Telling "move the caret" apart
    // from "leave the input" there depends on the whole value getting
    // selected when focus lands on the input, via `createCompositeRoot`'s
    // root-level `onFocus` handler. That handler is registered as a plain
    // `onFocus`, which in Solid only fires for the root element itself
    // (native `focus` doesn't bubble) rather than for descendants like this
    // input — unlike React's synthetic `onFocus`, which behaves like
    // `focusin`. The composite root would need `onFocusIn` for that case to
    // work; reported as a shared-infra gap rather than fixed here
    // (`internals/composite` is owned by another in-flight change). The
    // `orientation: 'vertical'` case below doesn't share this dependency
    // (its forward/backward keys, ArrowDown/ArrowUp, don't move the caret),
    // so it's carried over.
    it('orientation: vertical', async () => {
      const orientation: Orientation = 'vertical';
      const [nextKey, prevKey] = [ARROW_DOWN, ARROW_UP];
      const user = userEvent.setup();
      const { getAllByRole, getByRole } = render(() => (
        <Toolbar.Root orientation={orientation}>
          <Toolbar.Button />
          <Toolbar.Input defaultValue="abcd" />
          <Toolbar.Button />
        </Toolbar.Root>
      ));
      const input = getByRole('textbox') as HTMLInputElement;
      const [button1, button2] = getAllByRole('button');

      await user.tab();
      expect(button1).toHaveFocus();

      await user.keyboard(`[${nextKey}]`);
      expect(input).toHaveFocus();

      await user.keyboard(`[${ARROW_RIGHT}]`);
      await user.keyboard(`[${nextKey}]`);

      expect(button2).toHaveFocus();

      await user.keyboard(`[${prevKey}]`);
      expect(input).toHaveFocus();

      await user.keyboard(`[${ARROW_LEFT}]`);
      await user.keyboard(`[${prevKey}]`);

      expect(button1).toHaveFocus();
    });
  });

  describe('disabled', () => {
    it('does not trap keyboard focus when disabled', async () => {
      const user = userEvent.setup();
      const { getByTestId, getByRole } = render(() => (
        <div>
          <Toolbar.Root>
            <Toolbar.Button data-testid="button" />
            <Toolbar.Input defaultValue="abcd" disabled />
          </Toolbar.Root>
          <button type="button" data-testid="after">
            after
          </button>
        </div>
      ));

      const button = getByTestId('button');
      const input = getByRole('textbox');
      const after = getByTestId('after');

      await user.tab();
      expect(button).toHaveFocus();

      await user.keyboard(`[${ARROW_RIGHT}]`);
      expect(input).toHaveFocus();

      // Tab must leave the toolbar instead of being trapped on the disabled input
      await user.tab();
      expect(after).toHaveFocus();

      await user.tab({ shift: true });
      expect(input).toHaveFocus();
    });

    it('does not block vertical roving focus when disabled', async () => {
      const user = userEvent.setup();
      const { getByTestId, getByRole } = render(() => (
        <Toolbar.Root orientation="vertical">
          <Toolbar.Button data-testid="button1" />
          <Toolbar.Input defaultValue="abcd" disabled />
          <Toolbar.Button data-testid="button2" />
        </Toolbar.Root>
      ));

      const input = getByRole('textbox');
      const button1 = getByTestId('button1');
      const button2 = getByTestId('button2');

      await user.tab();
      expect(button1).toHaveFocus();

      await user.keyboard(`[${ARROW_DOWN}]`);
      expect(input).toHaveFocus();

      // ArrowDown must move roving focus past the disabled input
      await user.keyboard(`[${ARROW_DOWN}]`);
      expect(button2).toHaveFocus();

      await user.keyboard(`[${ARROW_UP}]`);
      expect(input).toHaveFocus();

      await user.keyboard(`[${ARROW_UP}]`);
      expect(button1).toHaveFocus();
    });
  });

  // Upstream also covers rendering `NumberField.Input` via `render`/`asChild`. The Solid
  // `number-field` package doesn't have ported `Root`/`Group`/`Input` components yet (only
  // data-attribute/util files exist), so that interop coverage isn't carried over here.
});
