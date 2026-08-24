// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { resetAnimationFrameScheduler } from '../../base-utils/createAnimationFrame';
import { ContextMenu } from '../index';

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

describe('<ContextMenu.Trigger />', () => {
  it('should open menu on right click (context menu event)', () => {
    render(() => (
      <ContextMenu.Root>
        <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup />
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    ));

    const trigger = screen.getByTestId('trigger');
    fireEvent.contextMenu(trigger);

    expect(screen.queryByRole('menu')).not.toBe(null);
  });

  it('adds open state attributes', async () => {
    const user = userEvent.setup();

    render(() => (
      <ContextMenu.Root defaultOpen>
        <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup />
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    ));

    const trigger = screen.getByTestId('trigger');
    expect(trigger).toHaveAttribute('data-popup-open', '');

    await user.keyboard('{Escape}');
    expect(trigger).not.toHaveAttribute('data-popup-open');
  });

  it('should call onOpenChange when menu is opened via right click', () => {
    const onOpenChange = vi.fn();

    render(() => (
      <ContextMenu.Root onOpenChange={onOpenChange}>
        <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup />
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    ));

    const trigger = screen.getByTestId('trigger');
    fireEvent.contextMenu(trigger);

    expect(onOpenChange.mock.lastCall?.[0]).toBe(true);
  });

  it('does not cancel opening menu on mouseup after mousedown outside before 500ms', () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup />
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger');
      fireEvent.mouseDown(trigger);
      fireEvent.contextMenu(trigger);

      vi.advanceTimersByTime(499);

      expect(onOpenChange.mock.calls.length).toBe(1);
      expect(onOpenChange.mock.lastCall?.[0]).toBe(true);

      fireEvent.mouseUp(document.body);

      vi.advanceTimersByTime(1);

      expect(onOpenChange.mock.calls.length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels opening menu on mouseup after mousedown outside after 500ms', () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup />
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger');
      fireEvent.mouseDown(trigger);
      fireEvent.contextMenu(trigger);

      vi.advanceTimersByTime(501);

      fireEvent.mouseUp(document.body);

      expect(onOpenChange.mock.calls.length).toBe(2);
      expect(onOpenChange.mock.lastCall?.[0]).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('prop: disabled', () => {
    it('does not open on right-click when disabled', () => {
      const onOpenChange = vi.fn();

      render(() => (
        <ContextMenu.Root disabled onOpenChange={onOpenChange}>
          <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup data-testid="popup" />
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger');
      fireEvent.contextMenu(trigger);

      expect(screen.queryByTestId('popup')).toBe(null);
      expect(onOpenChange.mock.calls.length).toBe(0);
    });

    it('does not block the native context menu when disabled', () => {
      render(() => (
        <ContextMenu.Root disabled>
          <ContextMenu.Trigger data-testid="trigger">Right click me</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup data-testid="popup" />
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      const trigger = screen.getByTestId('trigger');

      let defaultPrevented = false;
      trigger.addEventListener('contextmenu', (event) => {
        defaultPrevented = event.defaultPrevented;
      });

      fireEvent.contextMenu(trigger);

      expect(defaultPrevented).toBe(false);
    });
  });

  // jsdom doesn't dispatch real `Touch`/`TouchEvent` pointer semantics; `fireEvent.touchStart`
  // with a plain `touches` array still exercises this component's own long-press timer/threshold
  // logic (the same technique upstream's own (non-skipped) tests rely on), so these are kept.
  describe('long press', () => {
    it('should open menu on long press on touchscreen devices', () => {
      vi.useFakeTimers();
      try {
        render(() => (
          <ContextMenu.Root>
            <ContextMenu.Trigger data-testid="trigger">Long press me</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner>
                <ContextMenu.Popup />
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ));

        const trigger = screen.getByTestId('trigger');

        fireEvent.touchStart(trigger, {
          touches: [{ identifier: 0, clientX: 100, clientY: 100 }],
        });

        vi.advanceTimersByTime(500);

        expect(screen.queryByRole('menu')).not.toBe(null);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should cancel long press when touch moves beyond threshold', () => {
      vi.useFakeTimers();
      try {
        const onOpenChange = vi.fn();

        render(() => (
          <ContextMenu.Root onOpenChange={onOpenChange}>
            <ContextMenu.Trigger data-testid="trigger">Long press me</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner>
                <ContextMenu.Popup />
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ));

        const trigger = screen.getByTestId('trigger');

        fireEvent.touchStart(trigger, {
          touches: [{ identifier: 0, clientX: 100, clientY: 100 }],
        });

        fireEvent.touchMove(trigger, {
          touches: [{ identifier: 0, clientX: 120, clientY: 100 }],
        });

        vi.advanceTimersByTime(500);

        expect(screen.queryByRole('menu')).toBe(null);
        expect(onOpenChange.mock.calls.length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not open on long press when disabled', () => {
      vi.useFakeTimers();
      try {
        const onOpenChange = vi.fn();

        render(() => (
          <ContextMenu.Root disabled onOpenChange={onOpenChange}>
            <ContextMenu.Trigger data-testid="trigger">Long press me</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner>
                <ContextMenu.Popup data-testid="popup" />
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        ));

        const trigger = screen.getByTestId('trigger');

        fireEvent.touchStart(trigger, {
          touches: [{ identifier: 0, clientX: 100, clientY: 100 }],
        });

        vi.advanceTimersByTime(500);

        expect(screen.queryByTestId('popup')).toBe(null);
        expect(onOpenChange.mock.calls.length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('should handle nested context menus correctly', () => {
    render(() => (
      <ContextMenu.Root>
        <ContextMenu.Trigger data-testid="outer-trigger">
          outer
          <ContextMenu.Root>
            <ContextMenu.Trigger>inner</ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Positioner>
                <ContextMenu.Popup data-testid="inner-menu" />
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup data-testid="outer-menu" />
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    ));

    const innerTrigger = screen.getByText('inner');
    const outerTrigger = screen.getByText('outer');

    fireEvent.contextMenu(innerTrigger);

    expect(screen.queryByTestId('inner-menu')).not.toBe(null);
    expect(screen.queryByTestId('outer-menu')).toBe(null);

    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });

    expect(screen.queryByTestId('inner-menu')).toBe(null);

    fireEvent.contextMenu(outerTrigger);

    expect(screen.queryByTestId('outer-menu')).not.toBe(null);
    expect(screen.queryByTestId('inner-menu')).toBe(null);
  });
});
