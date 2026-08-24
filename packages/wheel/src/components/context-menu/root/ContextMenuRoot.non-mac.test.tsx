// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { resetAnimationFrameScheduler } from '../../base-utils/createAnimationFrame';
import { ContextMenu } from '../index';

vi.mock('../../base-utils/platform/index', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../base-utils/platform/index')>();

  return {
    ...actual,
    platform: {
      ...actual.platform,
      os: { ...actual.platform.os, mac: false, apple: false },
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

describe('<ContextMenu.Root /> (non-Mac)', () => {
  describe('interactions', () => {
    it('ignores context menu mouseup on non-Mac platforms', () => {
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

      fireEvent.pointerMove(document.body, { clientX: 24, clientY: 24 });
      fireEvent.mouseUp(item, { button: 2, clientX: 24, clientY: 24 });

      expect(screen.queryByTestId('context-popup')).not.toBe(null);
      expect(onOpenChange.mock.calls.length).toBe(1);
    });
  });
});
