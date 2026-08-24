// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { DirectionProvider, type TextDirection } from '../../direction-provider';
import type { Orientation } from '../../internals/types';
import { Toolbar } from '../index';

// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see
// CONVENTIONS.md). Required here: several tests assert real Tab-key focus order, which
// (unlike arrow-key roving focus) spans the whole document rather than just this test's
// container, so leftover elements from a prior test could otherwise be reached by Tab.
afterEach(cleanup);

function flushMicrotasks() {
  return Promise.resolve();
}

describe('<Toolbar.Root />', () => {
  describe('ARIA attributes', () => {
    it('has role="toolbar"', () => {
      const { container } = render(() => <Toolbar.Root />);

      expect(container.firstElementChild as HTMLElement).toHaveAttribute('role', 'toolbar');
    });
  });

  describe('keyboard navigation', () => {
    const cases: Array<[TextDirection, Orientation, string, string]> = [
      ['ltr', 'horizontal', 'ArrowRight', 'ArrowLeft'],
      ['ltr', 'vertical', 'ArrowDown', 'ArrowUp'],
      ['rtl', 'horizontal', 'ArrowLeft', 'ArrowRight'],
      ['rtl', 'vertical', 'ArrowDown', 'ArrowUp'],
    ];

    cases.forEach(([direction, orientation, nextKey, prevKey]) => {
      describe(direction, () => {
        it(`orientation: ${orientation}`, async () => {
          const user = userEvent.setup();
          const { getAllByRole, getByText, getByRole } = render(() => (
            <DirectionProvider direction={direction}>
              <Toolbar.Root orientation={orientation}>
                <Toolbar.Button />
                <Toolbar.Link href="https://base-ui.com">Link</Toolbar.Link>
                <Toolbar.Group>
                  <Toolbar.Button />
                  <Toolbar.Button />
                </Toolbar.Group>
                <Toolbar.Input defaultValue="" />
              </Toolbar.Root>
            </DirectionProvider>
          ));

          const [button1, groupedButton1, groupedButton2] = getAllByRole('button');
          const link = getByText('Link');
          const input = getByRole('textbox');

          await user.tab();
          expect(button1).toHaveFocus();

          fireEvent.keyDown(button1, { key: nextKey });
          await flushMicrotasks();
          expect(link).toHaveFocus();

          fireEvent.keyDown(link, { key: nextKey });
          await flushMicrotasks();
          expect(groupedButton1).toHaveFocus();

          fireEvent.keyDown(groupedButton1, { key: nextKey });
          await flushMicrotasks();
          expect(groupedButton2).toHaveFocus();

          fireEvent.keyDown(groupedButton2, { key: nextKey });
          await flushMicrotasks();
          expect(input).toHaveFocus();

          // loop to the beginning
          fireEvent.keyDown(input, { key: nextKey });
          await flushMicrotasks();
          expect(button1).toHaveFocus();

          fireEvent.keyDown(button1, { key: prevKey });
          await flushMicrotasks();
          expect(input).toHaveFocus();

          fireEvent.keyDown(input, { key: prevKey });
          await flushMicrotasks();
          expect(groupedButton2).toHaveFocus();
        });
      });
    });
  });

  describe('prop: disabled', () => {
    it('disables all toolbar items except links', () => {
      const { getAllByRole, getByRole, getAllByText } = render(() => (
        <Toolbar.Root disabled>
          <Toolbar.Button />
          <Toolbar.Link href="https://base-ui.com">Link</Toolbar.Link>
          <Toolbar.Input defaultValue="" />
          <Toolbar.Group>
            <Toolbar.Button />
            <Toolbar.Link href="https://base-ui.com">Link</Toolbar.Link>
            <Toolbar.Input defaultValue="" />
          </Toolbar.Group>
        </Toolbar.Root>
      ));

      [...getAllByRole('button'), ...getAllByRole('textbox')].forEach((toolbarItem) => {
        expect(toolbarItem).toHaveAttribute('aria-disabled', 'true');
        expect(toolbarItem).toHaveAttribute('data-disabled');
      });

      expect(getByRole('group')).toHaveAttribute('data-disabled');

      getAllByText('Link').forEach((link) => {
        expect(link).not.toHaveAttribute('data-disabled');
        expect(link).not.toHaveAttribute('aria-disabled');
      });
    });
  });

  describe('prop: focusableWhenDisabled', () => {
    function expectFocusedWhenDisabled(element: Element) {
      expect(element).toHaveAttribute('data-disabled');
      expect(element).toHaveAttribute('aria-disabled', 'true');
      expect(element).toHaveFocus();
    }

    it('toolbar items can be focused when disabled by default', async () => {
      const user = userEvent.setup();
      const { getByRole, getAllByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Button disabled />
          <Toolbar.Group>
            <Toolbar.Button disabled />
            <Toolbar.Button disabled />
          </Toolbar.Group>
          <Toolbar.Input defaultValue="" disabled />
        </Toolbar.Root>
      ));

      const input = getByRole('textbox');
      const buttons = getAllByRole('button');
      [input, ...buttons].forEach((item) => {
        expect(item).not.toHaveAttribute('disabled');
      });

      const [button1, groupedButton1, groupedButton2] = buttons;

      await user.tab();
      expect(button1).toHaveFocus();

      fireEvent.keyDown(button1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(groupedButton1);

      fireEvent.keyDown(groupedButton1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(groupedButton2);

      fireEvent.keyDown(groupedButton2, { key: 'ArrowRight' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(input);

      // loop to the beginning
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button1).toHaveAttribute('tabindex', '0');

      fireEvent.keyDown(button1, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(input);

      fireEvent.keyDown(input, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(groupedButton2);
    });

    it('toolbar items can individually disable focusableWhenDisabled', async () => {
      const user = userEvent.setup();
      const { getByRole, getAllByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Button disabled />
          <Toolbar.Group>
            <Toolbar.Button disabled />
            <Toolbar.Button disabled focusableWhenDisabled={false} />
          </Toolbar.Group>
          <Toolbar.Input defaultValue="" disabled />
        </Toolbar.Root>
      ));

      const input = getByRole('textbox');
      const buttons = getAllByRole('button');
      const focusableWhenDisabledButtons = buttons.filter(
        (button) => button.getAttribute('data-focusable') != null,
      );
      [input, ...focusableWhenDisabledButtons].forEach((item) => {
        expect(item).not.toHaveAttribute('disabled');
      });

      const [button1, groupedButton1, groupedButton2] = buttons;
      expect(groupedButton2).toHaveAttribute('disabled');

      await user.tab();
      expect(button1).toHaveFocus();

      fireEvent.keyDown(button1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(groupedButton1);

      fireEvent.keyDown(groupedButton1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(input);

      // loop to the beginning
      fireEvent.keyDown(input, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button1).toHaveAttribute('tabindex', '0');

      fireEvent.keyDown(button1, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(input);

      fireEvent.keyDown(input, { key: 'ArrowLeft' });
      await flushMicrotasks();
      expectFocusedWhenDisabled(groupedButton1);
    });

    it('moves the initial tab stop off a disabled, non-focusable first item', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Button disabled focusableWhenDisabled={false} />
          <Toolbar.Button />
          <Toolbar.Button />
        </Toolbar.Root>
      ));

      const [button1, button2, button3] = getAllByRole('button');
      // a natively disabled first item cannot hold the single roving tab stop
      expect(button1).toHaveAttribute('disabled');
      expect(button1).not.toHaveAttribute('tabindex', '0');
      expect(button2).toHaveAttribute('tabindex', '0');

      await user.tab();
      expect(button2).toHaveFocus();

      fireEvent.keyDown(button2, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button3).toHaveFocus();

      // looping back skips the disabled first item
      fireEvent.keyDown(button3, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button2).toHaveFocus();
    });

    it('keeps an enabled item with focusableWhenDisabled={false} navigable', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Button />
          <Toolbar.Button focusableWhenDisabled={false} />
          <Toolbar.Button />
        </Toolbar.Root>
      ));

      const [button1, button2, button3] = getAllByRole('button');
      expect(button2).not.toHaveAttribute('disabled');

      await user.tab();
      expect(button1).toHaveFocus();

      fireEvent.keyDown(button1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button2).toHaveFocus();

      fireEvent.keyDown(button2, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(button3).toHaveFocus();
    });

    it('skips a disabled Toolbar.Input with focusableWhenDisabled={false}', async () => {
      const user = userEvent.setup();
      const { getAllByRole, getByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Button />
          <Toolbar.Input defaultValue="" disabled focusableWhenDisabled={false} />
          <Toolbar.Button />
        </Toolbar.Root>
      ));

      const [button1, button2] = getAllByRole('button');
      const input = getByRole('textbox');

      await user.tab();
      expect(button1).toHaveFocus();

      fireEvent.keyDown(button1, { key: 'ArrowRight' });
      await flushMicrotasks();
      expect(input).not.toHaveFocus();
      expect(button2).toHaveFocus();
    });
  });
});
