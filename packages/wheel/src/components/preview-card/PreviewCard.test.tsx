// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type JSX } from 'solid-js';
import { PreviewCard } from './index';
import { REASONS } from '../internals/reasons';

const OPEN_DELAY = 600;
const CLOSE_DELAY = 300;

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

interface TestPreviewCardProps {
  rootProps?: PreviewCard.Root.Props;
  triggerProps?: PreviewCard.Trigger.Props;
  portalProps?: PreviewCard.Portal.Props;
  positionerProps?: PreviewCard.Positioner.Props;
  popupProps?: PreviewCard.Popup.Props;
  triggerChildren?: JSX.Element;
}

function TestPreviewCard(props: TestPreviewCardProps) {
  return (
    <PreviewCard.Root {...props.rootProps}>
      <PreviewCard.Trigger href="#" data-testid="trigger" {...props.triggerProps}>
        {props.triggerChildren ?? 'Link'}
      </PreviewCard.Trigger>
      <PreviewCard.Portal {...props.portalProps}>
        <PreviewCard.Positioner data-testid="positioner" {...props.positionerProps}>
          <PreviewCard.Popup data-testid="popup" {...props.popupProps}>
            Content
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}

function hover(trigger: Element) {
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);
  fireEvent.mouseMove(trigger);
}

