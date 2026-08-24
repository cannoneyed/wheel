// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { Drawer } from '../index';
import { REASONS } from '../../internals/reasons';
import { useDrawerRootContext } from './DrawerRootContext';

vi.mock('../../base-utils/platform/index', async () => {
  const actual =
    await vi.importActual<typeof import('../../base-utils/platform/index')>(
      '../../base-utils/platform/index',
    );
  return {
    ...actual,
    platform: {
      ...actual.platform,
      os: { ...actual.platform.os, android: true },
    },
  };
});

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

function ActiveSnapPointDisplay() {
  const store = useDrawerRootContext();
  const activeSnapPoint = store.useState('activeSnapPoint');
  return <div data-testid="active-snap">{String(activeSnapPoint())}</div>;
}

/**
 * Reads the active trigger's payload straight from the store (reactively), rather than from the
 * `Drawer.Root` render-function argument. `DrawerRootChildren` — like `TooltipRootChildren`/
 * `PreviewCardRootChildren`/`PopoverRootChildren`/`DialogRootChildren` (see their doc comments) —
 * invokes a render-function `children` exactly once at setup (Solid component bodies run once),
 * so the destructured `payload` argument itself does not update on a later payload change while
 * the same `Drawer.Root` stays mounted. This is an established, cross-component deviation from
 * upstream (which re-invokes the render prop on every React re-render), not specific to Drawer; a
 * context-reading display sidesteps it the same way a real consumer relying on live payload
 * updates would (reading the store directly rather than destructuring the render-function arg).
 */
function PayloadDisplay(props: { testId?: string; fallback?: string }) {
  const store = useDrawerRootContext();
  const payload = store.useState('payload') as () => number | undefined;
  return (
    <span data-testid={props.testId ?? 'payload'}>{payload() ?? props.fallback}</span>
  );
}

