// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { resetAnimationFrameScheduler } from '../base-utils/createAnimationFrame';
import { Menubar } from './Menubar';
import { Menu } from '../menu/index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

// See `menu/Menu.test.tsx`'s identical setup for the rationale (mocked `requestAnimationFrame`
// deferred to a microtask, `resetAnimationFrameScheduler` teardown).
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
  resetAnimationFrameScheduler();
});

/**
 * Mirrors upstream `Menubar.test.tsx`'s `ContainedTriggerMenubar` — the only trigger arrangement
 * this port's Menu supports end to end (no `handle`/detached-trigger support — see
 * `menu/root/MenuRoot.tsx`'s doc comment), so upstream's "detached triggers" and "multiple
 * contained triggers" (both handle-based) `describe.for` variants aren't ported.
 */
function TestMenubar(props: Menubar.Props) {
  return (
    <Menubar {...props} style={{ 'max-width': '25vw', display: 'flex' }}>
      <Menu.Root>
        <Menu.Trigger data-testid="file-trigger">File</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner data-testid="file-menu">
            <Menu.Popup>
              <Menu.Item data-testid="file-item-1">Open</Menu.Item>
              <Menu.Item data-testid="file-item-2">Save</Menu.Item>
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger data-testid="share-trigger">Share</Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner data-testid="share-menu">
                    <Menu.Popup>
                      <Menu.Item data-testid="share-item-1">Email</Menu.Item>
                      <Menu.Item data-testid="share-item-2">Print</Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Menu.Root>
        <Menu.Trigger data-testid="edit-trigger">Edit</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner data-testid="edit-menu">
            <Menu.Popup>
              <Menu.Item data-testid="edit-item-1">Copy</Menu.Item>
              <Menu.Item data-testid="edit-item-2">Paste</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Menu.Root>
        <Menu.Trigger data-testid="view-trigger">View</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner data-testid="view-menu">
            <Menu.Popup>
              <Menu.Item data-testid="view-item-1">Zoom In</Menu.Item>
              <Menu.Item data-testid="view-item-2">Zoom Out</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Menubar>
  );
}

