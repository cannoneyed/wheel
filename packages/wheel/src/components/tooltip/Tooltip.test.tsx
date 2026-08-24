// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type JSX } from 'solid-js';
import { Tooltip } from './index';
import { REASONS } from '../internals/reasons';

const OPEN_DELAY = 600;

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

beforeEach(() => {
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
});

interface TestTooltipProps {
  rootProps?: Tooltip.Root.Props;
  triggerProps?: Tooltip.Trigger.Props;
  portalProps?: Tooltip.Portal.Props;
  positionerProps?: Tooltip.Positioner.Props;
  popupProps?: Tooltip.Popup.Props;
  triggerChildren?: JSX.Element;
}

function TestTooltip(props: TestTooltipProps) {
  return (
    <Tooltip.Root {...props.rootProps}>
      <Tooltip.Trigger data-testid="trigger" {...props.triggerProps}>
        {props.triggerChildren ?? 'Toggle'}
      </Tooltip.Trigger>
      <Tooltip.Portal {...props.portalProps}>
        <Tooltip.Positioner data-testid="positioner" {...props.positionerProps}>
          <Tooltip.Popup data-testid="popup" {...props.popupProps}>
            Content
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function hover(trigger: Element) {
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' });
  fireEvent.mouseEnter(trigger);
  fireEvent.mouseMove(trigger);
}

describe('<Tooltip.Root />', () => {
  describe('uncontrolled open', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('opens when the trigger is hovered after the default delay', async () => {
      render(() => <TestTooltip />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      expect(screen.queryByText('Content')).toBe(null);

      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });
    });

    it('does not open before the delay elapses', () => {
      render(() => <TestTooltip />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY / 2);

      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes when the trigger is unhovered', async () => {
      render(() => <TestTooltip />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.mouseLeave(trigger);
      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });

    it('closes when Escape is pressed', async () => {
      render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      fireEvent.keyDown(document.body, { key: 'Escape' });

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });

    // Upstream skips this test under jsdom too (`:focus-visible` matching requires a real
    // browser); see reference `TooltipRoot.test.tsx`'s `({ skip }) => { if (isJSDOM) skip(); }`.
    it.skip('opens when the trigger is focused (requires a real browser for :focus-visible)', () => {});

    it('closes when the trigger is blurred', async () => {
      render(() => <TestTooltip />);
      const trigger = screen.getByTestId('trigger') as HTMLElement;

      trigger.focus();
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      trigger.blur();
      vi.advanceTimersByTime(OPEN_DELAY);

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
          <TestTooltip
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
          <TestTooltip
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
      render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);
    });

    it('does not open when the component is rendered and open is controlled to false', () => {
      render(() => <TestTooltip rootProps={{ defaultOpen: true, open: false }} />);
      expect(screen.queryByText('Content')).toBe(null);
    });

    it('remains uncontrolled', async () => {
      render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
      expect(screen.getByText('Content')).not.toBe(null);

      const trigger = screen.getByTestId('trigger');
      fireEvent.mouseLeave(trigger);

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
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
      render(() => <TestTooltip triggerProps={{ delay: 100 }} />);
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
      render(() => <TestTooltip triggerProps={{ closeDelay: 100 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.mouseLeave(trigger);
      expect(screen.getByText('Content')).not.toBe(null);

      vi.advanceTimersByTime(100);
      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });
  });

  describe('prop: disabled', () => {
    it('does not open when disabled', () => {
      render(() => <TestTooltip rootProps={{ disabled: true }} triggerProps={{ delay: 0 }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      expect(screen.queryByText('Content')).toBe(null);
    });

    it('closes when it becomes disabled while open', async () => {
      function App() {
        const [disabled, setDisabled] = createSignal(false);
        return (
          <div>
            <TestTooltip rootProps={{ defaultOpen: true, disabled: disabled() }} />
            <button type="button" data-testid="disable" onClick={() => setDisabled(true)} />
          </div>
        );
      }

      render(() => <App />);
      expect(screen.queryByText('Content')).not.toBe(null);

      fireEvent.click(screen.getByTestId('disable'));

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });
    });
  });

  describe('BaseUIChangeEventDetails', () => {
    it('onOpenChange cancel() prevents opening while uncontrolled', () => {
      render(() => (
        <TestTooltip
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

    it('allowPropagation() prevents stopPropagation on Escape while still closing', async () => {
      const stopPropagationSpy = vi.spyOn(Event.prototype as any, 'stopPropagation');

      render(() => (
        <TestTooltip
          rootProps={{
            defaultOpen: true,
            onOpenChange: (nextOpen, eventDetails) => {
              if (!nextOpen && eventDetails.reason === REASONS.escapeKey) {
                eventDetails.allowPropagation();
              }
            },
          }}
        />
      ));

      expect(screen.getByText('Content')).not.toBe(null);
      fireEvent.keyDown(document.body, { key: 'Escape' });

      await vi.waitFor(() => {
        expect(screen.queryByText('Content')).toBe(null);
      });

      expect(stopPropagationSpy).toHaveBeenCalledTimes(0);
      stopPropagationSpy.mockRestore();
    });
  });

  describe('dismissal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('closes when the trigger is clicked after the delay duration', async () => {
      render(() => <TestTooltip />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.click(trigger);
      expect(screen.queryByText('Content')).toBe(null);
    });

    it('does not close on click when closeOnClick is false', async () => {
      render(() => <TestTooltip triggerProps={{ closeOnClick: false }} />);
      const trigger = screen.getByTestId('trigger');

      hover(trigger);
      vi.advanceTimersByTime(OPEN_DELAY);
      await vi.waitFor(() => {
        expect(screen.getByText('Content')).not.toBe(null);
      });

      fireEvent.click(trigger);
      expect(screen.getByText('Content')).not.toBe(null);
    });
  });
});

describe('<Tooltip.Positioner />', () => {
  it('reflects the `side` and `align` props as data attributes', async () => {
    render(() => (
      <TestTooltip
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

  it('sets data-open/data-closed to reflect the open state', async () => {
    render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
    const positioner = screen.getByTestId('positioner');

    expect(positioner).toHaveAttribute('data-open');
    expect(positioner).not.toHaveAttribute('data-closed');
  });

  it('keeps the positioner mounted with keepMounted while closed', () => {
    render(() => <TestTooltip portalProps={{ keepMounted: true }} />);
    // Not open, but the positioner should still be in the DOM (hidden).
    const positioner = screen.getByTestId('positioner');
    expect(positioner).not.toBe(null);
    expect(positioner).toHaveAttribute('hidden');
  });

  it('does not render the positioner when closed and keepMounted is false', () => {
    render(() => <TestTooltip />);
    expect(screen.queryByTestId('positioner')).toBe(null);
  });
});

describe('<Tooltip.Popup />', () => {
  it('renders the data-starting-style attribute while opening', () => {
    // `defaultOpen` renders already-open on the very first pass — that's not an entrance
    // transition (mirrors upstream: `mounted` starts equal to `open`, so no 'starting' status is
    // produced). Toggle from closed to open instead to exercise the actual open transition.
    function App() {
      const [open, setOpen] = createSignal(false);
      return (
        <div>
          <TestTooltip rootProps={{ open: open(), onOpenChange: setOpen }} />
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
    render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
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
          <TestTooltip rootProps={{ open: open(), onOpenChange: setOpen }} />
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

describe('<Tooltip.Trigger />', () => {
  it('renders a native button element by default', () => {
    render(() => <TestTooltip />);
    expect(screen.getByTestId('trigger').tagName).toBe('BUTTON');
    expect(screen.getByTestId('trigger')).toHaveAttribute('type', 'button');
  });

  it('applies data-popup-open when the tooltip is open', () => {
    render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-popup-open');
  });

  it('applies data-trigger-disabled when disabled', () => {
    render(() => <TestTooltip triggerProps={{ disabled: true }} />);
    expect(screen.getByTestId('trigger')).toHaveAttribute('data-trigger-disabled');
  });

  it('does not add an aria-describedby relationship (matches upstream)', () => {
    // Upstream Base UI's Tooltip does not wire `aria-describedby` from the trigger to the
    // popup — verified by reading `reference/packages/react/src/tooltip/**` (no such attribute
    // is set anywhere in the trigger or popup source). This test documents that intentional
    // absence rather than asserting an unported feature.
    render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
    expect(screen.getByTestId('trigger')).not.toHaveAttribute('aria-describedby');
  });
});

describe('<Tooltip.Portal />', () => {
  it('renders the popup content into document.body', () => {
    render(() => <TestTooltip rootProps={{ defaultOpen: true }} />);
    const popup = screen.getByTestId('popup');
    expect(document.body.contains(popup)).toBe(true);
    expect(popup.closest('[data-base-ui-portal]')).not.toBe(null);
  });

  it('renders into a custom container element', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    render(() => (
      <TestTooltip rootProps={{ defaultOpen: true }} portalProps={{ container }} />
    ));

    const popup = screen.getByTestId('popup');
    expect(container.contains(popup)).toBe(true);
    container.remove();
  });
});

describe('<Tooltip.Provider />', () => {
  it('shares an instant open with adjacent tooltips within the timeout', async () => {
    vi.useFakeTimers();

    function App() {
      return (
        <Tooltip.Provider delay={200} closeDelay={0}>
          <Tooltip.Root>
            <Tooltip.Trigger data-testid="trigger-1">One</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup data-testid="popup-1">Content 1</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger data-testid="trigger-2">Two</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner>
                <Tooltip.Popup data-testid="popup-2">Content 2</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      );
    }

    render(() => <App />);

    const trigger1 = screen.getByTestId('trigger-1');
    const trigger2 = screen.getByTestId('trigger-2');

    hover(trigger1);
    vi.advanceTimersByTime(200);
    await vi.waitFor(() => {
      expect(screen.getByTestId('popup-1')).not.toBe(null);
    });

    fireEvent.mouseLeave(trigger1);
    hover(trigger2);

    // Within the provider's `timeout`, the second tooltip should not need to wait the full
    // `delay` again.
    await vi.waitFor(() => {
      expect(screen.getByTestId('popup-2')).not.toBe(null);
    });

    vi.useRealTimers();
  });
});
