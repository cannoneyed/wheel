// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal } from 'solid-js';
import { resetAnimationFrameScheduler } from '../base-utils/createAnimationFrame';
import { Menu } from './index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

// `useListNavigation`'s focus-on-open/focus-on-navigate paths (and `useClick`'s mousedown-driven
// open) defer their work to the next animation frame (`createAnimationFrame`/`enqueueFocus`).
// Mocking `requestAnimationFrame` makes those assertions observable without waiting a real frame.
//
// Deviation from `FloatingFocusManager.test.tsx`'s fully-synchronous mock (`callback(0)` invoked
// immediately, before `requestAnimationFrame` returns): `createAnimationFrame.ts`'s `Scheduler`
// has a re-entrancy bug when the mock is fully synchronous and `.request()` is called more than
// once on the *same* `AnimationFrame` instance (e.g. `useClick`'s single per-trigger `frame`,
// across two separate clicks) — see this port's final report for the full trace. In short:
// `Scheduler.request()` calls `requestAnimationFrame(this.tick)` and only *afterwards* sets
// `this.isScheduled = true`; when the mock invokes `this.tick` synchronously inside that call,
// `tick` already reset `isScheduled` to `false` (correctly, having drained the queue) but the
// pending `this.isScheduled = true` assignment then clobbers it back to `true` once
// `requestAnimationFrame(...)` "returns". The next `.request()` call then sees a stale
// `isScheduled === true` and skips scheduling entirely, silently dropping its callback. Deferring
// the mocked callback to a microtask (rather than calling it inline) avoids the synchronous
// re-entrancy and sidesteps the bug; `waitFor` (used throughout this file) already polls with real
// timers, which drain the microtask queue between attempts.
beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (callback: FrameRequestCallback): number => {
      queueMicrotask(() => callback(0));
      return 0;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  // The animation-frame scheduler is a process-global singleton; a callback requested in one test
  // but never actually run (e.g. under fake timers torn down before the mocked rAF fired) would
  // otherwise survive into a later test and run there against stale state.
  resetAnimationFrameScheduler();
});

interface TestMenuProps {
  rootProps?: Menu.Root.Props;
  triggerProps?: Menu.Trigger.Props;
  itemProps?: Menu.Item.Props;
  disabledIndex?: number;
  itemCount?: number;
}

