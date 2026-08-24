// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import userEvent from '@testing-library/user-event';
import { createSignal, type JSX } from 'solid-js';
import { Popover } from './index';
import { REASONS } from '../internals/reasons';

// Portal/focus-manager tests render into `document.body` and attach document-level listeners;
// clean up explicitly since `globals: false` means `@solidjs/testing-library`'s automatic
// `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

/**
 * `useClick`'s pointer-open path and `FloatingFocusManager`'s `enqueueFocus` both defer through
 * `requestAnimationFrame`; run `fn` with it mocked to run synchronously so the resulting
 * click/focus move is observable without waiting a real frame (matches the pattern established in
 * `useClick.test.tsx`/`FloatingFocusManager.test.tsx`).
 *
 * Deliberately installed and restored *within a single synchronous call* (rather than via a
 * shared `beforeEach`/`afterEach` spanning a whole `describe`) so it can never overlap with a
 * sibling test's `vi.useFakeTimers()`/`vi.useRealTimers()` — mixing the two by leaving the spy
 * installed across hook boundaries corrupted the mock in a way that made an unrelated *later*
 * test's `requestAnimationFrame` call recurse into itself until the call stack overflowed (an
 * observed failure while writing this suite, not a hypothetical).
 */
function withSyncAnimationFrame<T>(fn: () => T): T {
  const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    },
  );
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

async function withSyncAnimationFrameAsync<T>(fn: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
    (callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    },
  );
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

interface TestPopoverProps {
  rootProps?: Popover.Root.Props;
  triggerProps?: Popover.Trigger.Props;
  portalProps?: Popover.Portal.Props;
  positionerProps?: Popover.Positioner.Props;
  popupProps?: Popover.Popup.Props;
  popupChildren?: JSX.Element;
  /** Rendered immediately after `Popover.Trigger`, inside `Popover.Root` — see upstream's own
   * `TestPopover` helper (`reference/packages/react/src/popover/root/PopoverRoot.test.tsx`), used
   * to probe the non-modal trigger `FocusGuard`'s "next tabbable after the trigger" target. */
  afterTrigger?: JSX.Element;
}

