// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { ScrollArea } from '../index';
import { SCROLL_TIMEOUT } from '../constants';

afterEach(cleanup);

describe('<ScrollArea.Viewport />', () => {
  it('renders a div with role="presentation" and forwards its children', () => {
    const { getByTestId, getByText } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport data-testid="viewport">
          <div>content</div>
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    const viewport = getByTestId('viewport');
    expect(viewport.tagName).toBe('DIV');
    expect(viewport).toHaveAttribute('role', 'presentation');
    expect(getByText('content')).toBeTruthy();
  });

  it('is kept out of tab order while there is no overflow', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root>
        <ScrollArea.Viewport data-testid="viewport">
          <div />
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    expect(getByTestId('viewport')).toHaveAttribute('tabindex', '-1');
  });

  describe('data-scrolling attribute', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('adds [data-scrolling] attribute when viewport is scrolled', () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      ));

      const viewport = screen.getByTestId('viewport');

      expect(viewport).not.toHaveAttribute('data-scrolling');

      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollTop: 1 } });

      expect(viewport).toHaveAttribute('data-scrolling', '');

      vi.advanceTimersByTime(SCROLL_TIMEOUT);

      expect(viewport).not.toHaveAttribute('data-scrolling');

      // Test horizontal scrolling
      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollLeft: 1 } });

      expect(viewport).toHaveAttribute('data-scrolling', '');

      vi.advanceTimersByTime(SCROLL_TIMEOUT);

      expect(viewport).not.toHaveAttribute('data-scrolling');
    });

    it('removes [data-scrolling] after timeout', () => {
      render(() => (
        <ScrollArea.Root style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      ));

      const viewport = screen.getByTestId('viewport');

      // Start scrolling
      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollTop: 1 } });

      expect(viewport).toHaveAttribute('data-scrolling', '');

      // Wait less than timeout - should still be scrolling
      vi.advanceTimersByTime(SCROLL_TIMEOUT - 1);

      expect(viewport).toHaveAttribute('data-scrolling', '');

      // Wait for remaining timeout
      vi.advanceTimersByTime(1);

      expect(viewport).not.toHaveAttribute('data-scrolling');
    });
  });

  // Upstream's `describe.skipIf(isJSDOM)('overflow data attributes (viewport)')` asserts
  // `data-has-overflow-*`/`data-overflow-*-start`/`-end` derived from real `scrollHeight`/
  // `clientHeight` measurements. jsdom reports `0` for all of these regardless of the styled
  // sizes above, so `computeThumbPosition` always takes its `scrollableContentHeight === 0`
  // early return and the overflow attributes never populate. Not portable here; skipped per
  // CONVENTIONS.md (upstream itself is Chromium-only for this scenario).
});
