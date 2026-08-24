// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { Toast } from '../index';
import { List, Button } from '../utils/test-utils';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

// `test/vitest-setup.ts` polyfills `window.PointerEvent = window.MouseEvent` (jsdom has no native
// `PointerEvent`), so `fireEvent.pointerDown(el, { pointerType: 'touch' })` silently drops
// `pointerType` — `MouseEvent`'s constructor ignores unrecognized init properties, and reading
// `event.pointerType` afterwards is always `undefined`. This directly builds the event and forces
// the property on afterwards so touch-specific branches (gated on `pointerType === 'touch'`) can
// actually be exercised.
function firePointerEventWithType(
  element: Element,
  type: string,
  init: Record<string, unknown>,
  pointerType: string,
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: pointerType, configurable: true });
  element.dispatchEvent(event);
  return event;
}

describe('<Toast.Viewport />', () => {
  // Upstream also runs `describeConformance(<Toast.Viewport />, ...)`, a React/MUI-only test
  // utility with no Solid equivalent in this repo (see `Button.test.tsx`'s note).

  it('gets focused when F6 is pressed', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });

    await user.click(button);
    await user.keyboard('{F6}');

    expect(screen.getByTestId('viewport')).toHaveFocus();
  });

  // Deviation: upstream drives this via real `user.keyboard('{Tab}')` traversal. jsdom + user-event's
  // tabbable-elements computation doesn't reliably treat a `tabIndex={-1}` container (the focused
  // viewport) as the traversal origin the way real browsers do, so the resulting `relatedTarget` on
  // the guard's focus event is unreliable in this environment. This directly dispatches the focus
  // event the guard would receive when the browser tabs off the viewport, exercising the same
  // `handleFocusGuard` code path deterministically.
  it('focuses first toast upon tab after viewport is focused', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });

    await user.click(button);
    await user.keyboard('{F6}');

    const viewport = screen.getByTestId('viewport');
    const guard = document.querySelector('[data-base-ui-focus-guard]') as HTMLElement;
    fireEvent.focus(guard, { relatedTarget: viewport });

    expect(screen.getByTestId('root')).toHaveFocus();
  });

  it('returns focus to previous element when pressing shift+Tab on first toast', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport>
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });

    await user.click(button);
    await user.keyboard('{F6}');
    await user.tab();
    await user.tab({ shift: true });

    expect(button).toHaveFocus();
  });

  // Deviation: see the note on 'focuses first toast upon tab after viewport is focused' — this
  // directly dispatches the trailing focus guard's focus event (as the browser would when tabbing
  // forward off the last toast's action button) instead of chaining several `user.tab()` calls.
  it('returns focus to previous element when pressing shift+Tab on last toast', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });

    await user.click(button);
    await user.click(button);

    await user.keyboard('{F6}');

    // Toasts are prepended (newest first), so the DOM-last toast — the one "last" in tab order —
    // is the first one added (index 1 of the close buttons in DOM order).
    const guards = document.querySelectorAll('[data-base-ui-focus-guard]');
    const lastToastActionButton = document.querySelectorAll('[aria-label="close-press"]')[1]
      .nextElementSibling as HTMLElement;
    lastToastActionButton.focus();

    fireEvent.focus(guards[guards.length - 1] as HTMLElement, {
      relatedTarget: lastToastActionButton,
    });

    expect(button).toHaveFocus();
  });

  it('removes expanded on mouseleave when focus-visible not inside', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });

    await user.click(button);
    const root = await screen.findByTestId('root');
    const viewport = screen.getByTestId('viewport');

    fireEvent.mouseOver(root);
    expect(viewport).toHaveAttribute('data-expanded');

    fireEvent.mouseOut(root);
    expect(viewport).not.toHaveAttribute('data-expanded');
  });

  it('keeps expanded on mouseleave when focus-visible is inside', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    await user.click(button);
    const root = await screen.findByTestId('root');
    const viewport = screen.getByTestId('viewport');

    await user.keyboard('{F6}');
    await user.tab();

    fireEvent.mouseOver(root);
    expect(viewport).toHaveAttribute('data-expanded');
    fireEvent.mouseOut(root);
    expect(viewport).toHaveAttribute('data-expanded');
  });

  it('keeps expanded during an active touch swipe even if mouseleave fires', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    await user.click(button);

    const root = await screen.findByTestId('root');
    const viewport = screen.getByTestId('viewport');

    Object.defineProperty(root, 'setPointerCapture', {
      value: () => {},
      configurable: true,
    });
    Object.defineProperty(root, 'releasePointerCapture', {
      value: () => {},
      configurable: true,
    });

    // `pointerType` must survive to the viewport's own (bubbled) pointerdown/pointerup handlers,
    // which gate `touchActive` strictly on `=== 'touch'` — see `firePointerEventWithType`'s doc
    // comment for why `fireEvent.pointerDown` can't carry it in this jsdom setup.
    firePointerEventWithType(
      root,
      'pointerdown',
      { clientX: 100, clientY: 100, button: 0, pointerId: 1 },
      'touch',
    );
    fireEvent.pointerMove(root, {
      clientX: 100,
      clientY: 120,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(viewport).toHaveAttribute('data-expanded');

    fireEvent.mouseOut(viewport);

    expect(viewport).toHaveAttribute('data-expanded');

    firePointerEventWithType(root, 'pointerup', { clientX: 100, clientY: 120, pointerId: 1 }, 'touch');

    expect(viewport).not.toHaveAttribute('data-expanded');
  });

  it('keeps expanded when a touch swipe is canceled without leaving the viewport', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    await user.click(button);

    const root = await screen.findByTestId('root');
    const viewport = screen.getByTestId('viewport');

    Object.defineProperty(root, 'setPointerCapture', {
      value: () => {},
      configurable: true,
    });

    fireEvent.pointerDown(root, {
      clientX: 100,
      clientY: 100,
      button: 0,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(root, {
      clientX: 100,
      clientY: 120,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(root).toHaveAttribute('data-swiping');
    expect(viewport).toHaveAttribute('data-expanded');

    fireEvent.pointerCancel(root, {
      clientX: 100,
      clientY: 120,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(root).not.toHaveAttribute('data-swiping');
    expect(viewport).toHaveAttribute('data-expanded');
  });

  it('collapses after a touch swipe is canceled if mouseleave already fired', async () => {
    const user = userEvent.setup();

    render(() => (
      <Toast.Provider>
        <Toast.Viewport data-testid="viewport">
          <List />
        </Toast.Viewport>
        <Button />
      </Toast.Provider>
    ));

    const button = screen.getByRole('button', { name: 'add' });
    await user.click(button);

    const root = await screen.findByTestId('root');
    const viewport = screen.getByTestId('viewport');

    Object.defineProperty(root, 'setPointerCapture', {
      value: () => {},
      configurable: true,
    });

    fireEvent.pointerDown(root, {
      clientX: 100,
      clientY: 100,
      button: 0,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(root, {
      clientX: 100,
      clientY: 120,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });

    fireEvent.mouseOut(viewport);
    fireEvent.pointerCancel(root, {
      clientX: 100,
      clientY: 120,
      bubbles: true,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(root).not.toHaveAttribute('data-swiping');
    expect(viewport).not.toHaveAttribute('data-expanded');
  });

  describe('timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('pauses timers when hovering', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });

      fireEvent.click(button);
      fireEvent.mouseOver(screen.getByTestId('root'));

      vi.advanceTimersByTime(5001);

      expect(screen.queryByTestId('root')).not.toBe(null);
    });

    it('resumes timers when not hovering', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });

      fireEvent.click(button);
      fireEvent.mouseOver(screen.getByTestId('root'));

      vi.advanceTimersByTime(5000);

      fireEvent.mouseOut(screen.getByTestId('root'));

      vi.advanceTimersByTime(4999);

      expect(screen.queryByTestId('root')).not.toBe(null);

      vi.advanceTimersByTime(2);

      expect(screen.queryByTestId('root')).toBe(null);
    });

    it('pauses timers when the viewport is focused', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport data-testid="viewport">
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });

      fireEvent.click(button);
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'F6' });

      vi.advanceTimersByTime(5001);

      expect(screen.queryByTestId('root')).not.toBe(null);
    });

    it('resumes timers when the viewport is blurred', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport data-testid="viewport">
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });

      fireEvent.click(button);
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'F6' });

      vi.advanceTimersByTime(5001);

      button.focus();

      vi.advanceTimersByTime(5001);

      expect(screen.queryByTestId('root')).toBe(null);
    });

    it('resumes timers when the window regains focus', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });

      fireEvent.click(button);

      expect(screen.queryByTestId('root')).not.toBe(null);
      const blurListener = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'blur' && call[2] === true,
      )?.[1] as EventListener | undefined;
      const focusListener = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'focus' && call[2] === true,
      )?.[1] as EventListener | undefined;

      addEventListenerSpy.mockRestore();

      expect(blurListener).toBeDefined();
      expect(focusListener).toBeDefined();

      if (!blurListener || !focusListener) {
        throw new Error('Expected window focus and blur listeners to be registered.');
      }

      const blurEvent = new FocusEvent('blur');
      Object.defineProperty(blurEvent, 'composedPath', {
        value: () => [window],
      });

      const focusEvent = new FocusEvent('focus');
      Object.defineProperty(focusEvent, 'composedPath', {
        value: () => [window],
      });

      vi.advanceTimersByTime(1000);

      blurListener(blurEvent);

      vi.advanceTimersByTime(5000);

      expect(screen.queryByTestId('root')).not.toBe(null);

      focusListener(focusEvent);

      vi.advanceTimersByTime(3999);

      expect(screen.queryByTestId('root')).not.toBe(null);

      vi.advanceTimersByTime(2);

      expect(screen.queryByTestId('root')).toBe(null);
    });

    it('keeps timers paused on mouseleave while the window is blurred', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });
      fireEvent.click(button);

      const root = screen.getByTestId('root');

      const blurListener = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'blur' && call[2] === true,
      )?.[1] as EventListener | undefined;
      addEventListenerSpy.mockRestore();

      if (!blurListener) {
        throw new Error('Expected window blur listener to be registered.');
      }

      const blurEvent = new FocusEvent('blur');
      Object.defineProperty(blurEvent, 'composedPath', { value: () => [window] });

      // Hovering pauses the timer.
      fireEvent.mouseOver(root);
      vi.advanceTimersByTime(1000);

      // The window loses focus while still hovering.
      blurListener(blurEvent);

      // Leaving with the pointer must not resume the timer while the window is
      // blurred, otherwise the toast could expire off-screen.
      fireEvent.mouseOut(root);
      vi.advanceTimersByTime(10000);

      expect(screen.queryByTestId('root')).not.toBe(null);
    });

    it('keeps timers paused on viewport blur while the window is blurred', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

      render(() => (
        <Toast.Provider>
          <Toast.Viewport data-testid="viewport">
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });
      fireEvent.click(button);

      const blurListener = addEventListenerSpy.mock.calls.find(
        (call) => call[0] === 'blur' && call[2] === true,
      )?.[1] as EventListener | undefined;
      addEventListenerSpy.mockRestore();

      if (!blurListener) {
        throw new Error('Expected window blur listener to be registered.');
      }

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'F6' });
      expect(screen.getByTestId('viewport')).toHaveFocus();

      vi.advanceTimersByTime(1000);

      const blurEvent = new FocusEvent('blur');
      Object.defineProperty(blurEvent, 'composedPath', { value: () => [window] });

      blurListener(blurEvent);

      button.focus();

      vi.advanceTimersByTime(10000);

      expect(screen.queryByTestId('root')).not.toBe(null);
    });
  });

  describe('focus management', () => {
    it('skips toasts animating out when tabbing into the viewport', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport data-testid="viewport">
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });
      fireEvent.click(button); // oldest toast
      fireEvent.click(button); // newest toast (toasts[0])

      const roots = screen.getAllByTestId('root');
      const newest = roots[0];
      const survivor = roots[1];

      // Close the newest toast. With animations disabled, the exit animation completes
      // synchronously and the toast is removed immediately from the DOM.
      const newestCloseButton = document.querySelectorAll(
        '[aria-label="close-press"]',
      )[0] as HTMLElement;
      fireEvent.click(newestCloseButton);

      expect(document.body.contains(newest)).toBe(false);

      // F6 focuses the viewport and renders the focus guards.
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'F6' });

      const viewport = screen.getByTestId('viewport');
      const guard = document.querySelector('[data-base-ui-focus-guard]') as HTMLElement;
      fireEvent.focus(guard, { relatedTarget: viewport });

      expect(survivor).toHaveFocus();
    });

    it('returns focus when no toast can receive focus', async () => {
      render(() => (
        <Toast.Provider limit={0}>
          <Toast.Viewport data-testid="viewport">
            <List />
          </Toast.Viewport>
          <Button />
        </Toast.Provider>
      ));

      const button = screen.getByRole('button', { name: 'add' });
      button.focus();
      fireEvent.click(button);

      fireEvent.keyDown(button, { key: 'F6' });

      const viewport = screen.getByTestId('viewport');
      expect(viewport).toHaveFocus();

      const guard = document.querySelector('[data-base-ui-focus-guard]') as HTMLElement;
      fireEvent.focus(guard, { relatedTarget: viewport });

      expect(button).toHaveFocus();
    });
  });
});