function TestPopover(props: TestPopoverProps) {
  return (
    <Popover.Root {...props.rootProps}>
      <Popover.Trigger data-testid="trigger" {...props.triggerProps}>
        Toggle
      </Popover.Trigger>
      {props.afterTrigger}
      <Popover.Portal {...props.portalProps}>
        <Popover.Positioner data-testid="positioner" {...props.positionerProps}>
          <Popover.Popup data-testid="popup" {...props.popupProps}>
            {props.popupChildren ?? 'Content'}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function hover(trigger: Element) {
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);
  fireEvent.mouseMove(trigger);
}

function click(element: Element) {
  withSyncAnimationFrame(() => fireEvent.click(element));
}

describe('<Popover.Root />', () => {
  describe('uncontrolled open', () => {
    it('opens the popover when the trigger is clicked', () => {
      render(() => <TestPopover />);
      const trigger = screen.getByTestId('trigger');

      expect(screen.queryByText('Content')).toBe(null);
      click(trigger);
      expect(screen.getByText('Content')).not.toBe(null);
    });

    it('closes the popover when the trigger is clicked twice', () => {
      render(() => <TestPopover />);
      const trigger = screen.getByTestId('trigger');

      click(trigger);
      expect(screen.getByText('Content')).not.toBe(null);

      click(trigger);
      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes when Escape is pressed', () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes when pressing outside the popup', () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      // Non-modal (default) popovers use the "intentional" outside-press mode for mouse input
      // (matching upstream's `PopoverRoot`), which only dismisses on a full `click`, not a bare
      // `pointerdown` — unlike `useDismiss`'s own generic default of "sloppy".
      fireEvent.click(document.body);

      expect(screen.queryByText('Content')).toBe(null);
    });
  });

  describe('prop: defaultOpen', () => {
    it('opens when the component is rendered', () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);
    });

    it('does not open when the component is rendered and open is controlled to false', () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true, open: false }} />);
      expect(screen.queryByText('Content')).toBe(null);
    });
  });

  describe('controlled open', () => {
    it('calls onOpenChange with the previous open value and event details', () => {
      const handleChange = vi.fn();

      function App() {
        const [open, setOpen] = createSignal(false);
        return (
          <TestPopover
            rootProps={{
              open: open(),
              onOpenChange: (nextOpen, eventDetails) => {
                handleChange(open(), eventDetails.reason);
                setOpen(nextOpen);
              },
            }}
          />
        );
      }

      render(() => <App />);
      expect(screen.queryByText('Content')).toBe(null);

      const trigger = screen.getByTestId('trigger');
      click(trigger);
      expect(screen.getByText('Content')).not.toBe(null);

      click(trigger);
      expect(screen.queryByText('Content')).toBe(null);

      expect(handleChange.mock.calls.length).toBe(2);
      expect(handleChange.mock.calls[0]).toEqual([false, REASONS.triggerPress]);
      expect(handleChange.mock.calls[1]).toEqual([true, REASONS.triggerPress]);
    });

    it('onOpenChange cancel() prevents opening while uncontrolled', () => {
      render(() => (
        <TestPopover
          rootProps={{
            onOpenChange: (nextOpen, eventDetails) => {
              if (nextOpen) {
                eventDetails.cancel();
              }
            },
          }}
        />
      ));

      click(screen.getByTestId('trigger'));

      expect(screen.queryByText('Content')).toBe(null);
    });

    it('does not call onOpenChange when the open state does not change', () => {
      const handleChange = vi.fn();

      render(() => (
        <TestPopover
          rootProps={{ open: false, onOpenChange: handleChange }}
          triggerProps={{ openOnHover: false }}
        />
      ));

      // Clicking the trigger requests `open: true`, but since `open` stays fixed at `false`
      // (fully controlled from outside), the popup never renders.
      click(screen.getByTestId('trigger'));

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Content')).toBe(null);
    });
  });

  describe('prop: openOnHover', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens after the hover delay when enabled', () => {
      render(() => <TestPopover triggerProps={{ openOnHover: true, delay: 100 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      expect(screen.queryByText('Content')).toBe(null);

      vi.advanceTimersByTime(100);
      expect(screen.getByText('Content')).not.toBe(null);
    });

    it('does not open on hover when disabled (default)', () => {
      render(() => <TestPopover triggerProps={{ delay: 0 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(1000);

      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes after the close delay once unhovered', () => {
      render(() => (
        <TestPopover triggerProps={{ openOnHover: true, delay: 0, closeDelay: 50 }} />
      ));
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(0);
      expect(screen.getByText('Content')).not.toBe(null);

      fireEvent.mouseLeave(trigger);
      expect(screen.getByText('Content')).not.toBe(null);

      vi.advanceTimersByTime(50);
      expect(screen.queryByText('Content')).toBe(null);
    });
  });
});

describe('<Popover.Trigger />', () => {
  it('renders a native button element by default', () => {
    render(() => <TestPopover />);
    const trigger = screen.getByTestId('trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
  });

  it('sets aria-haspopup="dialog" and aria-expanded', () => {
    render(() => <TestPopover />);
    const trigger = screen.getByTestId('trigger');

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('applies data-popup-open when the popover is open', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-popup-open');
  });

  it('sets aria-controls to the popup id once open', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
    const trigger = screen.getByTestId('trigger');
    const popup = screen.getByTestId('popup');

    expect(trigger.getAttribute('aria-controls')).toBe(popup.id);
    expect(popup.id).toBeTruthy();
  });
});

describe('<Popover.Positioner />', () => {
  it('reflects the `side` and `align` props as data attributes', async () => {
    render(() => (
      <TestPopover
        rootProps={{ defaultOpen: true }}
        positionerProps={{ side: 'right', align: 'start' }}
      />
    ));

    const positioner = screen.getByTestId('positioner');
    await waitFor(() => {
      expect(positioner).toHaveAttribute('data-side', 'right');
    });
    expect(positioner).toHaveAttribute('data-align', 'start');
  });

  it('sets data-open/data-closed to reflect the open state', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
    const positioner = screen.getByTestId('positioner');

    expect(positioner).toHaveAttribute('data-open');
    expect(positioner).not.toHaveAttribute('data-closed');
  });

  it('keeps the positioner mounted with keepMounted while closed', () => {
    render(() => <TestPopover portalProps={{ keepMounted: true }} />);
    const positioner = screen.getByTestId('positioner');
    expect(positioner).not.toBe(null);
    expect(positioner).toHaveAttribute('hidden');
  });

  it('does not render the positioner when closed and keepMounted is false', () => {
    render(() => <TestPopover />);
    expect(screen.queryByTestId('positioner')).toBe(null);
  });
});

describe('<Popover.Popup />', () => {
  it('renders with role="dialog"', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('popup')).toHaveAttribute('role', 'dialog');
  });

  it('renders the data-starting-style attribute while opening', () => {
    // `defaultOpen` renders already-open on the very first pass, which isn't an entrance
    // transition (`mounted` starts equal to `open`). Toggle from closed to open instead — via a
    // plain button/signal (not `Popover.Trigger`'s `useClick`), so this doesn't need a mocked
    // `requestAnimationFrame` and can observe the transient starting style before a *real* frame
    // clears it.
    function App() {
      const [open, setOpen] = createSignal(false);
      return (
        <div>
          <TestPopover rootProps={{ open: open(), onOpenChange: setOpen }} />
          <button type="button" data-testid="open" onClick={() => setOpen(true)} />
        </div>
      );
    }

    render(() => <App />);
    fireEvent.click(screen.getByTestId('open'));

    expect(screen.getByTestId('popup')).toHaveAttribute('data-starting-style');
  });

  it('sets the data-ending-style attribute while closing', async () => {
    function App() {
      const [open, setOpen] = createSignal(true);
      return (
        <div>
          <TestPopover rootProps={{ open: open(), onOpenChange: setOpen }} />
          <button type="button" data-testid="close" onClick={() => setOpen(false)} />
        </div>
      );
    }

    render(() => <App />);
    const popup = screen.getByTestId('popup');
    await waitFor(() => {
      expect(popup).not.toHaveAttribute('data-starting-style');
    });

    fireEvent.click(screen.getByTestId('close'));

    await waitFor(() => {
      expect(popup).toHaveAttribute('data-ending-style');
    });
  });
});