describe('<Menubar />', () => {
  describe('role', () => {
    it('sets role="menubar" on the root element', () => {
      render(() => <TestMenubar />);
      expect(screen.queryByRole('menubar')).not.toBe(null);
    });

    it('sets aria-orientation on the root element', () => {
      render(() => <Menubar orientation="vertical" />);
      expect(screen.getByRole('menubar')).toHaveAttribute('aria-orientation', 'vertical');
    });

    it('defaults aria-orientation to horizontal', () => {
      render(() => <Menubar />);
      expect(screen.getByRole('menubar')).toHaveAttribute('aria-orientation', 'horizontal');
    });

    it('sets role="menuitem" on menu triggers', () => {
      render(() => <TestMenubar />);
      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(3);
    });

    it('sets data-modal by default', () => {
      render(() => <Menubar />);
      expect(screen.getByRole('menubar')).toHaveAttribute('data-modal');
    });

    it('omits data-modal when modal is false', () => {
      render(() => <Menubar modal={false} />);
      expect(screen.getByRole('menubar')).not.toHaveAttribute('data-modal');
    });
  });

  describe('click interactions', () => {
    it('should open the menu after clicking on its trigger and close it when clicking again', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);

      const fileTrigger = screen.getByTestId('file-trigger');

      await user.click(fileTrigger);
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });

      await user.click(fileTrigger);
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).toBe(null);
      });
    });
  });

  describe('data-has-submenu-open', () => {
    it('is set on the menubar while a submenu is open and cleared when it closes', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);

      const fileTrigger = screen.getByTestId('file-trigger');
      await user.click(fileTrigger);

      await waitFor(() => {
        expect(screen.getByRole('menubar')).toHaveAttribute('data-has-submenu-open');
      });

      await user.click(fileTrigger);
      await waitFor(() => {
        expect(screen.getByRole('menubar')).not.toHaveAttribute('data-has-submenu-open');
      });
    });
  });

  describe('focus behavior', () => {
    it('focuses a menubar item without immediately opening the menu', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);

      await user.tab();

      await waitFor(() => {
        expect(screen.getByTestId('file-trigger')).toHaveFocus();
      });
      expect(screen.queryByTestId('file-menu')).toBe(null);

      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });
    });
  });

  describe('keyboard interactions', () => {
    it('should navigate between menubar items with arrow keys', async () => {
      render(() => <TestMenubar />);

      const fileTrigger = screen.getByTestId('file-trigger');
      const editTrigger = screen.getByTestId('edit-trigger');

      fileTrigger.focus();
      await waitFor(() => expect(fileTrigger).toHaveFocus());

      fireEvent.keyDown(fileTrigger, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(editTrigger).toHaveFocus();
      });
    });

    it('moves focus to the first and last triggers with Home and End', async () => {
      render(() => <TestMenubar />);

      const fileTrigger = screen.getByTestId('file-trigger');
      const viewTrigger = screen.getByTestId('view-trigger');

      fileTrigger.focus();
      await waitFor(() => expect(fileTrigger).toHaveFocus());

      fireEvent.keyDown(fileTrigger, { key: 'End' });
      await waitFor(() => {
        expect(viewTrigger).toHaveFocus();
      });

      fireEvent.keyDown(viewTrigger, { key: 'Home' });
      await waitFor(() => {
        expect(fileTrigger).toHaveFocus();
      });
    });

    it('should open the menu with the Space key', async () => {
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      await waitFor(() => expect(fileTrigger).toHaveFocus());

      fireEvent.keyDown(fileTrigger, { key: ' ' });

      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });
    });

    it('should navigate within the menu using arrow keys', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      // `Enter` on a native `<button>` relies on the browser's own default action (firing a
      // `click`) — `fireEvent.keyDown` doesn't synthesize that in jsdom, but `userEvent.keyboard`
      // does (matching upstream's `user.keyboard('{Enter}')`).
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });

      const firstItem = screen.getByTestId('file-item-1');
      await waitFor(() => expect(firstItem).toHaveFocus());

      fireEvent.keyDown(firstItem, { key: 'ArrowDown' });
      const secondItem = screen.getByTestId('file-item-2');
      await waitFor(() => expect(secondItem).toHaveFocus());

      fireEvent.keyDown(secondItem, { key: 'ArrowDown' });
      const shareTrigger = screen.getByTestId('share-trigger');
      await waitFor(() => expect(shareTrigger).toHaveFocus());
    });

    it('should open the submenu with the right arrow key', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      await user.keyboard('{Enter}');

      await waitFor(() => expect(screen.getByTestId('file-item-1')).toHaveFocus());
      fireEvent.keyDown(screen.getByTestId('file-item-1'), { key: 'ArrowDown' });
      await waitFor(() => expect(screen.getByTestId('file-item-2')).toHaveFocus());
      fireEvent.keyDown(screen.getByTestId('file-item-2'), { key: 'ArrowDown' });

      const shareTrigger = screen.getByTestId('share-trigger');
      await waitFor(() => expect(shareTrigger).toHaveFocus());

      fireEvent.keyDown(shareTrigger, { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.queryByTestId('share-menu')).not.toBe(null);
      });
      await waitFor(() => {
        expect(screen.getByTestId('share-item-1')).toHaveFocus();
      });
    });

    it('should close the submenu with the left arrow key and return focus to the submenu trigger', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => expect(screen.getByTestId('file-item-1')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('file-item-1'), { key: 'ArrowDown' });
      await waitFor(() => expect(screen.getByTestId('file-item-2')).toHaveFocus());

      fireEvent.keyDown(screen.getByTestId('file-item-2'), { key: 'ArrowDown' });
      const shareTrigger = screen.getByTestId('share-trigger');
      await waitFor(() => expect(shareTrigger).toHaveFocus());

      fireEvent.keyDown(shareTrigger, { key: 'ArrowRight' });
      await waitFor(() => {
        expect(screen.queryByTestId('share-menu')).not.toBe(null);
      });

      fireEvent.keyDown(screen.getByTestId('share-item-1'), { key: 'ArrowLeft' });

      await waitFor(() => {
        expect(screen.queryByTestId('share-menu')).toBe(null);
      });
      await waitFor(() => {
        expect(shareTrigger).toHaveFocus();
      });
    });

    it('should close the menu with the Escape key', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });

      fireEvent.keyDown(screen.getByTestId('file-item-1'), { key: 'Escape' });
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).toBe(null);
      });
    });

    // Matches upstream's `skipIf(!isJSDOM)` variant of this test (opposite of the browser-only
    // hover-behavior tests): navigating with the arrow keys while a menu is already open closes it
    // and opens the next one, driven by `Menu.Trigger`'s `useFocus` wiring (enabled only once a
    // sibling submenu is already open — see `menu/trigger/MenuTrigger.tsx`).
    it('should navigate between menus using left/right arrow keys when menus are open', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar />);
      const fileTrigger = screen.getByTestId('file-trigger');

      fileTrigger.focus();
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });

      fireEvent.keyDown(fileTrigger, { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).toBe(null);
      });
      await waitFor(() => {
        expect(screen.queryByTestId('edit-menu')).not.toBe(null);
      });
    });
  });

  describe('prop: loopFocus', () => {
    describe('when loopFocus == true (default)', () => {
      it('loops around to the first item after the last one', async () => {
        render(() => <TestMenubar loopFocus />);
        const firstItem = screen.getByTestId('file-trigger');
        const lastItem = screen.getByTestId('view-trigger');

        firstItem.focus();
        fireEvent.keyDown(firstItem, { key: 'ArrowRight' });
        await waitFor(() => expect(screen.getByTestId('edit-trigger')).toHaveFocus());
        fireEvent.keyDown(screen.getByTestId('edit-trigger'), { key: 'ArrowRight' });
        await waitFor(() => expect(lastItem).toHaveFocus());

        fireEvent.keyDown(lastItem, { key: 'ArrowRight' });
        await waitFor(() => expect(firstItem).toHaveFocus());
      });

      it('loops around to the last item after the first one', async () => {
        render(() => <TestMenubar loopFocus />);
        const fileTrigger = screen.getByTestId('file-trigger');
        const lastItem = screen.getByTestId('view-trigger');

        fileTrigger.focus();
        await waitFor(() => expect(fileTrigger).toHaveFocus());

        fireEvent.keyDown(fileTrigger, { key: 'ArrowLeft' });
        await waitFor(() => expect(lastItem).toHaveFocus());
      });
    });

    describe('when loopFocus == false', () => {
      it('stays on the last item when navigating beyond it', async () => {
        render(() => <TestMenubar loopFocus={false} />);
        const fileTrigger = screen.getByTestId('file-trigger');
        const lastItem = screen.getByTestId('view-trigger');

        fileTrigger.focus();
        fireEvent.keyDown(fileTrigger, { key: 'ArrowRight' });
        await waitFor(() => expect(screen.getByTestId('edit-trigger')).toHaveFocus());

        fireEvent.keyDown(screen.getByTestId('edit-trigger'), { key: 'ArrowRight' });
        await waitFor(() => expect(lastItem).toHaveFocus());

        fireEvent.keyDown(lastItem, { key: 'ArrowRight' });
        await waitFor(() => expect(lastItem).toHaveFocus());
      });

      it('stays on the first item when navigating before it', async () => {
        render(() => <TestMenubar loopFocus={false} />);
        const firstItem = screen.getByTestId('file-trigger');

        firstItem.focus();
        fireEvent.keyDown(firstItem, { key: 'ArrowLeft' });
        await waitFor(() => expect(firstItem).toHaveFocus());
      });
    });
  });

  describe('prop: disabled', () => {
    it('disables child menus when the menubar is disabled', async () => {
      const user = userEvent.setup();
      render(() => <TestMenubar disabled />);

      const fileTrigger = screen.getByTestId('file-trigger');

      expect(fileTrigger).toHaveAttribute('disabled');

      await user.tab();
      expect(fileTrigger).not.toHaveFocus();

      await user.click(fileTrigger);
      expect(screen.queryByTestId('file-menu')).toBe(null);
    });

    it('keeps the menubar reachable when the first trigger is disabled', async () => {
      const user = userEvent.setup();
      render(() => (
        <Menubar style={{ display: 'flex' }}>
          <Menu.Root>
            <Menu.Trigger disabled data-testid="file-trigger">
              File
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.Item>Open</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <Menu.Trigger data-testid="edit-trigger">Edit</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.Item>Copy</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      ));

      const fileTrigger = screen.getByTestId('file-trigger');
      const editTrigger = screen.getByTestId('edit-trigger');

      expect(fileTrigger).toHaveAttribute('disabled');
      expect(fileTrigger).toHaveAttribute('tabindex', '-1');
      expect(editTrigger).toHaveAttribute('tabindex', '0');

      await user.tab();
      expect(editTrigger).toHaveFocus();
    });

    it('disables menu items while the menubar is disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(() => (
        <Menubar disabled>
          <Menu.Root open>
            <Menu.Trigger data-testid="file-trigger">File</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.Item data-testid="file-item" onClick={handleClick}>
                    Open
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      ));

      const item = screen.getByTestId('file-item');
      expect(item).toHaveAttribute('aria-disabled', 'true');

      await user.click(item);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('touch interactions', () => {
    it('closes the entire tree on a single outside press after opening a submenu', async () => {
      render(() => (
        <div>
          <TestMenubar />
          <button type="button" data-testid="outside">
            Outside
          </button>
        </div>
      ));

      const fileTrigger = screen.getByTestId('file-trigger');

      fireEvent.pointerDown(fileTrigger, { pointerType: 'touch' });
      fireEvent.mouseDown(fileTrigger);

      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).not.toBe(null);
      });

      const shareTrigger = await screen.findByTestId('share-trigger');
      fireEvent.pointerDown(shareTrigger, { pointerType: 'touch' });
      fireEvent.mouseDown(shareTrigger);

      await waitFor(() => {
        expect(screen.queryByTestId('share-menu')).not.toBe(null);
      });

      const outside = screen.getByTestId('outside');
      fireEvent.pointerDown(outside, { pointerType: 'touch' });
      fireEvent.mouseDown(outside);

      await waitFor(() => {
        expect(screen.queryByTestId('share-menu')).toBe(null);
      });
      await waitFor(() => {
        expect(screen.queryByTestId('file-menu')).toBe(null);
      });
    });
  });
});
