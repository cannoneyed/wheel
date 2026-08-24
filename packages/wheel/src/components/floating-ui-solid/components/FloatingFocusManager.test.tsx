// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignal, Show, type JSX } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { useFloating } from '../hooks/useFloating';
import { FloatingFocusManager, type FloatingFocusManagerProps } from './FloatingFocusManager';

// Port of a behavioral slice of upstream's
// `floating-ui-react/components/FloatingFocusManager.test.tsx`. Upstream
// mocks `requestAnimationFrame` to run synchronously so `enqueueFocus`'s
// rAF-deferred `.focus()` calls are observable without waiting a real frame;
// we do the same here. Solid effects (unlike React's synchronous
// `useLayoutEffect`) run their first pass on a microtask, so each assertion
// that depends on an effect having run is preceded by `await
// flushMicrotasks()`, matching the pattern established in `core.test.tsx`.

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface AppProps {
  initialFocus?: FloatingFocusManagerProps['initialFocus'];
  returnFocus?: FloatingFocusManagerProps['returnFocus'];
  modal?: boolean;
  disabled?: boolean;
  closeOnFocusOut?: boolean;
  children?: JSX.Element;
}

function App(props: AppProps) {
  const [open, setOpen] = createSignal(false);
  const floating = useFloating({ open, onOpenChange: setOpen });

  return (
    <>
      <button
        data-testid="reference"
        ref={floating.refs.setReference}
        onClick={() => setOpen(!open())}
      />
      <Show when={open()}>
        <FloatingFocusManager
          context={floating.context}
          initialFocus={props.initialFocus}
          returnFocus={props.returnFocus}
          modal={props.modal}
          disabled={props.disabled}
          closeOnFocusOut={props.closeOnFocusOut}
        >
          <div role="dialog" ref={floating.refs.setFloating} data-testid="floating">
            <button data-testid="one">close</button>
            <button data-testid="two">confirm</button>
            <button data-testid="three" onClick={() => setOpen(false)}>
              x
            </button>
            {props.children}
          </div>
        </FloatingFocusManager>
      </Show>
      <div tabIndex={0} data-testid="last">
        outside
      </div>
    </>
  );
}