describe('<PreviewCard.Root />', () => {
  describe('uncontrolled open', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens when the trigger is hovered after the default delay', async () => {
      render(() => <TestPreviewCard />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      expect(screen.queryByText('Content')).toBe(null);

      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });
    });

    it('does not open before the delay elapses', () => {
      render(() => <TestPreviewCard />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY / 2);

      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes when the trigger is unhovered after the default close delay', async () => {
      render(() => <TestPreviewCard />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.mouseLeave(trigger);
      vi.advanceTimersByTime(CLOSE_DELAY);

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });

    // Upstream skips this test under jsdom too (`:focus-visible` matching requires a real
    // browser); see reference `PreviewCardRoot.test.tsx`'s `if (!isJSDOM) { return; }` guard.
    it.skip('opens when the trigger is focused (requires a real browser for :focus-visible)', () => {});

    it('closes when the trigger is blurred', async () => {
      render(() => <TestPreviewCard />);
      const trigger = screen.getByTestId('trigger') as HTMLElement;

      trigger.focus();
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      trigger.blur();
      vi.advanceTimersByTime(CLOSE_DELAY);

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });
  });

  describe('controlled open', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onOpenChange with the previous open value when the state changes', async () => {
      const handleChange = vi.fn();

      function App() {
        const [open, setOpen] = createSignal(false);
        return (
          <TestPreviewCard
            rootProps={{
              open: open(),
              onOpenChange: (nextOpen) => {
                handleChange(open());
                setOpen(nextOpen);
              },
            }}
          />
        );
      }

      render(() => <App />);
      expect(screen.queryByText('Content')).toBe(null);

      const trigger = screen.getByTestId('trigger');
      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);

      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.mouseLeave(trigger);
      vi.advanceTimersByTime(CLOSE_DELAY);

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });

      expect(handleChange.mock.calls.length).toBe(2);
      expect(handleChange.mock.calls[0][0]).toBe(false);
      expect(handleChange.mock.calls[1][0]).toBe(true);
    });

    it('does not call onOpenChange when the open state does not change', async () => {
      const handleChange = vi.fn();

      function App() {
        const [open] = createSignal(false);
        return (
          <TestPreviewCard
            rootProps={{
              open: open(),
              onOpenChange: () => {
                handleChange(open());
              },
            }}
          />
        );
      }

      render(() => <App />);

      const trigger = screen.getByTestId('trigger');
      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(handleChange).toHaveBeenCalledTimes(1);
      });

      expect(screen.queryByText('Content')).toBe(null);
      expect(handleChange.mock.calls[0][0]).toBe(false);
    });
  });

  describe('prop: defaultOpen', () => {
    it('opens when the component is rendered', () => {
      render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);
    });

    it('does not open when the component is rendered and open is controlled to false', () => {
      render(() => <TestPreviewCard rootProps={{ defaultOpen: true, open: false }} />);
      expect(screen.queryByText('Content')).toBe(null);
    });

    it('remains uncontrolled', async () => {
      vi.useFakeTimers();
      render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      const trigger = screen.getByTestId('trigger');
      fireEvent.mouseLeave(trigger);
      vi.advanceTimersByTime(CLOSE_DELAY);

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
      vi.useRealTimers();
    });
  });

  describe('prop: delay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens after the custom delay', async () => {
      render(() => <TestPreviewCard triggerProps={{ delay: 100 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      expect(screen.queryByText('Content')).toBe(null);

      vi.advanceTimersByTime(100);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });
    });
  });

  describe('prop: closeDelay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('closes after the custom delay', async () => {
      render(() => <TestPreviewCard triggerProps={{ closeDelay: 50 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.mouseLeave(trigger);
      expect(screen.getByText('Content')).not.toBe(null);

      vi.advanceTimersByTime(50);
      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });
  });

  describe('prop: payload', () => {
    // Deviation: upstream's render-function `children` re-invokes reactively on every React
    // render, so it always reflects the active trigger's current `payload`. This port's
    // equivalent (`PreviewCardRootChildren` in `PreviewCardRoot.tsx`) is a plain Solid component
    // whose body runs exactly once (Solid semantics) — it therefore captures `payload` at the
    // moment the render function is first invoked, which is always *before* any `PreviewCard.
    // Trigger` inside it has had a chance to register and set the store's `payload`. The payload
    // is consequently always `undefined` the first (and only) time a render-function child is
    // evaluated, regardless of `defaultTriggerId`/hover/imperative opens. Same cut
    // `TooltipRootChildren`/`PopoverRootChildren` document; flagged here as a known limitation
    // rather than silently accepted.
    it('does not reactively reflect the active trigger payload in a render-function child', () => {
      render(() => (
        <PreviewCard.Root defaultOpen defaultTriggerId="trigger-1">
          {(arg) => (
            <>
              <PreviewCard.Trigger href="#" id="trigger-1" payload={42}>
                Link
              </PreviewCard.Trigger>
              <PreviewCard.Portal>
                <PreviewCard.Positioner>
                  <PreviewCard.Popup data-testid="popup">{arg.payload ?? 'none'}</PreviewCard.Popup>
                </PreviewCard.Positioner>
              </PreviewCard.Portal>
            </>
          )}
        </PreviewCard.Root>
      ));

      expect(screen.getByTestId('popup').textContent).toBe('none');
    });
  });

  describe('BaseUIChangeEventDetails', () => {
    it('onOpenChange cancel() prevents opening while uncontrolled', () => {
      render(() => (
        <TestPreviewCard
          rootProps={{
            onOpenChange: (nextOpen, eventDetails) => {
              if (nextOpen) {
                eventDetails.cancel();
              }
            },
          }}
          triggerProps={{ delay: 0 }}
        />
      ));

      const trigger = screen.getByTestId('trigger');
      hover(trigger);

      expect(screen.queryByText('Content')).toBe(null);
    });
  });

  describe('dismissal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('closes when Escape is pressed', async () => {
      render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      fireEvent.keyDown(document.body, { key: 'Escape' });

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });

    it('reopens on hover after Escape closes it', async () => {
      render(() => <TestPreviewCard triggerProps={{ delay: 0 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(0);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.keyDown(document.body, { key: 'Escape' });
      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });

      hover(trigger);
      vi.advanceTimersByTime(0);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });
    });
  });
});