describe('<Popover.Backdrop />', () => {
  function TestPopoverWithBackdrop(props: TestPopoverProps) {
    return (
      <Popover.Root {...props.rootProps}>
        <Popover.Trigger data-testid="trigger" {...props.triggerProps}>
          Toggle
        </Popover.Trigger>
        <Popover.Portal {...props.portalProps}>
          <Popover.Backdrop data-testid="backdrop" />
          <Popover.Positioner>
            <Popover.Popup data-testid="popup">Content</Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  it('renders and reflects the open state', () => {
    render(() => <TestPopoverWithBackdrop rootProps={{ defaultOpen: true }} />);
    const backdrop = screen.getByTestId('backdrop');

    expect(backdrop).toHaveAttribute('data-open');
    expect(backdrop).not.toHaveAttribute('hidden');
  });

  it('is hidden while the popover is closed', () => {
    render(() => <TestPopoverWithBackdrop portalProps={{ keepMounted: true }} />);
    expect(screen.getByTestId('backdrop')).toHaveAttribute('hidden');
  });

  it('sets pointer-events: none when opened by hover', () => {
    vi.useFakeTimers();
    render(() => <TestPopoverWithBackdrop triggerProps={{ openOnHover: true, delay: 0 }} />);
    const trigger = screen.getByTestId('trigger');

    hover(trigger);
    vi.advanceTimersByTime(0);

    expect(screen.getByTestId('backdrop').style.pointerEvents).toBe('none');
    vi.useRealTimers();
  });

  it('does not set pointer-events: none when opened by click', () => {
    render(() => <TestPopoverWithBackdrop triggerProps={{ openOnHover: true }} />);
    click(screen.getByTestId('trigger'));

    expect(screen.getByTestId('backdrop').style.pointerEvents).not.toBe('none');
  });
});

describe('<Popover.Close />', () => {
  it('closes the popover when clicked', () => {
    render(() => (
      <TestPopover
        rootProps={{ defaultOpen: true }}
        popupChildren={<Popover.Close data-testid="close">Close</Popover.Close>}
      />
    ));

    expect(screen.getByText('Close')).not.toBe(null);
    fireEvent.click(screen.getByTestId('close'));

    expect(screen.queryByTestId('popup')).toBe(null);
  });

  it('dispatches the close-press reason', () => {
    const handleChange = vi.fn();
    render(() => (
      <TestPopover
        rootProps={{
          defaultOpen: true,
          onOpenChange: (_open, details) => handleChange(details.reason),
        }}
        popupChildren={<Popover.Close data-testid="close">Close</Popover.Close>}
      />
    ));

    fireEvent.click(screen.getByTestId('close'));

    expect(handleChange).toHaveBeenCalledWith(REASONS.closePress);
  });
});

describe('<Popover.Title /> and <Popover.Description />', () => {
  it('labels the popup element via aria-labelledby', () => {
    render(() => (
      <TestPopover
        rootProps={{ defaultOpen: true }}
        popupChildren={<Popover.Title data-testid="title">Title</Popover.Title>}
      />
    ));

    const title = screen.getByTestId('title');
    expect(screen.getByTestId('popup')).toHaveAttribute('aria-labelledby', title.id);
    expect(title.tagName).toBe('H2');
  });

  it('describes the popup element via aria-describedby', () => {
    render(() => (
      <TestPopover
        rootProps={{ defaultOpen: true }}
        popupChildren={
          <Popover.Description data-testid="description">Description</Popover.Description>
        }
      />
    ));

    const description = screen.getByTestId('description');
    expect(screen.getByTestId('popup')).toHaveAttribute('aria-describedby', description.id);
    expect(description.tagName).toBe('P');
  });
});

describe('modal focus management', () => {
  function ModalTestPopover(props: { popupProps?: Popover.Popup.Props }) {
    return (
      <Popover.Root modal>
        <Popover.Trigger data-testid="trigger">Toggle</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup data-testid="popup" {...props.popupProps}>
              <button data-testid="one" type="button">
                one
              </button>
              <button data-testid="two" type="button">
                two
              </button>
              <Popover.Close data-testid="three">three</Popover.Close>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    );
  }

  it('moves focus into the popup when opened', async () => {
    render(() => <ModalTestPopover />);
    await withSyncAnimationFrameAsync(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await flushMicrotasks();
    });

    expect(screen.getByTestId('one')).toHaveFocus();
  });

  it('traps Tab/Shift+Tab focus within the modal popup', async () => {
    render(() => <ModalTestPopover />);

    await withSyncAnimationFrameAsync(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await flushMicrotasks();

      const user = userEvent.setup();

      await user.tab();
      expect(screen.getByTestId('two')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('three')).toHaveFocus();

      // Tabbing forward from the last element wraps back to the first.
      await user.tab();
      expect(screen.getByTestId('one')).toHaveFocus();

      // Shift+Tab from the first element wraps back to the last.
      await user.tab({ shift: true });
      expect(screen.getByTestId('three')).toHaveFocus();
    });
  });

  it('returns focus to the trigger when the popup is closed', async () => {
    render(() => <ModalTestPopover />);
    const trigger = screen.getByTestId('trigger');
    trigger.focus();

    await withSyncAnimationFrameAsync(async () => {
      fireEvent.click(trigger);
      await flushMicrotasks();
      expect(screen.getByTestId('one')).toHaveFocus();

      fireEvent.click(screen.getByTestId('three'));
      await flushMicrotasks();
    });

    expect(trigger).toHaveFocus();
  });

  it('moves focus to a custom initialFocus target', async () => {
    const ref: { current: HTMLButtonElement | null } = { current: null };

    render(() => (
      <Popover.Root>
        <Popover.Trigger data-testid="trigger">Toggle</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup data-testid="popup" initialFocus={ref}>
              <button data-testid="one" type="button">
                one
              </button>
              <button data-testid="two" type="button" ref={(el) => (ref.current = el)}>
                two
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    ));

    await withSyncAnimationFrameAsync(async () => {
      fireEvent.click(screen.getByTestId('trigger'));
      await flushMicrotasks();
    });

    expect(screen.getByTestId('two')).toHaveFocus();
  });

  it('does not move focus when initialFocus is false', async () => {
    render(() => (
      <Popover.Root>
        <Popover.Trigger data-testid="trigger">Toggle</Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner>
            <Popover.Popup data-testid="popup" initialFocus={false}>
              <button data-testid="one" type="button">
                one
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    ));

    const trigger = screen.getByTestId('trigger');
    trigger.focus();

    await withSyncAnimationFrameAsync(async () => {
      fireEvent.click(trigger);
      await flushMicrotasks();
    });

    expect(trigger).toHaveFocus();
  });
});

