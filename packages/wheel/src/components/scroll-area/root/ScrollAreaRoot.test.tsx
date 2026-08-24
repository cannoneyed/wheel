// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { ScrollArea } from '../index';
import { SCROLL_TIMEOUT } from '../constants';

// Portal-free, but scroll/pointer listeners are attached to elements that live in
// `document.body` via `@solidjs/testing-library`; clean up explicitly since `globals: false`
// means the library's automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<ScrollArea.Root />', () => {
  it('renders a div with role="presentation"', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root data-testid="root">
        <ScrollArea.Viewport data-testid="viewport">
          <div />
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    const root = getByTestId('root');
    expect(root.tagName).toBe('DIV');
    expect(root).toHaveAttribute('role', 'presentation');
  });

  it('supports class as a function of state', () => {
    const { getByTestId } = render(() => (
      <ScrollArea.Root data-testid="root" class={(state) => `scrolling-${state.scrolling}`}>
        <ScrollArea.Viewport data-testid="viewport">
          <div />
        </ScrollArea.Viewport>
      </ScrollArea.Root>
    ));

    expect(getByTestId('root')).toHaveClass('scrolling-false');
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
        <ScrollArea.Root data-testid="root" style={{ width: '200px', height: '200px' }}>
          <ScrollArea.Viewport data-testid="viewport" style={{ width: '100%', height: '100%' }}>
            <div style={{ width: '1000px', height: '1000px' }} />
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      ));

      const root = screen.getByTestId('root');
      const viewport = screen.getByTestId('viewport');

      expect(root).not.toHaveAttribute('data-scrolling');

      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollTop: 1 } });

      expect(root).toHaveAttribute('data-scrolling', '');

      vi.advanceTimersByTime(SCROLL_TIMEOUT);

      expect(root).not.toHaveAttribute('data-scrolling');

      // Test horizontal scrolling
      fireEvent.pointerEnter(viewport);
      fireEvent.scroll(viewport, { target: { scrollLeft: 1 } });

      expect(root).toHaveAttribute('data-scrolling', '');

      vi.advanceTimersByTime(SCROLL_TIMEOUT);

      expect(root).not.toHaveAttribute('data-scrolling');
    });
  });

  // Upstream also has `describe.skipIf(isJSDOM)` blocks for 'sizing', 'overflow data attributes',
  // and 'context stability': they assert real pixel values from `getComputedStyle`/
  // `getBoundingClientRect` and rely on `ResizeObserver` firing off genuine layout changes.
  // jsdom has no layout engine — every dimension read back is `0` — so those scenarios are not
  // portable to this test environment and are intentionally not ported here (per CONVENTIONS.md;
  // upstream itself gates them to Chromium-only runs).
});