describe('<Drawer.Root />', () => {
  // The swipe-threshold/swipe-gesture-driven Root tests (size-based threshold, snap-point
  // swipe/overshoot/sequential-skip, controlled-swipe-close cancellation/acceptance) are ported
  // behaviorally against `Drawer.Viewport`/`Drawer.SwipeArea` directly instead of duplicating them
  // here — see `viewport/DrawerViewport.test.tsx` and `swipe-area/DrawerSwipeArea.test.tsx`, which
  // exercise the same `useSwipeDismiss` gesture math this Root wires up. Upstream gates the
  // equivalent Root-level swipe tests with `it.skipIf(isJSDOM)` (they rely on real layout
  // measurements like `offsetWidth`), so they are not expected to run under jsdom either.

  it('supports detached triggers with handles', async () => {
    const handle = Drawer.createHandle<number>();

    render(() => (
      <div>
        <Drawer.Trigger handle={handle} payload={1}>
          Trigger 1
        </Drawer.Trigger>
        <Drawer.Trigger handle={handle} payload={2}>
          Trigger 2
        </Drawer.Trigger>
        <Drawer.Root handle={handle}>
          {() => (
            <Drawer.Portal>
              <Drawer.Viewport>
                <Drawer.Popup>
                  <PayloadDisplay />
                  <Drawer.Close>Close</Drawer.Close>
                </Drawer.Popup>
              </Drawer.Viewport>
            </Drawer.Portal>
          )}
        </Drawer.Root>
      </div>
    ));

    expect(screen.queryByTestId('payload')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Trigger 1' }));
    expect(screen.getByTestId('payload').textContent).toBe('1');

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('payload')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Trigger 2' }));
    expect(screen.getByTestId('payload').textContent).toBe('2');
  });

  it('supports imperative actions with handles', async () => {
    const handle = Drawer.createHandle<number>();

    render(() => (
      <div>
        <Drawer.Trigger handle={handle} id="trigger-1" payload={1}>
          Trigger 1
        </Drawer.Trigger>
        <Drawer.Trigger handle={handle} id="trigger-2" payload={2}>
          Trigger 2
        </Drawer.Trigger>
        <Drawer.Root handle={handle}>
          {() => (
            <Drawer.Portal>
              <Drawer.Viewport>
                <Drawer.Popup>
                  <PayloadDisplay testId="content" />
                </Drawer.Popup>
              </Drawer.Viewport>
            </Drawer.Portal>
          )}
        </Drawer.Root>
      </div>
    ));

    const trigger1 = screen.getByRole('button', { name: 'Trigger 1' });
    const trigger2 = screen.getByRole('button', { name: 'Trigger 2' });
    expect(screen.queryByRole('dialog')).toBe(null);

    handle.open('trigger-2');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBe(null);
    });

    expect(screen.getByTestId('content').textContent).toBe('2');
    expect(trigger2).toHaveAttribute('aria-expanded', 'true');
    expect(trigger2.getAttribute('aria-controls')).toBe(
      screen.getByRole('dialog').getAttribute('id'),
    );
    expect(trigger1).toHaveAttribute('aria-expanded', 'false');

    handle.close();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBe(null);
    });
    expect(trigger2).toHaveAttribute('aria-expanded', 'false');

    handle.openWithPayload(8);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBe(null);
    });
    expect(screen.getByTestId('content').textContent).toBe('8');
    expect(trigger1).toHaveAttribute('aria-expanded', 'false');
    expect(trigger2).toHaveAttribute('aria-expanded', 'false');
  });

  it('attaches fresh root state when a handle-backed root remounts', async () => {
    const handle = Drawer.createHandle<number>();

    function App() {
      const [mounted, setMounted] = createSignal(true);

      return (
        <div>
          <Drawer.Trigger handle={handle} id="trigger" payload={1}>
            Trigger
          </Drawer.Trigger>
          {!mounted() && (
            <button type="button" onClick={() => setMounted(true)}>
              Remount root
            </button>
          )}
          {mounted() && (
            <Drawer.Root handle={handle}>
              {() => (
                <div>
                  <PayloadDisplay fallback="No payload" />
                  <Drawer.Portal>
                    <Drawer.Viewport>
                      <Drawer.Popup>
                        Drawer content
                        <button type="button" onClick={() => setMounted(false)}>
                          Unmount root
                        </button>
                      </Drawer.Popup>
                    </Drawer.Viewport>
                  </Drawer.Portal>
                </div>
              )}
            </Drawer.Root>
          )}
        </div>
      );
    }

    render(() => <App />);
    const trigger = screen.getByRole('button', { name: 'Trigger' });

    expect(screen.getByTestId('payload').textContent).toBe('No payload');

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByText('Drawer content')).toBeVisible();
    });
    expect(screen.getByTestId('payload').textContent).toBe('1');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(
      screen.getByRole('dialog').getAttribute('id'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unmount root' }));
    expect(handle.isOpen).toBe(false);
    expect(screen.queryByText('Drawer content')).toBe(null);

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    handle.openWithPayload(8);
    handle.open('trigger');
    handle.close();
    const detachedWarnings = consoleWarn.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' && message.includes('no root using this handle is mounted'),
    );
    consoleWarn.mockRestore();

    expect(handle.isOpen).toBe(false);
    expect(detachedWarnings).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Remount root' }));
    expect(screen.getByTestId('payload').textContent).toBe('No payload');
    expect(screen.queryByText('Drawer content')).toBe(null);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');

    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByText('Drawer content')).toBeVisible();
    });
    expect(screen.getByTestId('payload').textContent).toBe('1');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(
      screen.getByRole('dialog').getAttribute('id'),
    );
  });

  it('synchronizes trigger aria-controls with the popup id', async () => {
    render(() => (
      <Drawer.Root>
        <Drawer.Trigger>Open</Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup data-testid="popup">Drawer</Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    const trigger = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).not.toBe(null);
    });

    const popup = screen.getByTestId('popup');
    expect(trigger.getAttribute('aria-controls')).toBe(popup.getAttribute('id'));
  });

  it('resets the active snap point when closing', async () => {
    const snapPoints = ['100px', '300px', 1];
    const [open, setOpen] = createSignal(true);
    const [snapPoint, setSnapPoint] = createSignal<Drawer.Root.SnapPoint | null>(snapPoints[2]);

    render(() => (
      <div>
        <div data-testid="active-snap">{String(snapPoint())}</div>
        <Drawer.Root
          open={open()}
          onOpenChange={setOpen}
          snapPoints={snapPoints}
          snapPoint={snapPoint()}
          onSnapPointChange={setSnapPoint}
        >
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup>
                Drawer
                <Drawer.Close data-testid="close">Close</Drawer.Close>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    ));

    const closeButton = screen.getByTestId('close');
    fireEvent.click(closeButton);

    expect(screen.getByTestId('active-snap').textContent).toBe('100px');
  });

  it('resets to the default snap point when provided', async () => {
    const snapPoints = ['100px', '300px', 1];
    const [open, setOpen] = createSignal(true);

    render(() => (
      <Drawer.Root
        defaultSnapPoint={snapPoints[1]}
        open={open()}
        onOpenChange={setOpen}
        snapPoints={snapPoints}
      >
        <ActiveSnapPointDisplay />
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup>
              Drawer
              <Drawer.Close data-testid="close">Close</Drawer.Close>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    expect(screen.getByTestId('active-snap').textContent).toBe('300px');

    const closeButton = screen.getByTestId('close');
    fireEvent.click(closeButton);

    expect(screen.getByTestId('active-snap').textContent).toBe('300px');
  });

  it('provides event details when snap point changes', async () => {
    const handleSnapPointChange = vi.fn();
    const snapPoints = ['100px', '300px', 1];
    const [open, setOpen] = createSignal(true);
    const [snapPoint, setSnapPoint] = createSignal<Drawer.Root.SnapPoint | null>(snapPoints[2]);

    render(() => (
      <Drawer.Root
        open={open()}
        onOpenChange={setOpen}
        snapPoints={snapPoints}
        snapPoint={snapPoint()}
        onSnapPointChange={(nextSnapPoint, eventDetails) => {
          setSnapPoint(nextSnapPoint);
          handleSnapPointChange(nextSnapPoint, eventDetails);
        }}
      >
        <Drawer.Portal>
          <Drawer.Viewport>
            <Drawer.Popup>
              Drawer
              <Drawer.Close data-testid="close">Close</Drawer.Close>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    ));

    fireEvent.click(screen.getByTestId('close'));

    expect(handleSnapPointChange).toHaveBeenCalled();
    const [, eventDetails] = handleSnapPointChange.mock.calls[0];
    expect(eventDetails.reason).toBe(REASONS.closePress);
  });

  it('does not reset snap point when a close is canceled', async () => {
    const snapPoints = ['100px', '300px', 1];
    const [open, setOpen] = createSignal(true);
    const [snapPoint, setSnapPoint] = createSignal<Drawer.Root.SnapPoint | null>(snapPoints[2]);

    render(() => (
      <div>
        <div data-testid="active-snap">{String(snapPoint())}</div>
        <Drawer.Root
          open={open()}
          onOpenChange={(nextOpen, eventDetails) => {
            if (!nextOpen) {
              eventDetails.cancel();
            } else {
              setOpen(nextOpen);
            }
          }}
          snapPoints={snapPoints}
          snapPoint={snapPoint()}
          onSnapPointChange={setSnapPoint}
        >
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup>
                Drawer
                <Drawer.Close data-testid="close">Close</Drawer.Close>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    ));

    expect(screen.getByTestId('active-snap').textContent).toBe('1');

    fireEvent.click(screen.getByTestId('close'));

    expect(screen.getByTestId('active-snap').textContent).toBe('1');
  });

  it('closes when CloseWatcher emits a close event', async () => {
    const handleOpenChange = vi.fn();

    class CloseWatcherStub extends EventTarget {
      static instances: CloseWatcherStub[] = [];

      onclose: ((this: CloseWatcherStub, ev: Event) => void) | null = null;

      oncancel: ((this: CloseWatcherStub, ev: Event) => void) | null = null;

      destroy = vi.fn();

      close = vi.fn();

      requestClose = vi.fn();

      constructor() {
        super();
        CloseWatcherStub.instances.push(this);
      }
    }

    const originalCloseWatcher = (window as Window & { CloseWatcher?: unknown | undefined })
      .CloseWatcher;
    (window as Window & { CloseWatcher?: typeof CloseWatcherStub | undefined }).CloseWatcher =
      CloseWatcherStub;

    // `platform.os.android` is forced to `true` for the whole file via the `vi.mock` above (CloseWatcher
    // is Android-only), matching upstream's equivalent module mock.
    try {
      render(() => (
        <Drawer.Root defaultOpen onOpenChange={handleOpenChange}>
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup>Drawer</Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      ));

      const instance = CloseWatcherStub.instances[CloseWatcherStub.instances.length - 1];
      expect(instance).not.toBeUndefined();

      instance.dispatchEvent(new Event('close'));

      expect(handleOpenChange).toHaveBeenCalled();
      const lastCall = handleOpenChange.mock.calls[handleOpenChange.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(false);
      expect(lastCall?.[1]?.reason).toBe(REASONS.closeWatcher);
    } finally {
      (window as Window & { CloseWatcher?: unknown | undefined }).CloseWatcher =
        originalCloseWatcher;
    }
  });
});