describe('<Popover.Portal />', () => {
  it('renders the popup content into document.body', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
    expect(popup.closest('[data-base-ui-portal]')).not.toBe(null);
  });

  it('renders into a custom container element', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(() => <TestPopover rootProps={{ defaultOpen: true }} portalProps={{ container }} />);

    const popup = screen.getByTestId('popup');
    expect(container.contains(popup)).toBe(true);
    container.remove();
  });
});

describe('prop: modal', () => {
  it('renders an internal backdrop when `true`', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true, modal: true }} />);

    const positioner = screen.getByTestId('positioner');
    expect(positioner.previousElementSibling).toHaveAttribute('role', 'presentation');
  });

  it('does not render an internal backdrop when `false` (default)', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);

    const positioner = screen.getByTestId('positioner');
    expect(positioner.previousElementSibling).toBe(null);
  });

  it('does not render an internal backdrop when `trap-focus`', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true, modal: 'trap-focus' }} />);

    const positioner = screen.getByTestId('positioner');
    expect(positioner.previousElementSibling).toBe(null);
  });

  it('does not render an internal backdrop while opened by hover', () => {
    vi.useFakeTimers();
    render(() => (
      <TestPopover rootProps={{ modal: true }} triggerProps={{ openOnHover: true, delay: 0 }} />
    ));

    hover(screen.getByTestId('trigger'));
    vi.advanceTimersByTime(0);

    const positioner = screen.getByTestId('positioner');
    expect(positioner.previousElementSibling).toBe(null);
    vi.useRealTimers();
  });

  describe('scroll locking', () => {
    // The underlying `ScrollLocker` singleton applies/releases the lock through a 0ms timer (see
    // `createScrollLock.ts`), so both directions of this assertion are genuinely async — a
    // same-tick open+close cycle (as in most of this suite) can race past the lock entirely.
    it('locks document scroll while a modal popover opened by click is open, unlocking on close', async () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true, modal: true }} />);

      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute('data-base-ui-scroll-locked');
      });

      click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
      });
    });

    it('does not lock document scroll for a non-modal popover', async () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true, modal: false }} />);

      await flushMicrotasks();
      expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
    });

    it('does not lock document scroll when modal is `trap-focus`', async () => {
      render(() => <TestPopover rootProps={{ defaultOpen: true, modal: 'trap-focus' }} />);

      await flushMicrotasks();
      expect(document.documentElement).not.toHaveAttribute('data-base-ui-scroll-locked');
    });
  });
});

