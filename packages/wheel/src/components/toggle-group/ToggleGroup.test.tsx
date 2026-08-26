// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { ToggleGroup } from './ToggleGroup';
import { Toggle } from '../toggle/Toggle';
import { DirectionProvider } from '../direction-provider';
import { Toolbar } from '../toolbar';

function flushMicrotasks() {
  return Promise.resolve();
}

describe('<ToggleGroup />', () => {
  it('exposes typed layout, size, variant, and selection mode state', () => {
    const { getByRole } = render(() => (
      <ToggleGroup
        aria-label="Format"
        type="multiple"
        orientation="vertical"
        layout="fill"
        size="lg"
        variant="destructive"
      >
        <Toggle value="bold" label="Bold" />
      </ToggleGroup>
    ));
    const group = getByRole('group', { name: 'Format' });

    expect(group).toHaveClass('wheel-ToggleGroup');
    expect(group).toHaveAttribute('data-slot', 'toggle-group');
    expect(group).toHaveAttribute('data-type', 'multiple');
    expect(group).toHaveAttribute('data-orientation', 'vertical');
    expect(group).toHaveAttribute('data-layout', 'fill');
    expect(group).toHaveAttribute('data-size', 'lg');
    expect(group).toHaveAttribute('data-variant', 'destructive');
  });

  it('renders a `group`', () => {
    const { getByRole } = render(() => <ToggleGroup aria-label="My Toggle Group" />);
    expect(getByRole('group', { name: 'My Toggle Group' })).not.toBe(null);
  });

  describe('uncontrolled', () => {
    it('toggles pressed state on click', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <ToggleGroup>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      expect(button1).toHaveAttribute('aria-pressed', 'false');
      expect(button2).toHaveAttribute('aria-pressed', 'false');

      await user.click(button1);

      expect(button1).toHaveAttribute('aria-pressed', 'true');
      expect(button1).toHaveAttribute('data-pressed');
      expect(button2).toHaveAttribute('aria-pressed', 'false');

      await user.click(button2);

      expect(button2).toHaveAttribute('aria-pressed', 'true');
      expect(button1).toHaveAttribute('aria-pressed', 'false');
    });

    it('prop: defaultValue', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <ToggleGroup defaultValue="two">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      expect(button2).toHaveAttribute('aria-pressed', 'true');
      expect(button1).toHaveAttribute('aria-pressed', 'false');

      await user.click(button1);

      expect(button1).toHaveAttribute('aria-pressed', 'true');
      expect(button2).toHaveAttribute('aria-pressed', 'false');
    });

    it('warns when a Toggle omits its value while the group value is initialized', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(() => (
        <ToggleGroup defaultValue="one">
          <Toggle />
          <Toggle />
        </ToggleGroup>
      ));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('controlled', () => {
    it('follows the value prop', () => {
      const [value, setValue] = createSignal<string | null>('two');
      const { getAllByRole } = render(() => (
        <ToggleGroup value={value()}>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      expect(button1).toHaveAttribute('aria-pressed', 'false');
      expect(button2).toHaveAttribute('aria-pressed', 'true');

      setValue('one');

      expect(button1).toHaveAttribute('aria-pressed', 'true');
      expect(button2).toHaveAttribute('aria-pressed', 'false');
    });

    it('does not change state on click without external update', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <ToggleGroup value="two">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1] = getAllByRole('button');
      await user.click(button1);
      expect(button1).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('prop: disabled', () => {
    it('can disable the whole group', () => {
      const { getAllByRole } = render(() => (
        <ToggleGroup disabled>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button', { hidden: true });

      expect(button1).toHaveAttribute('aria-disabled', 'true');
      expect(button1).toHaveAttribute('data-disabled');
      expect(button2).toHaveAttribute('aria-disabled', 'true');
      expect(button2).toHaveAttribute('data-disabled');
    });

    it('can disable individual items', () => {
      const { getAllByRole } = render(() => (
        <ToggleGroup>
          <Toggle value="one" />
          <Toggle value="two" disabled />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button', { hidden: true });

      expect(button1).not.toHaveAttribute('data-disabled');
      expect(button2).toHaveAttribute('aria-disabled', 'true');
      expect(button2).toHaveAttribute('data-disabled');
    });
  });

  describe('prop: orientation', () => {
    it('vertical', () => {
      const { getByRole } = render(() => (
        <ToggleGroup orientation="vertical">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      expect(getByRole('group')).toHaveAttribute('data-orientation', 'vertical');
    });

    it('does not render aria-orientation on role="group"', () => {
      const { getByRole } = render(() => (
        <ToggleGroup orientation="horizontal">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      expect(getByRole('group')).not.toHaveAttribute('aria-orientation');
    });
  });

  describe('prop: type', () => {
    it('multiple items can be pressed in multiple mode', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <ToggleGroup type="multiple" defaultValue={['one']}>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      expect(button1).toHaveAttribute('aria-pressed', 'true');
      expect(button2).toHaveAttribute('aria-pressed', 'false');

      await user.click(button2);

      expect(button1).toHaveAttribute('aria-pressed', 'true');
      expect(button2).toHaveAttribute('aria-pressed', 'true');
    });

    it('only one item can be pressed when false', async () => {
      const user = userEvent.setup();
      const { getAllByRole } = render(() => (
        <ToggleGroup defaultValue="one">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      await user.click(button2);

      expect(button1).toHaveAttribute('aria-pressed', 'false');
      expect(button2).toHaveAttribute('aria-pressed', 'true');
    });

    it('deselects the active item to null in single mode', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getByRole } = render(() => (
        <ToggleGroup defaultValue="one" onValueChange={onValueChange}>
          <Toggle value="one" label="One" />
        </ToggleGroup>
      ));
      const button = getByRole('button', { name: 'One' });

      await user.click(button);
      expect(onValueChange).toHaveBeenCalledWith(null, expect.any(Object));
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('reports arrays in multiple mode', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const { getAllByRole } = render(() => (
        <ToggleGroup type="multiple" defaultValue={['one']} onValueChange={onValueChange}>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      await user.click(getAllByRole('button')[1]);
      expect(onValueChange.mock.calls[0][0]).toEqual(['one', 'two']);
    });
  });

  describe('keyboard interactions', () => {
    it('arrow keys rove focus horizontally by default', async () => {
      const { getAllByRole } = render(() => (
        <ToggleGroup>
          <Toggle value="one" />
          <Toggle value="two" />
          <Toggle value="three" />
        </ToggleGroup>
      ));

      const [button1, button2, button3] = getAllByRole('button');

      button1.focus();
      expect(button1).toHaveFocus();

      button1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await flushMicrotasks();
      expect(button2).toHaveAttribute('tabindex', '0');
      expect(button2).toHaveFocus();

      button2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await flushMicrotasks();
      expect(button3).toHaveAttribute('tabindex', '0');
      expect(button3).toHaveFocus();

      button3.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushMicrotasks();
      expect(button2).toHaveAttribute('tabindex', '0');
      expect(button2).toHaveFocus();
    });

    it('arrow keys rove focus vertically when orientation is vertical', async () => {
      const { getAllByRole } = render(() => (
        <ToggleGroup orientation="vertical">
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      button1.focus();
      button1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await flushMicrotasks();
      expect(button2).toHaveFocus();

      // The horizontal axis keys should be ignored in vertical orientation.
      button2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await flushMicrotasks();
      expect(button2).toHaveFocus();
    });

    it('respects RTL direction for horizontal arrow keys', async () => {
      const { getAllByRole } = render(() => (
        <DirectionProvider direction="rtl">
          <ToggleGroup>
            <Toggle value="one" />
            <Toggle value="two" />
          </ToggleGroup>
        </DirectionProvider>
      ));

      const [button1, button2] = getAllByRole('button');

      button1.focus();
      button1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushMicrotasks();
      expect(button2).toHaveFocus();
    });
  });

  describe('prop: onValueChange', () => {
    it('fires with the next group value and event details', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();

      const { getAllByRole } = render(() => (
        <ToggleGroup onValueChange={onValueChange}>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1, button2] = getAllByRole('button');

      await user.click(button1);
      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(onValueChange.mock.calls[0][0]).toBe('one');
      expect(onValueChange.mock.calls[0][1].reason).toBe('none');

      await user.click(button2);
      expect(onValueChange).toHaveBeenCalledTimes(2);
      expect(onValueChange.mock.calls[1][0]).toBe('two');
    });

    it('does not change the value when the event is canceled', async () => {
      const user = userEvent.setup();
      const onValueChange = vi.fn((_value, eventDetails) => {
        eventDetails.cancel();
      });

      const { getAllByRole } = render(() => (
        <ToggleGroup onValueChange={onValueChange}>
          <Toggle value="one" />
          <Toggle value="two" />
        </ToggleGroup>
      ));

      const [button1] = getAllByRole('button');
      await user.click(button1);

      expect(onValueChange).toHaveBeenCalledTimes(1);
      expect(button1).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('inside Toolbar', () => {
    it('renders a plain group (no nested composite) and inherits Toolbar disabled state', () => {
      const { getAllByRole, getByRole } = render(() => (
        <Toolbar.Root disabled>
          <ToggleGroup>
            <Toggle value="one" />
            <Toggle value="two" />
          </ToggleGroup>
        </Toolbar.Root>
      ));

      expect(getByRole('group')).toHaveAttribute('data-disabled');
      for (const button of getAllByRole('button')) {
        expect(button).toHaveAttribute('data-disabled');
        expect(button).toHaveAttribute('aria-disabled', 'true');
      }
    });

    it('inherits a disabled Toolbar.Group', () => {
      const { getByRole } = render(() => (
        <Toolbar.Root>
          <Toolbar.Group disabled>
            <ToggleGroup>
              <Toggle value="one" />
            </ToggleGroup>
          </Toolbar.Group>
        </Toolbar.Root>
      ));

      expect(getByRole('button')).toHaveAttribute('data-disabled');
    });
  });
});