describe('<PreviewCard.Positioner />', () => {
  it('reflects the `side` and `align` props as data attributes', async () => {
    render(() => (
      <TestPreviewCard
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

  it('defaults to the bottom side', async () => {
    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);

    const positioner = screen.getByTestId('positioner');
    await waitFor(() => {
      expect(positioner).toHaveAttribute('data-side', 'bottom');
    });
  });

  it('sets data-open/data-closed to reflect the open state', async () => {
    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
    const positioner = screen.getByTestId('positioner');

    expect(positioner).toHaveAttribute('data-open');
    expect(positioner).not.toHaveAttribute('data-closed');
  });

  it('keeps the positioner mounted with keepMounted while closed', () => {
    render(() => <TestPreviewCard portalProps={{ keepMounted: true }} />);
    const positioner = screen.getByTestId('positioner');
    expect(positioner).not.toBe(null);
    expect(positioner).toHaveAttribute('hidden');
  });

  it('does not render the positioner when closed and keepMounted is false', () => {
    render(() => <TestPreviewCard />);
    expect(screen.queryByTestId('positioner')).toBe(null);
  });
});

describe('<PreviewCard.Popup />', () => {
  it('renders the data-starting-style attribute while opening', () => {
    function App() {
      const [open, setOpen] = createSignal(false);
      return (
        <div>
          <TestPreviewCard rootProps={{ open: open(), onOpenChange: setOpen }} />
          <button type="button" data-testid="open" onClick={() => setOpen(true)} />
        </div>
      );
    }

    render(() => <App />);
    fireEvent.click(screen.getByTestId('open'));

    const popup = screen.getByTestId('popup');
    expect(popup).toHaveAttribute('data-starting-style');
  });

  it('removes the data-starting-style attribute once mounted', async () => {
    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');

    await waitFor(() => {
      expect(popup).not.toHaveAttribute('data-starting-style');
    });
  });

  it('sets the data-ending-style attribute while closing', async () => {
    function App() {
      const [open, setOpen] = createSignal(true);
      return (
        <div>
          <TestPreviewCard rootProps={{ open: open(), onOpenChange: setOpen }} />
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

describe('<PreviewCard.Trigger />', () => {
  it('renders a native anchor element by default', () => {
    render(() => <TestPreviewCard />);
    expect(screen.getByTestId('trigger').tagName).toBe('A');
    expect(screen.getByTestId('trigger')).toHaveAttribute('href', '#');
  });

  it('applies data-popup-open when the preview card is open', () => {
    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-popup-open');
  });
});

describe('<PreviewCard.Portal />', () => {
  it('renders the popup content into document.body', () => {
    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
    expect(popup.closest('[data-base-ui-portal]')).not.toBe(null);
  });

  it('renders into a custom container element', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(() => <TestPreviewCard rootProps={{ defaultOpen: true }} portalProps={{ container }} />);

    const popup = screen.getByTestId('popup');
    expect(container.contains(popup)).toBe(true);
    container.remove();
  });
});

describe('<PreviewCard.Arrow />', () => {
  it('reflects the current side/align as data attributes', async () => {
    render(() => (
      <PreviewCard.Root defaultOpen>
        <PreviewCard.Trigger href="#">Link</PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Positioner side="right" align="start">
            <PreviewCard.Popup>
              <PreviewCard.Arrow data-testid="arrow" />
              Content
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    ));

    const arrow = screen.getByTestId('arrow');
    await waitFor(() => {
      expect(arrow).toHaveAttribute('data-side', 'right');
    });
    expect(arrow).toHaveAttribute('data-align', 'start');
  });
});

describe('<PreviewCard.Backdrop />', () => {
  it('reflects the open state via data attributes and is hidden while unmounted', () => {
    render(() => (
      <PreviewCard.Root>
        <PreviewCard.Trigger href="#">Link</PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Backdrop data-testid="backdrop" />
          <PreviewCard.Positioner>
            <PreviewCard.Popup>Content</PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    ));

    expect(screen.queryByTestId('backdrop')).toBe(null);
  });

  it('renders while open without blocking pointer events (preview cards are non-modal)', () => {
    render(() => (
      <PreviewCard.Root defaultOpen>
        <PreviewCard.Trigger href="#">Link</PreviewCard.Trigger>
        <PreviewCard.Portal>
          <PreviewCard.Backdrop data-testid="backdrop" />
          <PreviewCard.Positioner>
            <PreviewCard.Popup>Content</PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
    ));

    const backdrop = screen.getByTestId('backdrop');
    expect(backdrop).toHaveAttribute('data-open');
    expect(backdrop.style.pointerEvents).toBe('none');
  });
});

describe('REASONS', () => {
  it('reports trigger-hover as the reason when opened via hover', async () => {
    vi.useFakeTimers();
    const handleChange = vi.fn();

    render(() => (
      <TestPreviewCard triggerProps={{ delay: 0 }} rootProps={{ onOpenChange: handleChange }} />
    ));

    hover(screen.getByTestId('trigger'));
    vi.advanceTimersByTime(0);

    await vi.waitFor(() => {
      expect(handleChange).toHaveBeenCalled();
    });

    expect(handleChange.mock.calls[0][1].reason).toBe(REASONS.triggerHover);
    vi.useRealTimers();
  });
});
