// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { resetAnimationFrameScheduler } from '../../base-utils/createAnimationFrame';
import { REASONS } from '../../internals/reasons';
import { ContextMenu } from '../index';

vi.mock('../../base-utils/platform/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../base-utils/platform/index')>();

  return {
    ...actual,
    platform: {
      ...actual.platform,
      os: { ...actual.platform.os, mac: true, apple: true },
    },
  };
});

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

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

describe('<ContextMenu.Root /> (mac)', () => {
  describe('interactions', () => {
    it('closes nested submenus when releasing the context menu pointer over an item', async () => {
      const user = userEvent.setup();
      const rootOnOpenChange = vi.fn();
      const submenuOnOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={rootOnOpenChange}>
          <ContextMenu.Trigger data-testid="context-trigger">Surface</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup data-testid="context-root-popup">
                <ContextMenu.SubmenuRoot defaultOpen onOpenChange={submenuOnOpenChange}>
                  <ContextMenu.SubmenuTrigger delay={1} data-testid="context-submenu-trigger">
                    More options
                  </ContextMenu.SubmenuTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Positioner>
                      <ContextMenu.Popup data-testid="context-submenu-popup">
                        <ContextMenu.Item data-testid="context-submenu-item">
                          Deep action
                        </ContextMenu.Item>
                      </ContextMenu.Popup>
                    </ContextMenu.Positioner>
                  </ContextMenu.Portal>
                </ContextMenu.SubmenuRoot>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('context-trigger');

      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10, button: 2 });

      expect(screen.getByTestId('context-root-popup')).not.toBe(null);

      const submenuTrigger = screen.getByTestId('context-submenu-trigger');
      await user.hover(submenuTrigger);

      await waitFor(() => {
        expect(screen.getByTestId('context-submenu-popup')).not.toBe(null);
      });

      const submenuItem = screen.getByTestId('context-submenu-item');
      fireEvent.mouseUp(submenuItem, { button: 2 });

      await waitFor(() => {
        expect(screen.queryByTestId('context-submenu-popup')).toBe(null);
      });
      await waitFor(() => {
        expect(screen.queryByTestId('context-root-popup')).toBe(null);
      });

      expect(submenuOnOpenChange.mock.lastCall?.[0]).toBe(false);
      expect(submenuOnOpenChange.mock.lastCall?.[1].reason).toBe(REASONS.itemPress);
      expect(rootOnOpenChange.mock.lastCall?.[0]).toBe(false);
      expect(rootOnOpenChange.mock.lastCall?.[1].reason).toBe(REASONS.itemPress);
    });

    it('ignores mouseup directly under the cursor when the context menu spawns there', () => {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="context-trigger">Surface</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner alignOffset={0}>
              <ContextMenu.Popup data-testid="context-popup">
                <ContextMenu.Item data-testid="context-item">Action</ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('context-trigger');

      fireEvent.contextMenu(trigger, { clientX: 12, clientY: 12, button: 2 });

      const item = screen.getByTestId('context-item');
      fireEvent.mouseUp(item, { button: 2, clientX: 12, clientY: 12 });

      expect(screen.queryByTestId('context-popup')).not.toBe(null);
      expect(onOpenChange.mock.calls.length).toBe(1);
    });

    it('ignores mouseup directly under the cursor when alignOffset is negative', () => {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="context-trigger">Surface</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner alignOffset={-5}>
              <ContextMenu.Popup data-testid="context-popup">
                <ContextMenu.Item data-testid="context-item">Action</ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('context-trigger');

      fireEvent.contextMenu(trigger, { clientX: 18, clientY: 18, button: 2 });

      const item = screen.getByTestId('context-item');
      fireEvent.mouseUp(item, { button: 2, clientX: 18, clientY: 18 });

      expect(screen.queryByTestId('context-popup')).not.toBe(null);
      expect(onOpenChange.mock.calls.length).toBe(1);
    });

    it('allows mouseup after leaving the initial cursor point', async () => {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="context-trigger">Surface</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner alignOffset={0}>
              <ContextMenu.Popup data-testid="context-popup">
                <ContextMenu.Item data-testid="context-item">Action</ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('context-trigger');

      fireEvent.contextMenu(trigger, { clientX: 20, clientY: 20, button: 2 });

      const item = screen.getByTestId('context-item');

      fireEvent.pointerMove(document.body, { clientX: 24, clientY: 24 });
      fireEvent.mouseUp(item, { button: 2, clientX: 24, clientY: 24 });

      // The item's `.click()`-driven close (see `createMenuItemCommonProps.ts`) is deferred a
      // microtask by `Menu.Popup`'s `close` handler; unlike the other assertions in this file,
      // this one can't be synchronous.
      await waitFor(() => {
        expect(screen.queryByTestId('context-popup')).toBe(null);
      });
      expect(onOpenChange.mock.lastCall?.[0]).toBe(false);
    });

    it('does not open when disabled', () => {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root disabled onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="context-trigger">Surface</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup data-testid="context-popup">
                <ContextMenu.Item>Action</ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('context-trigger');

      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10, button: 2 });

      expect(screen.queryByTestId('context-popup')).toBe(null);
      expect(onOpenChange.mock.calls.length).toBe(0);
    });
  });
});
