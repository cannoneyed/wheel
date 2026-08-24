// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { Drawer } from '../index';

afterEach(cleanup);

function createTouch(target: EventTarget, point: { clientX: number; clientY: number }) {
  if (typeof Touch === 'function') {
    return new Touch({ identifier: 1, target, ...point });
  }
  return point;
}

function createNativeTouchMove(target: EventTarget, point: { clientX: number; clientY: number }) {
  const touchMove = new Event('touchmove', { bubbles: true, cancelable: true });
  Object.defineProperty(touchMove, 'touches', {
    value: [createTouch(target, point)],
    configurable: true,
  });
  return touchMove;
}

describe('<Drawer.Viewport />', () => {
  it('clears text selection on swipe start', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">
              <Drawer.Content>
                <span data-testid="text">Selectable</span>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const text = screen.getByTestId('text');
    expect(text.firstChild).toBeTruthy();

    const selection = window.getSelection();
    expect(selection).not.toBeNull();
    if (!selection || !text.firstChild) {
      return;
    }

    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 5);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.isCollapsed).toBe(false);

    const popup = screen.getByTestId('popup');
    const viewport = screen.getByTestId('viewport');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => popup;

    try {
      fireEvent.pointerDown(viewport, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    expect(selection.rangeCount).toBe(0);
  });

  it('does not clear text selection on touch swipe start', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">
              <Drawer.Content>
                <span data-testid="text">Selectable</span>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const text = screen.getByTestId('text');
    const selection = window.getSelection();
    if (!selection || !text.firstChild) {
      throw new Error('selection setup failed');
    }

    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 5);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.isCollapsed).toBe(false);

    const popup = screen.getByTestId('popup');
    const viewport = screen.getByTestId('viewport');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => popup;

    try {
      fireEvent.touchStart(viewport, {
        touches: [createTouch(viewport, { clientX: 0, clientY: 0 })],
      });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    expect(selection.rangeCount).toBe(1);
  });

  it('starts touch swipes from interactive elements', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">
              <button type="button" data-testid="button">
                Action
              </button>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const button = screen.getByTestId('button');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => button;

    try {
      fireEvent.touchStart(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      expect(backdrop).toHaveAttribute('data-swiping', '');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('clears the backdrop data-swiping attribute when the drawer unmounts mid-swipe', async () => {
    const { unmount } = render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup>
              <button type="button" data-testid="button">
                Action
              </button>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const button = screen.getByTestId('button');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => button;

    try {
      fireEvent.touchStart(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      expect(backdrop).toHaveAttribute('data-swiping', '');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    unmount();

    expect(backdrop).not.toHaveAttribute('data-swiping');
  });

  it('allows clicks on non-interactive elements without data-base-ui-swipe-ignore', async () => {
    const handleClick = vi.fn();
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root open onOpenChange={handleOpenChange}>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup>
              <Drawer.Content>
                <div data-testid="target" onClick={handleClick}>
                  Action
                </div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const target = screen.getByTestId('target');
    const backdrop = screen.getByTestId('backdrop');
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    try {
      fireEvent.touchStart(target, {
        touches: [createTouch(target, { clientX: 0, clientY: 0 })],
      });
      fireEvent.pointerDown(target, { pointerType: 'touch' });
      fireEvent.touchEnd(target, {
        changedTouches: [createTouch(target, { clientX: 0, clientY: 0 })],
      });
      fireEvent.click(target, { detail: 1 });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleOpenChange).not.toHaveBeenCalled();
    expect(backdrop).not.toHaveAttribute('data-swiping');
  });

  it('does not start touch swipes from elements with data-base-ui-swipe-ignore', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root open onOpenChange={handleOpenChange}>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup>
              <Drawer.Content>
                <div data-testid="target" data-base-ui-swipe-ignore>
                  Action
                </div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const target = screen.getByTestId('target');
    const backdrop = screen.getByTestId('backdrop');

    fireEvent.touchStart(target, {
      touches: [createTouch(target, { clientX: 0, clientY: 0 })],
    });

    fireEvent.touchMove(target, {
      touches: [createTouch(target, { clientX: 0, clientY: 40 })],
    });

    fireEvent.touchEnd(target, {
      changedTouches: [createTouch(target, { clientX: 0, clientY: 40 })],
    });

    expect(backdrop).not.toHaveAttribute('data-swiping');
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it('still allows touch swipes from elements with legacy data-swipe-ignore', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root open onOpenChange={handleOpenChange} swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup>
              <div data-testid="target" data-swipe-ignore>
                Action
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const target = screen.getByTestId('target');
    const backdrop = screen.getByTestId('backdrop');
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    try {
      fireEvent.touchStart(target, {
        touches: [createTouch(target, { clientX: 0, clientY: 0 })],
      });

      fireEvent.touchMove(target, {
        touches: [createTouch(target, { clientX: 0, clientY: 40 })],
      });

      expect(backdrop).toHaveAttribute('data-swiping', '');

      fireEvent.touchEnd(target, {
        changedTouches: [createTouch(target, { clientX: 0, clientY: 80 })],
      });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it('does not start non-touch swipes from Drawer.Content', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup>
              <Drawer.Content>
                <div data-testid="target">Action</div>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const target = screen.getByTestId('target');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => target;

    try {
      fireEvent.pointerDown(target, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('dismisses when touch starts outside the popup, then continues swiping down inside it', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root open onOpenChange={handleOpenChange} swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">
              <Drawer.Content>Content</Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const viewport = screen.getByTestId('viewport');
    const popup = screen.getByTestId('popup');
    Object.defineProperty(popup, 'offsetHeight', { value: 200, configurable: true });

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = (_x, y) => (y < 100 ? viewport : popup);

    try {
      fireEvent.touchStart(viewport, {
        touches: [createTouch(viewport, { clientX: 0, clientY: 0 })],
      });

      fireEvent.touchMove(viewport, {
        touches: [createTouch(viewport, { clientX: 0, clientY: 120 })],
      });

      fireEvent.touchMove(viewport, {
        touches: [createTouch(viewport, { clientX: 0, clientY: 170 })],
      });

      fireEvent.touchEnd(viewport, {
        changedTouches: [createTouch(viewport, { clientX: 0, clientY: 170 })],
      });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    expect(handleOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'swipe' }),
    );
  });

  it('treats pen interactions on Drawer.Content as non-touch swipes', async () => {
    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup>
              <Drawer.Content>
                <button type="button" data-testid="button">
                  Action
                </button>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const button = screen.getByTestId('button');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => button;

    try {
      const pointerDownEvent = new Event('pointerdown', {
        bubbles: true,
        cancelable: true,
      }) as PointerEvent;

      Object.defineProperties(pointerDownEvent, {
        button: { value: 0 },
        buttons: { value: 1 },
        pointerId: { value: 1 },
        pointerType: { value: 'pen' },
        clientX: { value: 0 },
        clientY: { value: 0 },
      });

      fireEvent(button, pointerDownEvent);

      fireEvent.touchStart(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');

      const prevented = fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 10 })],
      });

      expect(prevented).toBe(true);
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('does not mark nested drawers as swiping until movement passes the threshold', async () => {
    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Viewport data-testid="parent-viewport">
            <Drawer.Popup data-testid="parent-popup">
              <Drawer.Root open swipeDirection="down">
                <Drawer.Portal>
                  <Drawer.Viewport data-testid="child-viewport">
                    <Drawer.Popup data-testid="child-popup">
                      <button type="button" data-testid="child-button">
                        Action
                      </button>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const parentPopup = screen.getByTestId('parent-popup');
    const childPopup = screen.getByTestId('child-popup');
    const button = screen.getByTestId('child-button');
    Object.defineProperty(childPopup, 'offsetHeight', { value: 200, configurable: true });

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => childPopup;

    try {
      fireEvent.touchStart(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      expect(parentPopup).not.toHaveAttribute('data-nested-drawer-swiping');

      fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 5 })],
      });

      fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 20 })],
      });

      expect(parentPopup).toHaveAttribute('data-nested-drawer-swiping', '');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('clears nested swiping when a nested drawer swipe is reversed before release', async () => {
    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="parent-popup">
              <Drawer.Root open swipeDirection="down">
                <Drawer.Portal>
                  <Drawer.Viewport>
                    <Drawer.Popup data-testid="child-popup">
                      <button type="button" data-testid="child-button">
                        Action
                      </button>
                    </Drawer.Popup>
                  </Drawer.Viewport>
                </Drawer.Portal>
              </Drawer.Root>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const parentPopup = screen.getByTestId('parent-popup');
    const childPopup = screen.getByTestId('child-popup');
    const button = screen.getByTestId('child-button');
    Object.defineProperty(childPopup, 'offsetHeight', { value: 200, configurable: true });

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => childPopup;

    try {
      fireEvent.touchStart(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 5 })],
      });

      fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 20 })],
      });

      expect(parentPopup).toHaveAttribute('data-nested-drawer-swiping', '');

      fireEvent.touchMove(button, {
        touches: [createTouch(button, { clientX: 0, clientY: 0 })],
      });

      expect(parentPopup).not.toHaveAttribute('data-nested-drawer-swiping');
      expect(parentPopup.style.getPropertyValue('--drawer-swipe-progress')).toBe('0');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('prevents touchmove at scroll top when swiping down on scrollable content', async () => {
    const handleTouchMove = vi.fn();

    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup>
              <div
                data-testid="scroll"
                onTouchMove={handleTouchMove}
                style={{ 'overflow-y': 'auto', 'max-height': '40px' }}
              >
                <div style={{ height: '120px' }}>Scrollable content</div>
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const scroll = screen.getByTestId('scroll');
    Object.defineProperty(scroll, 'scrollHeight', { value: 120, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 40, configurable: true });
    scroll.scrollTop = 0;

    fireEvent.touchStart(scroll, {
      touches: [createTouch(scroll, { clientX: 0, clientY: 0 })],
    });

    const prevented = fireEvent.touchMove(scroll, {
      touches: [createTouch(scroll, { clientX: 0, clientY: 10 })],
    });

    expect(prevented).toBe(false);
    expect(handleTouchMove).not.toHaveBeenCalled();
  });

  it('allows touchmove when scrolling down from scroll top', async () => {
    const handleTouchMove = vi.fn();

    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup>
              <div
                data-testid="scroll"
                onTouchMove={handleTouchMove}
                style={{ 'overflow-y': 'auto', 'max-height': '40px' }}
              >
                <div style={{ height: '120px' }}>Scrollable content</div>
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const scroll = screen.getByTestId('scroll');
    Object.defineProperty(scroll, 'scrollHeight', { value: 120, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 40, configurable: true });
    scroll.scrollTop = 0;

    fireEvent.touchStart(scroll, {
      touches: [createTouch(scroll, { clientX: 0, clientY: 0 })],
    });

    const prevented = fireEvent.touchMove(scroll, {
      touches: [createTouch(scroll, { clientX: 0, clientY: -10 })],
    });

    expect(prevented).toBe(true);
    expect(handleTouchMove).toHaveBeenCalledTimes(1);
  });

  it('does not block touchmove on native range inputs', async () => {
    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup>
              <input type="range" data-testid="range" />
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const range = screen.getByTestId('range');
    const backdrop = screen.getByTestId('backdrop');

    fireEvent.touchStart(range, {
      touches: [createTouch(range, { clientX: 0, clientY: 0 })],
    });

    const dispatched = fireEvent.touchMove(range, {
      touches: [createTouch(range, { clientX: 20, clientY: 0 })],
    });

    expect(dispatched).toBe(true);
    expect(backdrop).not.toHaveAttribute('data-swiping');
  });

  it('does not start swiping when adjusting regular text selection handles', async () => {
    render(() => (
      <Drawer.Root open swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">
              <span data-testid="text">Selectable text</span>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const text = screen.getByTestId('text');
    const popup = screen.getByTestId('popup');
    const backdrop = screen.getByTestId('backdrop');
    const selection = window.getSelection();
    if (!selection || !text.firstChild) {
      throw new Error('selection setup failed');
    }

    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 5);
    selection.removeAllRanges();
    selection.addRange(range);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => popup;

    try {
      fireEvent.touchStart(popup, {
        touches: [createTouch(popup, { clientX: 0, clientY: 0 })],
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');

      const dispatched = fireEvent.touchMove(popup, {
        touches: [createTouch(popup, { clientX: 0, clientY: 10 })],
      });

      expect(dispatched).toBe(true);
      expect(backdrop).not.toHaveAttribute('data-swiping');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
      selection.removeAllRanges();
    }
  });

  it('dismisses from a top-edge scroll container with a touch swipe down', async () => {
    const handleOpenChange = vi.fn();

    render(() => (
      <Drawer.Root open onOpenChange={handleOpenChange} swipeDirection="down">
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">
              <div data-testid="scroll" style={{ 'overflow-y': 'auto', 'max-height': '40px' }}>
                <div style={{ height: '120px' }}>Scrollable content</div>
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const scroll = screen.getByTestId('scroll');
    const popup = screen.getByTestId('popup');
    Object.defineProperty(scroll, 'scrollHeight', { value: 120, configurable: true });
    Object.defineProperty(scroll, 'clientHeight', { value: 40, configurable: true });
    scroll.scrollTop = 0;

    Object.defineProperty(popup, 'offsetHeight', { value: 200, configurable: true });

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => scroll;

    try {
      fireEvent.touchStart(scroll, {
        touches: [createTouch(scroll, { clientX: 0, clientY: 0 })],
      });

      fireEvent.touchMove(scroll, {
        touches: [createTouch(scroll, { clientX: 0, clientY: 140 })],
      });

      fireEvent.touchEnd(scroll, {
        changedTouches: [createTouch(scroll, { clientX: 0, clientY: 140 })],
      });
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }

    expect(handleOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'swipe' }),
    );
  });

  it('toggles data-swiping on the backdrop while swiping', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const viewport = screen.getByTestId('viewport');
    const popup = screen.getByTestId('popup');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => popup;

    try {
      fireEvent.pointerDown(viewport, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      });

      fireEvent.pointerMove(viewport, {
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 8,
        pointerType: 'mouse',
      });

      expect(backdrop).toHaveAttribute('data-swiping', '');

      fireEvent.pointerUp(viewport, {
        pointerId: 1,
        clientX: 0,
        clientY: 8,
        pointerType: 'mouse',
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('ends swipe drag when the primary mouse button is released mid-gesture', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Backdrop data-testid="backdrop" />
          <Drawer.Viewport data-testid="viewport">
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const viewport = screen.getByTestId('viewport');
    const popup = screen.getByTestId('popup');
    const backdrop = screen.getByTestId('backdrop');

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => popup;

    try {
      fireEvent.pointerDown(viewport, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        clientX: 0,
        clientY: 0,
        pointerType: 'mouse',
      });

      fireEvent.pointerMove(viewport, {
        pointerId: 1,
        clientX: 0,
        clientY: 8,
        buttons: 1,
        pointerType: 'mouse',
      });

      expect(backdrop).toHaveAttribute('data-swiping', '');

      // Simulate a right-click interruption where the primary button is no longer pressed.
      fireEvent.pointerMove(viewport, {
        pointerId: 1,
        clientX: 0,
        clientY: 12,
        buttons: 2,
        pointerType: 'mouse',
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');

      fireEvent.pointerMove(viewport, {
        pointerId: 1,
        clientX: 0,
        clientY: 30,
        buttons: 0,
        pointerType: 'mouse',
      });

      expect(backdrop).not.toHaveAttribute('data-swiping');
    } finally {
      document.elementFromPoint = originalElementFromPoint;
    }
  });

  it('does not prevent native touch scrolling in portaled descendants', async () => {
    const portalContainer = document.createElement('div');
    document.body.append(portalContainer);

    try {
      render(() => (
        <Drawer.Root open>
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup>
                <Drawer.Content>Content</Drawer.Content>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      ));

      const targetEl = document.createElement('div');
      targetEl.setAttribute('data-testid', 'portaled-popup');
      portalContainer.append(targetEl);

      const originalElementFromPoint = document.elementFromPoint;
      document.elementFromPoint = () => targetEl;

      try {
        fireEvent.touchStart(targetEl, {
          touches: [createTouch(targetEl, { clientX: 0, clientY: 0 })],
        });

        const touchMove = createNativeTouchMove(targetEl, { clientX: 0, clientY: 40 });
        targetEl.dispatchEvent(touchMove);

        expect(touchMove.defaultPrevented).toBe(false);
      } finally {
        document.elementFromPoint = originalElementFromPoint;
      }
    } finally {
      portalContainer.remove();
    }
  });

  // The remaining upstream cases — the Combobox-portal touch-gesture guard, the mixed-axis /
  // vertical-only / horizontal-only scroll-container guards, and a handful of edge/direction
  // variants of the scroll-edge and horizontal-dismiss cases above — are gated
  // `it.skipIf(isJSDOM)` upstream (real pointer-capture/layout dependent) or are close duplicates
  // of the ported cases exercising the same code paths with a different axis/direction, so they
  // are not all individually re-ported here.
});
