// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { DirectionProvider } from '../../direction-provider';
import { ScrollArea } from '../index';
import { SCROLL_TIMEOUT } from '../constants';

afterEach(cleanup);

describe('<ScrollArea.Scrollbar />', () => {
  it('renders a div and forwards the orientation prop', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <div />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="horizontal" keepMounted data-testid="scrollbar" />
      </ScrollArea.Root>
    ));

    const scrollbar = getByTestId('scrollbar');
    expect(scrollbar.tagName).toBe('DIV');
    expect(scrollbar).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('defaults to vertical orientation', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <div />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar keepMounted data-testid="scrollbar" />
      </ScrollArea.Root>
    ));

    expect(getByTestId('scrollbar')).toHaveAttribute('data-orientation', 'vertical');
  });

  it('is not rendered when the corresponding axis has no overflow and keepMounted is false', () => {
    const { queryByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <div />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" data-testid="scrollbar" />
      </ScrollArea.Root>
    ));

    // No scrollable content was ever measured, so the vertical axis stays hidden by default
    // (`DEFAULT_HIDDEN_STATE = { x: true, y: true, corner: true }`).
    expect(queryByTestId('scrollbar')).toBe(null);
  });

  it('stays mounted when keepMounted is set even without overflow', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport>
          <div />
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" keepMounted data-testid="scrollbar" />
      </ScrollArea.Root>
    ));

    expect(getByTestId('scrollbar')).toBeTruthy();
  });

  describe('data-scrolling attribute', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('adds [data-scrolling] attribute when viewport is scrolled in the correct direction', () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" data-testid="vertical" keepMounted />
          <ScrollArea.Scrollbar orientation="horizontal" data-testid="horizontal" keepMounted />
          <ScrollArea.Corner />
        </ScrollArea.Root>
      ));

      const verticalScrollbar = screen.getByTestId('vertical');
      const horizontalScrollbar = screen.getByTestId('horizontal');
      const viewport = screen.getByTestId('viewport');

      expect(verticalScrollbar).not.toHaveAttribute('data-scrolling');
      expect(horizontalScrollbar).not.toHaveAttribute('data-scrolling');

      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollTop: 1 } });

      expect(verticalScrollbar).toHaveAttribute('data-scrolling', '');
      expect(horizontalScrollbar).not.toHaveAttribute('data-scrolling');

      vi.advanceTimersByTime(SCROLL_TIMEOUT - 1);

      expect(verticalScrollbar).toHaveAttribute('data-scrolling', '');
      expect(horizontalScrollbar).not.toHaveAttribute('data-scrolling');

      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollLeft: 1 } });

      vi.advanceTimersByTime(1); // vertical just finished

      expect(verticalScrollbar).not.toHaveAttribute('data-scrolling');
      expect(horizontalScrollbar).toHaveAttribute('data-scrolling');

      vi.advanceTimersByTime(SCROLL_TIMEOUT - 2); // already ticked 1ms above

      expect(verticalScrollbar).not.toHaveAttribute('data-scrolling');
      expect(horizontalScrollbar).toHaveAttribute('data-scrolling');

      vi.advanceTimersByTime(1);

      expect(verticalScrollbar).not.toHaveAttribute('data-scrolling');
      expect(horizontalScrollbar).not.toHaveAttribute('data-scrolling');
    });
  });

  describe('data-hovering attribute', () => {
    it('adds [data-hovering] while the pointer is over the root', () => {
      // `Root`'s own `onPointerEnter`/`onPointerLeave` (not `Viewport`'s) drive `hovering`, and
      // neither `pointerenter` nor `pointerleave` bubbles — so the events must target the root
      // element itself (matching how a real pointer entering/leaving the whole scroll area
      // fires these at the outermost element), not a descendant.
      render(() => (
        <ScrollArea.Root data-testid="root" style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" data-testid="vertical" keepMounted />
        </ScrollArea.Root>
      ));

      const root = screen.getByTestId('root');
      const verticalScrollbar = screen.getByTestId('vertical');

      fireEvent.pointerLeave(root, { pointerType: 'mouse' });
      expect(verticalScrollbar).not.toHaveAttribute('data-hovering');

      fireEvent.pointerEnter(root, { pointerType: 'mouse' });

      expect(verticalScrollbar).toHaveAttribute('data-hovering', '');

      fireEvent.pointerLeave(root, { pointerType: 'mouse' });

      expect(verticalScrollbar).not.toHaveAttribute('data-hovering');
    });
  });

  describe('track pointer down', () => {
    it('ignores thumb clicks (pointerdown bubbling up from the thumb)', () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" data-testid="vertical" keepMounted>
            <ScrollArea.Thumb data-testid="thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      ));

      const viewport = screen.getByTestId('viewport') as HTMLDivElement;
      const verticalScrollbar = screen.getByTestId('vertical');
      const thumb = screen.getByTestId('thumb');

      Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 200 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, writable: true, value: 0 },
      });

      Object.defineProperties(verticalScrollbar, {
        offsetHeight: { configurable: true, value: 200 },
        getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      });

      Object.defineProperties(thumb, {
        offsetHeight: { configurable: true, value: 40 },
        // The thumb's own `onPointerDown` (pointer-drag start) also fires here since
        // `pointerdown` bubbles from the thumb up to the scrollbar; stub the capture API it
        // calls unconditionally so that unrelated codepath doesn't throw in jsdom.
        setPointerCapture: { configurable: true, value: () => {} },
      });

      // `pointerdown` bubbles, so this reaches the scrollbar's own listener with `thumb` as the
      // real DOM target — the scrollbar must recognize the click landed on its thumb and ignore it.
      fireEvent.pointerDown(thumb, { button: 0, clientY: 160, pointerId: 1 });

      expect(viewport.scrollTop).toBe(0);
    });

    it('marks the scroll area as scrolling when pressing the track', async () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" data-testid="vertical" keepMounted>
            <ScrollArea.Thumb data-testid="thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      ));

      const viewport = screen.getByTestId('viewport') as HTMLDivElement;
      const verticalScrollbar = screen.getByTestId('vertical');
      const thumb = screen.getByTestId('thumb');

      Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 200 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, writable: true, value: 0 },
      });

      Object.defineProperties(verticalScrollbar, {
        offsetHeight: { configurable: true, value: 200 },
        getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      });

      Object.defineProperties(thumb, {
        offsetHeight: { configurable: true, value: 40 },
        setPointerCapture: { configurable: true, value: () => {} },
      });

      fireEvent.pointerDown(verticalScrollbar, { button: 0, clientY: 160, pointerId: 1 });

      expect(viewport.scrollTop).not.toBe(0);
      await waitFor(() => expect(verticalScrollbar).toHaveAttribute('data-scrolling'));
    });

    it('clears track drag state on pointer cancel', () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar orientation="vertical" data-testid="vertical" keepMounted>
            <ScrollArea.Thumb data-testid="thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      ));

      const viewport = screen.getByTestId('viewport') as HTMLDivElement;
      const verticalScrollbar = screen.getByTestId('vertical');
      const thumb = screen.getByTestId('thumb');

      Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 200 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollTop: { configurable: true, writable: true, value: 0 },
      });

      Object.defineProperties(verticalScrollbar, {
        offsetHeight: { configurable: true, value: 200 },
        getBoundingClientRect: { configurable: true, value: () => ({ top: 0 }) },
      });

      Object.defineProperties(thumb, {
        offsetHeight: { configurable: true, value: 40 },
        setPointerCapture: { configurable: true, value: () => {} },
        hasPointerCapture: { configurable: true, value: () => false },
      });

      fireEvent.pointerDown(verticalScrollbar, { button: 0, clientY: 160, pointerId: 1 });

      const scrollTopAfterTrackPress = viewport.scrollTop;

      fireEvent.pointerCancel(verticalScrollbar, { pointerId: 1 });
      fireEvent.pointerMove(thumb, { clientY: 180, pointerId: 1 });

      expect(viewport.scrollTop).toBe(scrollTopAfterTrackPress);
    });
  });

  // Upstream's `describe.skipIf(isJSDOM)('non-positive thumb offset')` renders a real, styled
  // track/thumb and waits for `thumb.offsetHeight` to reflect actual CSS layout before dragging.
  // jsdom has no layout engine (`offsetHeight` never becomes positive from styles alone), so
  // these 4 cases aren't portable; skipped per CONVENTIONS.md. The underlying
  // `maxThumbOffset <= 0` guards are still exercised indirectly by the pointer-drag/track-press
  // tests above, which mock `offsetHeight`/`offsetWidth` directly.

  describe('wheel', () => {
    function renderWheelTest(options: {
      direction?: 'ltr' | 'rtl';
      orientation?: 'horizontal' | 'vertical';
      scrollLeft?: number;
      scrollTop?: number;
    }) {
      const {
        direction = 'ltr',
        orientation = 'horizontal',
        scrollLeft = 0,
        scrollTop = 0,
      } = options;

      render(() => (
        <DirectionProvider direction={direction}>
          <ScrollArea.Root style={{ width: '200px', height: '200px', direction }}>
            <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
              <div style={{ width: '1000px', height: '1000px' }} />
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation={orientation} data-testid="scrollbar" keepMounted />
          </ScrollArea.Root>
        </DirectionProvider>
      ));

      const viewport = screen.getByTestId('viewport') as HTMLDivElement;
      const scrollbar = screen.getByTestId('scrollbar');

      Object.defineProperties(viewport, {
        clientHeight: { configurable: true, value: 200 },
        clientWidth: { configurable: true, value: 200 },
        scrollHeight: { configurable: true, value: 1000 },
        scrollWidth: { configurable: true, value: 1000 },
        scrollLeft: { configurable: true, writable: true, value: scrollLeft },
        scrollTop: { configurable: true, writable: true, value: scrollTop },
      });

      return { viewport, scrollbar };
    }

    it('allows horizontal scrolling away from the RTL start edge', () => {
      const { viewport, scrollbar } = renderWheelTest({ direction: 'rtl' });

      fireEvent.wheel(scrollbar, { deltaX: -50 });

      expect(viewport.scrollLeft).toBe(-50);
    });

    it('clamps horizontal LTR wheel scrolling at both edges', () => {
      const { viewport, scrollbar } = renderWheelTest({ direction: 'ltr' });

      fireEvent.wheel(scrollbar, { deltaX: -50 });
      expect(viewport.scrollLeft).toBe(0);

      viewport.scrollLeft = 790;
      fireEvent.wheel(scrollbar, { deltaX: 50 });
      expect(viewport.scrollLeft).toBe(800);

      fireEvent.wheel(scrollbar, { deltaX: 50 });
      expect(viewport.scrollLeft).toBe(800);
    });

    it('clamps horizontal RTL wheel scrolling at both edges', () => {
      const { viewport, scrollbar } = renderWheelTest({ direction: 'rtl' });

      fireEvent.wheel(scrollbar, { deltaX: 50 });
      expect(viewport.scrollLeft).toBe(0);

      viewport.scrollLeft = -100;
      fireEvent.wheel(scrollbar, { deltaX: 50 });
      expect(viewport.scrollLeft).toBe(-50);

      viewport.scrollLeft = -790;
      fireEvent.wheel(scrollbar, { deltaX: -50 });
      expect(viewport.scrollLeft).toBe(-800);

      fireEvent.wheel(scrollbar, { deltaX: -50 });
      expect(viewport.scrollLeft).toBe(-800);

      viewport.scrollLeft = -10;
      fireEvent.wheel(scrollbar, { deltaX: 50 });
      expect(viewport.scrollLeft).toBe(0);
    });

    it('clamps vertical wheel scrolling at both edges', () => {
      const { viewport, scrollbar } = renderWheelTest({ orientation: 'vertical' });

      fireEvent.wheel(scrollbar, { deltaY: -50 });
      expect(viewport.scrollTop).toBe(0);

      viewport.scrollTop = 790;
      fireEvent.wheel(scrollbar, { deltaY: 50 });
      expect(viewport.scrollTop).toBe(800);

      fireEvent.wheel(scrollbar, { deltaY: 50 });
      expect(viewport.scrollTop).toBe(800);
    });

    it('preventDefaults only when it consumes the scroll, allowing chaining at edges', () => {
      const { viewport, scrollbar } = renderWheelTest({ orientation: 'vertical' });

      // Mid-range: the wheel scroll is consumed, so the event is cancelled.
      viewport.scrollTop = 400;
      // `fireEvent` returns the `dispatchEvent` result: `false` when `preventDefault` was called.
      expect(fireEvent.wheel(scrollbar, { deltaY: 50 })).toBe(false);

      // At the end edge scrolling further: not consumed, so the event chains to the parent/page.
      viewport.scrollTop = 800;
      expect(fireEvent.wheel(scrollbar, { deltaY: 50 })).toBe(true);

      // At the start edge scrolling further backward, the event chains too.
      viewport.scrollTop = 0;
      expect(fireEvent.wheel(scrollbar, { deltaY: -50 })).toBe(true);
    });

    it('ignores zero-delta wheel events', () => {
      const { viewport, scrollbar } = renderWheelTest({ orientation: 'vertical', scrollTop: 400 });

      expect(fireEvent.wheel(scrollbar, { deltaY: 0 })).toBe(true);
      expect(viewport.scrollTop).toBe(400);
      expect(scrollbar).not.toHaveAttribute('data-scrolling');
    });

    it('marks the scroll area as scrolling when wheeling over the scrollbar', async () => {
      const { scrollbar } = renderWheelTest({ orientation: 'vertical' });

      fireEvent.wheel(scrollbar, { deltaY: 50 });

      await waitFor(() => expect(scrollbar).toHaveAttribute('data-scrolling'));
    });

    it('marks the scroll area as scrolling when wheeling over the horizontal scrollbar', async () => {
      const { scrollbar } = renderWheelTest({ orientation: 'horizontal' });

      fireEvent.wheel(scrollbar, { deltaX: 50 });

      await waitFor(() => expect(scrollbar).toHaveAttribute('data-scrolling'));
    });

    it('does not mark the scroll area as scrolling when chaining at an edge', () => {
      const { viewport, scrollbar } = renderWheelTest({ orientation: 'vertical' });

      // At the end edge scrolling further chains to the page without consuming the
      // scroll, so the area must not be marked as scrolling.
      viewport.scrollTop = 800;
      fireEvent.wheel(scrollbar, { deltaY: 50 });

      expect(scrollbar).not.toHaveAttribute('data-scrolling');
    });

    // Upstream's `it.skipIf(isJSDOM)('registers after the horizontal scrollbar becomes visible')`
    // depends on `data-has-overflow-x` becoming true from a real `ResizeObserver`/layout-driven
    // `computeThumbPosition` pass; not reachable in jsdom (see the viewport test file's note).
  });

  // Upstream's `describe.skipIf(isJSDOM)('data overflow attributes (scrollbars)')` requires real
  // layout for the same reason as the viewport/root equivalents; not ported here.
});
