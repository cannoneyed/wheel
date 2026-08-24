// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { Drawer } from '../index';

afterEach(cleanup);

type Point = { x: number; y: number };
type SwipeInput = 'pointer' | 'touch';
type SwipeOptions = {
  beforeRelease?: (() => Promise<unknown>) | (() => unknown);
  input?: SwipeInput;
  timeStepMs?: number;
  startTimeMs?: number;
};

function createTouch(target: EventTarget, point: { clientX: number; clientY: number }) {
  if (typeof Touch === 'function') {
    return new Touch({ identifier: 1, target, ...point });
  }
  return point;
}

async function swipe(element: HTMLElement, start: Point, end: Point, options: SwipeOptions = {}) {
  const stepX = start.x + (end.x === start.x ? 0 : Math.sign(end.x - start.x));
  const stepY = start.y + (end.y === start.y ? 0 : Math.sign(end.y - start.y));
  const { beforeRelease, input = 'pointer', timeStepMs, startTimeMs = 0 } = options;
  const useTimeStamp = input === 'pointer' && typeof timeStepMs === 'number';
  let timeStamp = startTimeMs;

  if (input === 'touch') {
    fireEvent.touchStart(element, {
      bubbles: true,
      touches: [createTouch(element, { clientX: start.x, clientY: start.y })],
    });

    fireEvent.touchMove(element, {
      bubbles: true,
      touches: [createTouch(element, { clientX: stepX, clientY: stepY })],
    });

    fireEvent.touchMove(element, {
      bubbles: true,
      touches: [createTouch(element, { clientX: end.x, clientY: end.y })],
    });

    if (beforeRelease) {
      await beforeRelease();
    }

    fireEvent.touchEnd(element, {
      bubbles: true,
      changedTouches: [createTouch(element, { clientX: end.x, clientY: end.y })],
    });
    return;
  }

  fireEvent.pointerDown(element, {
    button: 0,
    buttons: 1,
    pointerId: 1,
    clientX: start.x,
    clientY: start.y,
    pointerType: 'mouse',
    ...(useTimeStamp ? { timeStamp } : null),
  });

  if (useTimeStamp) {
    timeStamp += timeStepMs;
  }

  fireEvent.pointerMove(element, {
    pointerId: 1,
    clientX: stepX,
    clientY: stepY,
    buttons: 1,
    pointerType: 'mouse',
    ...(useTimeStamp ? { timeStamp } : null),
  });

  if (useTimeStamp) {
    timeStamp += timeStepMs;
  }

  fireEvent.pointerMove(element, {
    pointerId: 1,
    clientX: end.x,
    clientY: end.y,
    buttons: 1,
    pointerType: 'mouse',
    ...(useTimeStamp ? { timeStamp } : null),
  });

  if (beforeRelease) {
    await beforeRelease();
  }

  if (useTimeStamp) {
    timeStamp += timeStepMs;
  }

  fireEvent.pointerUp(element, {
    pointerId: 1,
    clientX: end.x,
    clientY: end.y,
    pointerType: 'mouse',
    ...(useTimeStamp ? { timeStamp } : null),
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextMacrotask() {
  return wait(0);
}

// A real outside press always begins with a `pointerdown`; the swipe-open guard relies on that
// fresh press to distinguish a deliberate dismissal from the `click` synthesized by the gesture's
// own `pointerup`.
function pressOutside(target: Element = document.body) {
  fireEvent.pointerDown(target, { button: 0, buttons: 1, pointerType: 'mouse' });
  fireEvent.pointerUp(target, { button: 0, buttons: 0, pointerType: 'mouse' });
  fireEvent.click(target);
}

// A real touch tap dispatches `pointerdown` alongside `touchstart`/`touchend`, so the swipe-open
// guard re-enables on that fresh `pointerdown` before the dismissal fires — touch outside presses
// dismiss just like mouse ones.
function pressOutsideTouch(target: Element = document.body) {
  const touch = createTouch(target, { clientX: 0, clientY: 0 });
  fireEvent.pointerDown(target, { button: 0, buttons: 1, pointerId: 1, pointerType: 'touch' });
  fireEvent.touchStart(target, { touches: [touch] });
  fireEvent.touchEnd(target, { changedTouches: [touch], touches: [] });
  fireEvent.pointerUp(target, { button: 0, buttons: 0, pointerId: 1, pointerType: 'touch' });
  fireEvent.click(target);
}

async function swipeUp(element: HTMLElement, startY: number, endY: number, options?: SwipeOptions) {
  return swipe(element, { x: 10, y: startY }, { x: 10, y: endY }, options);
}

async function swipeLeft(
  element: HTMLElement,
  startX: number,
  endX: number,
  options?: SwipeOptions,
) {
  return swipe(element, { x: startX, y: 10 }, { x: endX, y: 10 }, options);
}

describe('<Drawer.SwipeArea />', () => {
  it('opens the drawer when swiped in the open direction', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    expect(swipeArea).toHaveAttribute('data-closed', '');

    await swipeUp(swipeArea, 120, 40);

    expect(swipeArea).toHaveAttribute('data-open', '');
  });

  it('does not open when the swipe direction never locks to the open direction', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root onOpenChange={handleOpenChange}>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipe(swipeArea, { x: 10, y: 120 }, { x: 70, y: 118 });

    expect(swipeArea).toHaveAttribute('data-closed', '');
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it('prevents default pointer down for non-touch swipes', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const notCancelled = fireEvent.pointerDown(screen.getByTestId('swipe-area'), {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
    });

    expect(notCancelled).toBe(false);
  });

  it('does not open the drawer when disabled', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" disabled />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40);

    expect(swipeArea).toHaveAttribute('data-closed', '');
  });

  it('respects custom swipeDirection', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" swipeDirection="left" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeLeft(swipeArea, 120, 40);

    expect(swipeArea).toHaveAttribute('data-open', '');
  });

  it('opens the drawer when swiped with touch events', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40, { input: 'touch' });

    expect(swipeArea).toHaveAttribute('data-open', '');
    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');
  });

  it('applies data-swiping during an active swipe gesture', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40, {
      beforeRelease() {
        expect(swipeArea).toHaveAttribute('data-swiping', '');
      },
    });

    expect(swipeArea).not.toHaveAttribute('data-swiping');
  });

  it('re-enables outside press dismissal after opening by swipe', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40, { input: 'touch' });

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');

    await nextMacrotask();

    pressOutside();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    expect(swipeArea).toHaveAttribute('data-closed', '');
  });

  it('re-enables outside press dismissal for a touch outside press after opening by swipe', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40, { input: 'touch' });

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');

    await nextMacrotask();

    pressOutsideTouch();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    expect(swipeArea).toHaveAttribute('data-closed', '');
  });

  it('does not dismiss from the click synthesized by the swipe-open pointerup', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    await swipeUp(swipeArea, 120, 40);

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');

    await nextMacrotask();

    // Trailing synthesized click with no preceding fresh pointerdown.
    fireEvent.click(document.body);

    await nextMacrotask();

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');
  });

  it('re-enables outside press dismissal after an interrupted swipe-open gesture', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.pointerDown(swipeArea, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 119,
      buttons: 1,
      pointerType: 'mouse',
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 80,
      buttons: 1,
      pointerType: 'mouse',
    });

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');
    expect(swipeArea).toHaveAttribute('data-open', '');

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 60,
      buttons: 2,
      pointerType: 'mouse',
    });

    await nextMacrotask();

    pressOutside();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });

    expect(swipeArea).toHaveAttribute('data-closed', '');
  });

  it('re-enables outside press dismissal after a context menu interrupts swipe-open', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.pointerDown(swipeArea, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 119,
      buttons: 1,
      pointerType: 'mouse',
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 80,
      buttons: 1,
      pointerType: 'mouse',
    });

    expect(screen.getByTestId('popup')).toHaveAttribute('data-open', '');

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 60,
      buttons: 2,
      pointerType: 'mouse',
    });

    fireEvent.contextMenu(swipeArea, { button: 2, clientX: 10, clientY: 60 });

    await nextMacrotask();

    pressOutside();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });

  it('opens on a quick flick whose only move is already released (buttons: 0)', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.pointerDown(swipeArea, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
      timeStamp: 0,
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 40,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 16,
    });

    // No trailing `pointerup` follows; the released move must finish the gesture by itself.
    expect(swipeArea).toHaveAttribute('data-open', '');
    expect(swipeArea).not.toHaveAttribute('data-swiping');

    pressOutside();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });

  it('commits a released-move quick flick exactly once when a real pointerup trails it', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root onOpenChange={handleOpenChange}>
        <Drawer.SwipeArea data-testid="swipe-area" />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.pointerDown(swipeArea, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
      timeStamp: 0,
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 40,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 16,
    });

    expect(swipeArea).toHaveAttribute('data-open', '');
    expect(handleOpenChange).toHaveBeenCalledTimes(1);
    expect(handleOpenChange.mock.calls[0][0]).toBe(true);

    fireEvent.pointerUp(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 40,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 32,
    });

    expect(swipeArea).toHaveAttribute('data-open', '');
    expect(swipeArea).not.toHaveAttribute('data-swiping');
    expect(handleOpenChange).toHaveBeenCalledTimes(1);
  });

  it('opens on a quick flick that lands its whole travel in a single touch move', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.touchStart(swipeArea, {
      bubbles: true,
      touches: [createTouch(swipeArea, { clientX: 10, clientY: 120 })],
    });

    fireEvent.touchMove(swipeArea, {
      bubbles: true,
      touches: [createTouch(swipeArea, { clientX: 10, clientY: 40 })],
    });

    fireEvent.touchEnd(swipeArea, {
      bubbles: true,
      changedTouches: [createTouch(swipeArea, { clientX: 10, clientY: 40 })],
    });

    expect(swipeArea).toHaveAttribute('data-open', '');
  });

  it('does not open on an in-place press-release without movement', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root onOpenChange={handleOpenChange}>
        <Drawer.SwipeArea data-testid="swipe-area" />
      </Drawer.Root>
    ));

    const swipeArea = screen.getByTestId('swipe-area');

    fireEvent.pointerDown(swipeArea, {
      button: 0,
      buttons: 1,
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      pointerType: 'mouse',
      timeStamp: 0,
    });

    fireEvent.pointerMove(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 16,
    });

    fireEvent.pointerUp(swipeArea, {
      pointerId: 1,
      clientX: 10,
      clientY: 120,
      buttons: 0,
      pointerType: 'mouse',
      timeStamp: 32,
    });

    expect(swipeArea).toHaveAttribute('data-closed', '');
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  // 'uses a size-based swipe threshold by default' and 'keeps the swipe-area movement on the popup
  // when re-grabbed during close' are gated `it.skipIf(isJSDOM)` upstream (they depend on real
  // `offsetHeight`/CSS-animation timing that jsdom doesn't provide), so they are not ported.
});