function TestMenu(props: TestMenuProps) {
  // Read once: this test helper's `itemCount` is never changed reactively after mount.
  const count = props.itemCount ?? 3;
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <Menu.Root {...props.rootProps}>
      <Menu.Trigger data-testid="trigger" {...props.triggerProps}>
        Toggle
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner data-testid="positioner">
          <Menu.Popup data-testid="popup">
            {items.map((i) => (
              <Menu.Item
                data-testid={`item-${i}`}
                disabled={i === props.disabledIndex}
                {...props.itemProps}
              >
                Item {i}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, trigger: Element) {
  await user.click(trigger);
  await waitFor(() => {
    expect(screen.getByTestId('popup')).not.toBe(null);
  });
}

describe('<Menu.Root />', () => {
  describe('open state', () => {
    it('is closed initially', () => {
      render(() => <TestMenu />);
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    it('opens when the trigger is clicked', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');

      await openMenu(user, trigger);
      expect(screen.getByRole('menu')).not.toBe(null);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes when the trigger is clicked again', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');

      await openMenu(user, trigger);
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBe(null);
      });
    });

    it('opens with ArrowDown and focuses the first item', async () => {
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();

      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });
    });

    it('supports a controlled `open` prop', async () => {
      function ControlledMenu() {
        const [open, setOpen] = createSignal(false);
        return (
          <div>
            <button type="button" data-testid="external-toggle" onClick={() => setOpen((o) => !o)}>
              external
            </button>
            <TestMenu rootProps={{ open: open() }} />
          </div>
        );
      }

      render(() => <ControlledMenu />);
      expect(screen.queryByTestId('popup')).toBe(null);

      fireEvent.click(screen.getByTestId('external-toggle'));
      await waitFor(() => {
        expect(screen.getByTestId('popup')).not.toBe(null);
      });

      fireEvent.click(screen.getByTestId('external-toggle'));
      await waitFor(() => {
        expect(screen.queryByTestId('popup')).toBe(null);
      });
    });

    it('calls onOpenChange with a reason when opened and closed', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(() => <TestMenu rootProps={{ onOpenChange }} />);
      const trigger = screen.getByTestId('trigger');

      await openMenu(user, trigger);
      expect(onOpenChange).toHaveBeenCalledWith(true, expect.objectContaining({ reason: expect.any(String) }));

      onOpenChange.mockClear();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByTestId('popup')).toBe(null);
      });
      expect(onOpenChange).toHaveBeenCalledWith(false, expect.objectContaining({ reason: 'escape-key' }));
    });

    it('returns focus to the trigger when closed', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');

      await openMenu(user, trigger);
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    });
  });

  describe('keyboard navigation', () => {
    it('moves the highlight down and up with arrow keys', async () => {
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-0'), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-1'), { key: 'ArrowUp' });
      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });
    });

    it('loops focus from the last item back to the first', async () => {
      render(() => <TestMenu itemCount={2} />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-0'), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-1'), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });
    });

    it('does not loop when loopFocus is false', async () => {
      render(() => <TestMenu itemCount={2} rootProps={{ loopFocus: false }} />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-0'), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-1'), { key: 'ArrowDown' });
      // Stays on the last item instead of looping back to the first.
      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveFocus();
      });
    });

    it('sets roving tabIndex so only the highlighted item is tabbable', async () => {
      render(() => <TestMenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveAttribute('tabindex', '0');
      });
      expect(screen.getByTestId('item-1')).toHaveAttribute('tabindex', '-1');
      expect(screen.getByTestId('item-2')).toHaveAttribute('tabindex', '-1');
    });

    it('includes disabled items during arrow navigation (matches upstream Menu semantics)', async () => {
      // Base UI menu items remain reachable via arrow-key navigation even when `disabled` — only
      // activation (click/Enter/Space) is blocked. See upstream's `MenuRoot.test.tsx` "includes
      // disabled items during keyboard navigation" and `MenuRoot`'s `disabledIndices: EMPTY_ARRAY`
      // (which intentionally opts out of `useListNavigation`'s automatic disabled-attribute skip).
      render(() => <TestMenu disabledIndex={1} />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-0'), { key: 'ArrowDown' });
      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveFocus();
      });
      expect(screen.getByTestId('item-1')).toHaveAttribute('aria-disabled', 'true');
    });

    it('marks disabled items with data-disabled and aria-disabled', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu disabledIndex={1} />);
      await openMenu(user, screen.getByTestId('trigger'));

      const disabledItem = screen.getByTestId('item-1');
      expect(disabledItem).toHaveAttribute('data-disabled', '');
    });

    it('does not activate a disabled item on click', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(() => <TestMenu disabledIndex={1} itemProps={{ onClick }} />);
      await openMenu(user, screen.getByTestId('trigger'));

      fireEvent.click(screen.getByTestId('item-1'));
      expect(onClick).not.toHaveBeenCalled();
      // The menu should remain open since the disabled item couldn't be activated.
      expect(screen.getByTestId('popup')).not.toBe(null);
    });
  });

  describe('typeahead', () => {
    // Typeahead matches the *start* of each item's label, so labels need distinguishing first
    // letters (all "Item N" labels share the "Item " prefix and would never match a single digit).
    function TestTypeaheadMenu() {
      return (
        <Menu.Root>
          <Menu.Trigger data-testid="trigger">Toggle</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup data-testid="popup">
                <Menu.Item data-testid="item-apple">Apple</Menu.Item>
                <Menu.Item data-testid="item-banana">Banana</Menu.Item>
                <Menu.Item data-testid="item-cherry">Cherry</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    it('highlights the item matching the typed character', async () => {
      render(() => <TestTypeaheadMenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-apple')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByRole('menu'), { key: 'c' });

      await waitFor(() => {
        expect(screen.getByTestId('item-cherry')).toHaveFocus();
      });
    });
  });

  describe('item activation', () => {
    it('fires onClick and closes the menu by default', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(() => <TestMenu itemProps={{ onClick }} />);
      await openMenu(user, screen.getByTestId('trigger'));

      await user.click(screen.getByTestId('item-0'));

      expect(onClick).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(screen.queryByTestId('popup')).toBe(null);
      });
    });

    it('keeps the menu open when closeOnClick is false', async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(() => <TestMenu itemProps={{ onClick, closeOnClick: false }} />);
      await openMenu(user, screen.getByTestId('trigger'));

      await user.click(screen.getByTestId('item-0'));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('popup')).not.toBe(null);
    });

    it('activates the highlighted item on Enter', async () => {
      const onClick = vi.fn();
      render(() => <TestMenu itemProps={{ onClick }} />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('item-0'), { key: 'Enter' });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('gives items role="menuitem"', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu />);
      await openMenu(user, screen.getByTestId('trigger'));
      expect(screen.getByTestId('item-0')).toHaveAttribute('role', 'menuitem');
    });
  });

  describe('checkbox item', () => {
    function TestCheckboxMenu(props: { itemProps?: Menu.CheckboxItem.Props }) {
      return (
        <Menu.Root>
          <Menu.Trigger data-testid="trigger">Toggle</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup data-testid="popup">
                <Menu.CheckboxItem data-testid="checkbox-item" {...props.itemProps}>
                  Show Bookmarks
                  <Menu.CheckboxItemIndicator data-testid="checkbox-indicator">
                    check
                  </Menu.CheckboxItemIndicator>
                </Menu.CheckboxItem>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    it('toggles checked state and aria-checked on click, without closing the menu', async () => {
      const user = userEvent.setup();
      const onCheckedChange = vi.fn();
      render(() => <TestCheckboxMenu itemProps={{ onCheckedChange }} />);
      await openMenu(user, screen.getByTestId('trigger'));

      const item = screen.getByTestId('checkbox-item');
      expect(item).toHaveAttribute('aria-checked', 'false');
      expect(item).toHaveAttribute('data-unchecked', '');

      await user.click(item);

      expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
      expect(item).toHaveAttribute('aria-checked', 'true');
      expect(item).toHaveAttribute('data-checked', '');
      // Menu stays open (closeOnClick defaults to false for checkbox items).
      expect(screen.getByTestId('popup')).not.toBe(null);
    });

    it('renders the indicator only while checked', async () => {
      const user = userEvent.setup();
      render(() => <TestCheckboxMenu />);
      await openMenu(user, screen.getByTestId('trigger'));

      expect(screen.queryByTestId('checkbox-indicator')).toBe(null);

      await user.click(screen.getByTestId('checkbox-item'));

      await waitFor(() => {
        expect(screen.getByTestId('checkbox-indicator')).not.toBe(null);
      });
    });

    it('has role="menuitemcheckbox"', async () => {
      const user = userEvent.setup();
      render(() => <TestCheckboxMenu />);
      await openMenu(user, screen.getByTestId('trigger'));
      expect(screen.getByTestId('checkbox-item')).toHaveAttribute('role', 'menuitemcheckbox');
    });
  });

  describe('radio group / radio item', () => {
    function TestRadioMenu() {
      return (
        <Menu.Root>
          <Menu.Trigger data-testid="trigger">Toggle</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup data-testid="popup">
                <Menu.RadioGroup defaultValue="list">
                  <Menu.RadioItem value="list" data-testid="radio-list">
                    List
                  </Menu.RadioItem>
                  <Menu.RadioItem value="grid" data-testid="radio-grid">
                    Grid
                  </Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    it('selects a radio item and deselects the previous one, without closing the menu', async () => {
      const user = userEvent.setup();
      render(() => <TestRadioMenu />);
      await openMenu(user, screen.getByTestId('trigger'));

      expect(screen.getByTestId('radio-list')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('radio-grid')).toHaveAttribute('aria-checked', 'false');

      await user.click(screen.getByTestId('radio-grid'));

      expect(screen.getByTestId('radio-grid')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('radio-list')).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByTestId('popup')).not.toBe(null);
    });

    it('has role="menuitemradio" and role="group" on the group', async () => {
      const user = userEvent.setup();
      render(() => <TestRadioMenu />);
      await openMenu(user, screen.getByTestId('trigger'));

      expect(screen.getByTestId('radio-list')).toHaveAttribute('role', 'menuitemradio');
      expect(screen.getByRole('group')).not.toBe(null);
    });
  });

  describe('group label', () => {
    it('wires aria-labelledby on the group to the label element', async () => {
      const user = userEvent.setup();
      render(() => (
        <Menu.Root>
          <Menu.Trigger data-testid="trigger">Toggle</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup data-testid="popup">
                <Menu.Group data-testid="group">
                  <Menu.GroupLabel data-testid="group-label">Actions</Menu.GroupLabel>
                  <Menu.Item>Duplicate</Menu.Item>
                </Menu.Group>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      await openMenu(user, screen.getByTestId('trigger'));

      const group = screen.getByTestId('group');
      const label = screen.getByTestId('group-label');
      expect(group).toHaveAttribute('role', 'group');
      expect(label).toHaveAttribute('role', 'presentation');
      expect(group.getAttribute('aria-labelledby')).toBe(label.id);
    });
  });

  describe('submenu', () => {
    function TestSubmenu(props: { submenuRootProps?: Menu.SubmenuRoot.Props }) {
      return (
        <Menu.Root>
          <Menu.Trigger data-testid="trigger">Toggle</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner data-testid="positioner">
              <Menu.Popup data-testid="popup">
                <Menu.SubmenuRoot {...props.submenuRootProps}>
                  <Menu.SubmenuTrigger data-testid="submenu-trigger">More</Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner data-testid="sub-positioner">
                      <Menu.Popup data-testid="sub-popup">
                        <Menu.Item data-testid="sub-item-0">Sub Item 0</Menu.Item>
                        <Menu.Item data-testid="sub-item-1">Sub Item 1</Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    it('opens on ArrowRight and focuses the first submenu item, closes on ArrowLeft returning focus', async () => {
      render(() => <TestSubmenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      await waitFor(() => {
        expect(screen.getByTestId('submenu-trigger')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('submenu-trigger'), { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.getByTestId('sub-item-0')).toHaveFocus();
      });

      fireEvent.keyDown(screen.getByTestId('sub-item-0'), { key: 'ArrowLeft' });

      await waitFor(() => {
        expect(screen.getByTestId('submenu-trigger')).toHaveFocus();
      });
      await waitFor(() => {
        expect(screen.queryByTestId('sub-popup')).toBe(null);
      });
    });

    it('opens the submenu on hover after the open delay', async () => {
      render(() => <TestSubmenu />);
      // Open the parent menu with real timers first — `userEvent` schedules its own internal
      // delays via `setTimeout`, which would otherwise deadlock against fake timers that are
      // never advanced until after the (awaited) click settles.
      fireEvent.click(screen.getByTestId('trigger'));
      await waitFor(() => {
        expect(screen.getByTestId('popup')).not.toBe(null);
      });

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        const submenuTrigger = screen.getByTestId('submenu-trigger');
        fireEvent.pointerDown(submenuTrigger, { pointerType: 'mouse' });
        fireEvent.mouseEnter(submenuTrigger);
        fireEvent.mouseMove(submenuTrigger);

        vi.advanceTimersByTime(150);

        await vi.waitFor(() => {
          expect(screen.getByTestId('sub-popup')).not.toBe(null);
        });
      } finally {
        vi.useRealTimers();
      }
    });

    // Suspected shared-infra bug (see this port's final report): `useDismiss`'s cross-instance
    // "does a blocking child exist" check (`hasBlockingChild`, used to let a nested popup's Escape
    // take precedence over its parent's) reads the child's `open()` *synchronously, within the same
    // event dispatch* as the child's own Escape handler already having called `store.setOpen(false,
    // ...)`. Both the parent's and the submenu's `document`-level `keydown` listeners fire for the
    // same bubbled event (`event.stopPropagation()` does not stop *other* listeners on the same
    // node — only `stopImmediatePropagation()` would); when the submenu's listener runs first and
    // closes it, Solid's synchronous store writes mean the parent's `hasBlockingChild` check
    // (running second, for the same event) already observes the submenu as closed and no longer
    // "blocking" — so the parent closes too. Upstream React's automatic state-update batching means
    // a sibling's `setOpen` call inside the same event dispatch does not retroactively change what a
    // synchronous `open` read returns until the batch flushes after the event, so this coordination
    // works there; it does not transfer to Solid's synchronous reactivity. Confirmed via a debug
    // trace (both listeners fire for one `Escape` keydown; the tree/parent-child registration itself
    // is correct). Not worked around locally — doing so would require bypassing `useDismiss`'s
    // shared bubbling coordination entirely. Documented here rather than silently passing.
    it('closes the submenu (not the parent) on Escape by default', async () => {
      render(() => <TestSubmenu />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      await waitFor(() => expect(screen.getByTestId('submenu-trigger')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('submenu-trigger'), { key: 'ArrowRight' });
      await waitFor(() => expect(screen.getByTestId('sub-item-0')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('sub-item-0'), { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('sub-popup')).toBe(null);
      });
      // The parent menu remains open.
      expect(screen.getByTestId('popup')).not.toBe(null);
    });

    it('closes the whole tree on Escape when closeParentOnEsc is set', async () => {
      render(() => <TestSubmenu submenuRootProps={{ closeParentOnEsc: true }} />);
      const trigger = screen.getByTestId('trigger');
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      await waitFor(() => expect(screen.getByTestId('submenu-trigger')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('submenu-trigger'), { key: 'ArrowRight' });
      await waitFor(() => expect(screen.getByTestId('sub-item-0')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('sub-item-0'), { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('popup')).toBe(null);
      });
    });
  });

  describe('portal', () => {
    it('renders the popup into document.body', async () => {
      const user = userEvent.setup();
      render(() => <TestMenu />);
      await openMenu(user, screen.getByTestId('trigger'));

      const popup = screen.getByTestId('popup');
      expect(document.body.contains(popup)).toBe(true);
    });

    it('does not render when keepMounted is false and the menu is closed', () => {
      render(() => <TestMenu />);
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });
});