describe('closePart gating', () => {
  // Upstream's `focusManagerModal` is `modal !== false && hasClosePart` — a modal popup with no
  // `Popover.Close` never traps focus (which would otherwise strand keyboard users with no way to
  // escape). `FloatingFocusManager` still renders its own "inside" focus guards for any portaled
  // content regardless of modal state (they just behave as a bounce-through instead of a trap when
  // non-modal), so presence/absence of those guards doesn't distinguish trapped from untrapped —
  // the trap is only observable behaviorally: does Tab escape the popup, or wrap back inside it?
  it('does not trap focus in a modal popup with no Popover.Close — Tab escapes instead of wrapping', async () => {
    // See the "non-modal trigger focus guards" tests' comment: run the mount with rAF mocked
    // synchronous and flush microtasks so `defaultOpen`'s initial-focus-on-open sequence settles
    // deterministically before driving focus manually, to avoid racing it.
    await withSyncAnimationFrameAsync(async () => {
      render(() => (
        <TestPopover
          rootProps={{ defaultOpen: true, modal: true }}
          popupChildren={<input data-testid="input-inside" />}
          afterTrigger={<input data-testid="focus-target" />}
        />
      ));
      await flushMicrotasks();
    });

    const trigger = screen.getByTestId('trigger');
    // `hasClosePart` is false, so `focusManagerModal` is false — the trigger's own non-modal
    // focus guards are rendered exactly as they would be for a non-modal popup.
    expect(trigger.previousElementSibling).toHaveAttribute('data-base-ui-focus-guard');
    expect(trigger.nextElementSibling).toHaveAttribute('data-base-ui-focus-guard');

    screen.getByTestId('input-inside').focus();

    const user = userEvent.setup();
    await user.tab();

    expect(screen.getByTestId('focus-target')).toHaveFocus();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });
    // This popover was `modal`, so closing also released the scroll lock (see the "scroll
    // locking" describe above) — its `ScrollLocker` singleton settles through a 0ms timer, not
    // synchronously with unmount. Let it fully drain so no queued callback fires mid-way through a
    // later, unrelated test.
    await flushMicrotasks();
  });
});

