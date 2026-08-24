// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { PreviewCard } from './index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

function hover(trigger: Element) {
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);
  fireEvent.mouseMove(trigger);
}

describe('handle-backed root ownership', () => {
  it('ignores imperative handle calls made before a root is attached', () => {
    const handle = PreviewCard.createHandle<number>();

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.open('trigger');
    handle.close();
    const detachedWarnings = consoleWarn.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('no root using this handle is mounted'),
    );
    consoleWarn.mockRestore();

    expect(handle.isOpen).toBe(false);
    expect(detachedWarnings).toHaveLength(2);

    render(() => (
      <div>
        <PreviewCard.Trigger handle={handle} id="trigger" href="#" payload={1}>
          Trigger
        </PreviewCard.Trigger>
        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    ));

    const trigger = screen.getByRole('link', { name: 'Trigger' });
    expect(screen.queryByTestId('content')).toBe(null);

    handle.open('trigger');

    expect(screen.queryByTestId('content')).not.toBe(null);
    expect(trigger).toHaveAttribute('data-popup-open');
  });

  it('ignores imperative handle calls made after the root is detached', () => {
    const handle = PreviewCard.createHandle<number>();

    function App() {
      const [mounted, setMounted] = createSignal(true);

      return (
        <div>
          <PreviewCard.Trigger handle={handle} id="trigger" href="#" payload={1}>
            Trigger
          </PreviewCard.Trigger>
          {!mounted() && (
            <button type="button" onClick={() => setMounted(true)}>
              Remount root
            </button>
          )}
          {mounted() && (
            <PreviewCard.Root handle={handle}>
              <button type="button" onClick={() => setMounted(false)}>
                Unmount root
              </button>
              <PreviewCard.Portal>
                <PreviewCard.Positioner>
                  <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
                </PreviewCard.Positioner>
              </PreviewCard.Portal>
            </PreviewCard.Root>
          )}
        </div>
      );
    }

    render(() => <App />);

    handle.open('trigger');
    expect(screen.queryByTestId('content')).not.toBe(null);

    fireEvent.click(screen.getByRole('button', { name: 'Unmount root' }));
    expect(handle.isOpen).toBe(false);
    expect(screen.queryByTestId('content')).toBe(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.open('trigger');
    handle.close();
    const detachedWarnings = consoleWarn.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('no root using this handle is mounted'),
    );
    consoleWarn.mockRestore();

    expect(handle.isOpen).toBe(false);
    expect(detachedWarnings).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remount root' }));
    expect(screen.queryByTestId('content')).toBe(null);

    handle.open('trigger');
    expect(screen.queryByTestId('content')).not.toBe(null);
  });

  it('registers a detached trigger declared after the root', () => {
    const handle = PreviewCard.createHandle();

    render(() => (
      <div>
        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
        <PreviewCard.Trigger handle={handle} id="trigger" href="#">
          Trigger
        </PreviewCard.Trigger>
      </div>
    ));

    const trigger = screen.getByRole('link', { name: 'Trigger' });

    handle.open('trigger');

    expect(screen.queryByTestId('content')).not.toBe(null);
    expect(trigger).toHaveAttribute('data-popup-open');
  });

  it('throws when called with an unregistered trigger id', () => {
    const handle = PreviewCard.createHandle();

    render(() => (
      <div>
        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
        <PreviewCard.Trigger handle={handle} id="trigger" href="#">
          Trigger
        </PreviewCard.Trigger>
      </div>
    ));

    expect(() => handle.open('missing')).toThrow('was called with the trigger id "missing"');
    expect(handle.isOpen).toBe(false);
  });
});