function AppWithOutside(props: { modal?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const floating = useFloating({ open, onOpenChange: setOpen });

  return (
    <>
      <button
        data-testid="reference"
        ref={floating.refs.setReference}
        onClick={() => setOpen(!open())}
      />
      <div data-testid="outside">outside</div>
      <Show when={open()}>
        <FloatingFocusManager context={floating.context} modal={props.modal}>
          <div ref={floating.refs.setFloating} data-testid="floating">
            floating
          </div>
        </FloatingFocusManager>
      </Show>
    </>
  );
}

describe('FloatingFocusManager', () => {
  describe('prop: initialFocus', () => {
    it('focuses the first tabbable element by default', async () => {
      const { getByTestId } = render(() => <App />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('one')).toHaveFocus();
    });

    it('moves focus to the target referenced by a `{ current }` box', async () => {
      const ref: { current: HTMLButtonElement | null } = { current: null };

      function RefApp() {
        const [open, setOpen] = createSignal(false);
        const floating = useFloating({ open, onOpenChange: setOpen });
        return (
          <>
            <button
              data-testid="reference"
              ref={floating.refs.setReference}
              onClick={() => setOpen(!open())}
            />
            <Show when={open()}>
              <FloatingFocusManager context={floating.context} initialFocus={ref}>
                <div ref={floating.refs.setFloating} data-testid="floating">
                  <button data-testid="one">close</button>
                  <button data-testid="two" ref={(el) => (ref.current = el)}>
                    confirm
                  </button>
                </div>
              </FloatingFocusManager>
            </Show>
          </>
        );
      }

      const { getByTestId } = render(() => <RefApp />);
      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('two')).toHaveFocus();
    });

    it('does not move focus when initialFocus is false', async () => {
      const { getByTestId } = render(() => <App initialFocus={false} />);
      const reference = getByTestId('reference');
      reference.focus();

      fireEvent.click(reference);
      await flushMicrotasks();

      expect(reference).toHaveFocus();
    });
  });

  describe('prop: modal', () => {
    it('traps Tab/Shift+Tab focus within the modal floating element', async () => {
      const { getByTestId } = render(() => <App modal />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      const user = userEvent.setup();

      await user.tab();
      expect(getByTestId('two')).toHaveFocus();

      await user.tab();
      expect(getByTestId('three')).toHaveFocus();

      // Tabbing forward from the last element wraps back to the first via
      // the after-content focus guard.
      await user.tab();
      expect(getByTestId('one')).toHaveFocus();

      // Shift+Tab from the first element wraps back to the last via the
      // before-content focus guard.
      await user.tab({ shift: true });
      expect(getByTestId('three')).toHaveFocus();

      await user.tab({ shift: true });
      expect(getByTestId('two')).toHaveFocus();

      await user.tab({ shift: true });
      expect(getByTestId('one')).toHaveFocus();
    });

    it('modal=false does not trap focus: tabbing out reaches the next document element', async () => {
      const { getByTestId } = render(() => <App modal={false} />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      const user = userEvent.setup();

      await user.tab();
      expect(getByTestId('two')).toHaveFocus();

      await user.tab();
      expect(getByTestId('three')).toHaveFocus();

      await user.tab();
      expect(getByTestId('last')).toHaveFocus();
    });

    it('closeOnFocusOut: false keeps a non-modal floating element open when focus leaves', async () => {
      const { getByTestId, queryByTestId } = render(
        () => <App modal={false} closeOnFocusOut={false} />,
      );

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      const user = userEvent.setup();
      await user.tab();
      await user.tab();
      await user.tab();

      await flushMicrotasks();

      expect(queryByTestId('floating')).not.toBeNull();
    });
  });

  describe('focus guards', () => {
    it('renders two focus guards around the children when modal', async () => {
      const { getByTestId, container } = render(() => <App modal />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(container.querySelectorAll('[data-base-ui-focus-guard]')).toHaveLength(2);
    });

    it('does not render focus guards when modal=false and not inside a portal', async () => {
      const { getByTestId, container } = render(() => <App modal={false} />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(container.querySelectorAll('[data-base-ui-focus-guard]')).toHaveLength(0);
    });

    it('does not render focus guards when disabled', async () => {
      const { getByTestId, container } = render(() => <App modal disabled />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(container.querySelectorAll('[data-base-ui-focus-guard]')).toHaveLength(0);
    });
  });

  describe('prop: returnFocus', () => {
    it('when true, restores focus to the reference element on close', async () => {
      const { getByTestId } = render(() => <App returnFocus />);
      const reference = getByTestId('reference');
      reference.focus();

      fireEvent.click(reference);
      await flushMicrotasks();
      expect(getByTestId('one')).toHaveFocus();

      fireEvent.click(getByTestId('three'));
      await flushMicrotasks();

      expect(reference).toHaveFocus();
    });

    it('when false, does not restore focus to the reference element on close', async () => {
      const { getByTestId } = render(() => <App returnFocus={false} />);
      const reference = getByTestId('reference');
      reference.focus();

      fireEvent.click(reference);
      await flushMicrotasks();

      fireEvent.click(getByTestId('three'));
      await flushMicrotasks();

      expect(reference).not.toHaveFocus();
    });
  });

  describe('prop: disabled', () => {
    it('does not manage focus when disabled', async () => {
      const { getByTestId } = render(() => <App disabled />);
      const reference = getByTestId('reference');
      reference.focus();

      fireEvent.click(reference);
      await flushMicrotasks();

      expect(reference).toHaveFocus();
    });
  });

  describe('markOthers integration (aria-hidden)', () => {
    it('applies aria-hidden to elements outside the floating tree when modal, and undoes it on close', async () => {
      const { getByTestId } = render(() => <AppWithOutside />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('reference')).toHaveAttribute('aria-hidden', 'true');
      expect(getByTestId('outside')).toHaveAttribute('aria-hidden', 'true');
      expect(getByTestId('floating')).not.toHaveAttribute('aria-hidden');

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('reference')).not.toHaveAttribute('aria-hidden');
      expect(getByTestId('outside')).not.toHaveAttribute('aria-hidden');
    });

    it('modal=false does not apply aria-hidden to outside nodes (marker only)', async () => {
      const { getByTestId } = render(() => <AppWithOutside modal={false} />);

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('outside')).not.toHaveAttribute('aria-hidden');
      expect(getByTestId('outside')).toHaveAttribute('data-base-ui-inert');

      fireEvent.click(getByTestId('reference'));
      await flushMicrotasks();

      expect(getByTestId('outside')).not.toHaveAttribute('data-base-ui-inert');
    });
  });
});