describe('non-modal trigger focus guards', () => {
  it('renders a pair of invisible focus guards around the trigger while it owns an open non-modal popup', () => {
    render(() => <TestPopover rootProps={{ defaultOpen: true }} />);

    const trigger = screen.getByTestId('trigger');
    expect(trigger.previousElementSibling).toHaveAttribute('data-base-ui-focus-guard');
    expect(trigger.nextElementSibling).toHaveAttribute('data-base-ui-focus-guard');
  });

  it('does not render focus guards around the trigger while the popup is closed', () => {
    render(() => <TestPopover />);

    const trigger = screen.getByTestId('trigger');
    expect(trigger.previousElementSibling).toBe(null);
    expect(trigger.nextElementSibling).toBe(null);
  });

  it('moves focus to the element following the trigger when tabbing forward from the open popup', async () => {
    // See the "backward" test's comment below: run the mount with rAF mocked synchronous and
    // flush microtasks so `defaultOpen`'s initial-focus-on-open sequence settles deterministically
    // before driving focus manually.
    await withSyncAnimationFrameAsync(async () => {
      render(() => (
        <TestPopover
          rootProps={{ defaultOpen: true }}
          popupChildren={<input data-testid="input-inside" />}
          afterTrigger={<input data-testid="focus-target" />}
        />
      ));
      await flushMicrotasks();
    });

    screen.getByTestId('input-inside').focus();

    const user = userEvent.setup();
    await user.tab();

    expect(screen.getByTestId('focus-target')).toHaveFocus();

    await waitFor(() => {
      expect(screen.queryByTestId('popup')).toBe(null);
    });
  });

  it('moves focus back to the trigger when tabbing backward to it from outside the popup', async () => {
    // `defaultOpen` triggers `FloatingFocusManager`'s own initial-focus-on-open sequence, which is
    // queued via a microtask + `requestAnimationFrame` (`enqueueFocus`). Run the mount with rAF
    // mocked synchronous (matching the "modal focus management" tests' own pattern) and flush
    // microtasks so that sequence resolves deterministically before driving focus manually —
    // otherwise the real, still-pending `requestAnimationFrame` callback can fire later and
    // override the manual `.focus()`/Tab sequence below (observed intermittently as flakiness
    // while writing this test).
    await withSyncAnimationFrameAsync(async () => {
      render(() => (
        <div>
          <TestPopover
            rootProps={{ defaultOpen: true }}
            popupChildren={<input data-testid="input-inside" />}
          />
        </div>
      ));
      await flushMicrotasks();
    });

    const trigger = screen.getByTestId('trigger');
    screen.getByTestId('input-inside').focus();

    const user = userEvent.setup();
    await user.tab({ shift: true });

    // Unlike tabbing forward past the trigger's own after-guard (which owns the "leaving the
    // popover" case and closes it), tabbing backward from inside the popup to the trigger is
    // handled entirely by `FloatingFocusManager`'s own before-guard resolving
    // `previousFocusableElement` (the active trigger element) — the popover itself stays open,
    // matching upstream's analogous "tabbing backward to the trigger" tests (only a *nested*
    // popup closes in those, never the parent).
    expect(trigger).toHaveFocus();
  });
});

describe('nested popup interactions', () => {
  // Upstream keeps both popovers open here: `useDismiss`'s "intentional" mouse mode only treats a
  // press as a genuine outside dismissal when the same interaction both *starts* and *ends*
  // outside the floating subtree, and the child popover is part of the parent's subtree via the
  // (now-restored) `FloatingTree` nesting.
  //
  // The parent tracks the press through the logical FloatingTree. Real DOM
  // containment cannot see the child because its popup is portaled.
  // Nested floating positioning requires real layout; the browser suite runs this interaction.
  it.skip('keeps the parent popover open when press starts in a nested popover and ends outside', () => {
    render(() => (
      <div>
        <button type="button" data-testid="outside">
          Outside
        </button>
        <Popover.Root defaultOpen>
          <Popover.Trigger>Parent</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner>
              <Popover.Popup data-testid="parent-popup">
                <Popover.Root>
                  <Popover.Trigger>Child</Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Positioner>
                      <Popover.Popup data-testid="child-popup">Child content</Popover.Popup>
                    </Popover.Positioner>
                  </Popover.Portal>
                </Popover.Root>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    ));

    expect(screen.queryByTestId('parent-popup')).not.toBe(null);

    const childTrigger = screen.getByRole('button', { name: 'Child' });
    fireEvent.click(childTrigger);

    const childPopup = screen.getByTestId('child-popup');
    const outside = screen.getByTestId('outside');

    fireEvent.pointerDown(childPopup, { pointerType: 'mouse', button: 0 });
    fireEvent.click(outside);

    expect(screen.queryByTestId('parent-popup')).not.toBe(null);
    expect(screen.queryByTestId('child-popup')).not.toBe(null);
  });
});