describe('multiple detached triggers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the preview card with any trigger on hover', async () => {
    const handle = PreviewCard.createHandle();

    render(() => (
      <div>
        <PreviewCard.Trigger href="#" handle={handle} delay={0}>
          Trigger 1
        </PreviewCard.Trigger>
        <PreviewCard.Trigger href="#" handle={handle} delay={0}>
          Trigger 2
        </PreviewCard.Trigger>

        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    ));

    const trigger1 = screen.getByRole('link', { name: 'Trigger 1' });
    const trigger2 = screen.getByRole('link', { name: 'Trigger 2' });

    expect(screen.queryByTestId('content')).toBe(null);

    hover(trigger1);
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => {
      expect(screen.queryByTestId('content')).not.toBe(null);
    });

    fireEvent.mouseLeave(trigger1);
    await vi.waitFor(() => {
      expect(screen.queryByTestId('content')).toBe(null);
    });

    hover(trigger2);
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => {
      expect(screen.queryByTestId('content')).not.toBe(null);
    });
  });

  it('marks whichever detached trigger is currently active with data-popup-open', async () => {
    const handle = PreviewCard.createHandle<number>();

    render(() => (
      <div>
        <PreviewCard.Trigger href="#" handle={handle} payload={1} delay={0}>
          Trigger 1
        </PreviewCard.Trigger>
        <PreviewCard.Trigger href="#" handle={handle} payload={2} delay={0}>
          Trigger 2
        </PreviewCard.Trigger>

        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    ));

    const trigger1 = screen.getByRole('link', { name: 'Trigger 1' });
    const trigger2 = screen.getByRole('link', { name: 'Trigger 2' });

    hover(trigger1);
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => {
      expect(trigger1).toHaveAttribute('data-popup-open');
    });
    expect(trigger2).not.toHaveAttribute('data-popup-open');

    fireEvent.mouseLeave(trigger1);
    await vi.waitFor(() => {
      expect(screen.queryByTestId('content')).toBe(null);
    });

    hover(trigger2);
    vi.advanceTimersByTime(0);
    await vi.waitFor(() => {
      expect(trigger2).toHaveAttribute('data-popup-open');
    });
    expect(trigger1).not.toHaveAttribute('data-popup-open');
  });
});

describe('imperative actions on the handle', () => {
  it('opens and closes the preview card', () => {
    const handle = PreviewCard.createHandle();
    render(() => (
      <div>
        <PreviewCard.Trigger href="#" handle={handle} id="trigger">
          Trigger
        </PreviewCard.Trigger>
        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    ));

    const trigger = screen.getByRole('link', { name: 'Trigger' });
    expect(screen.queryByTestId('content')).toBe(null);

    handle.open('trigger');
    expect(screen.queryByTestId('content')).not.toBe(null);
    expect(trigger).toHaveAttribute('data-popup-open');

    handle.close();
    expect(screen.queryByTestId('content')).toBe(null);
    expect(trigger).not.toHaveAttribute('data-popup-open');
  });

  it('associates the popup with whichever trigger id the handle opens', () => {
    const handle = PreviewCard.createHandle<number>();
    render(() => (
      <div>
        <PreviewCard.Trigger href="#" handle={handle} id="trigger1" payload={1}>
          Trigger 1
        </PreviewCard.Trigger>
        <PreviewCard.Trigger href="#" handle={handle} id="trigger2" payload={2}>
          Trigger 2
        </PreviewCard.Trigger>
        <PreviewCard.Root handle={handle}>
          <PreviewCard.Portal>
            <PreviewCard.Positioner>
              <PreviewCard.Popup data-testid="content">Content</PreviewCard.Popup>
            </PreviewCard.Positioner>
          </PreviewCard.Portal>
        </PreviewCard.Root>
      </div>
    ));

    const trigger1 = screen.getByRole('link', { name: 'Trigger 1' });
    const trigger2 = screen.getByRole('link', { name: 'Trigger 2' });
    expect(screen.queryByTestId('content')).toBe(null);

    handle.open('trigger2');
    expect(screen.queryByTestId('content')).not.toBe(null);
    expect(trigger2).toHaveAttribute('data-popup-open');
    expect(trigger1).not.toHaveAttribute('data-popup-open');

    handle.close();
    expect(screen.queryByTestId('content')).toBe(null);
    expect(trigger2).not.toHaveAttribute('data-popup-open');
  });
});
