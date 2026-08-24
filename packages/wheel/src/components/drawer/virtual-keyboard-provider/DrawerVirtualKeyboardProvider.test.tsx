// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { Drawer } from '../index';

afterEach(cleanup);

describe('<Drawer.VirtualKeyboardProvider />', () => {
  // Upstream's entire test suite for this component is gated `it.skipIf(isJSDOM)` — every case
  // depends on real `visualViewport` dimensions, `getBoundingClientRect()` layout, and/or real
  // touch-point hit-testing (tap-vs-scroll disambiguation, keyboard inset measurement, scroll
  // slack) that jsdom doesn't provide. None of it is portable to a jsdom-only run, so this port
  // only smoke-tests that the provider renders its children and doesn't throw when no real
  // `visualViewport`/layout is present (the SSR-safety and "no `Drawer.Viewport` mounted yet"
  // paths, which are exercised by every other jsdom test in this port that also uses
  // `Drawer.VirtualKeyboardProvider` transitively via `Drawer.Root` + `Drawer.Viewport`).

  it('renders its children without throwing when no real layout/visualViewport is available', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.VirtualKeyboardProvider>
          <Drawer.Portal>
            <Drawer.Viewport>
              <Drawer.Popup data-testid="popup">
                <input data-testid="input" />
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.VirtualKeyboardProvider>
      </Drawer.Root>
    ));

    expect(screen.getByTestId('popup')).toBeInTheDocument();
    expect(screen.getByTestId('input')).toBeInTheDocument();
  });

  it('does not throw when mounted without a Drawer.Viewport', async () => {
    render(() => (
      <Drawer.Root open>
        <Drawer.VirtualKeyboardProvider>
          <div data-testid="content">No viewport here</div>
        </Drawer.VirtualKeyboardProvider>
      </Drawer.Root>
    ));

    expect(screen.getByTestId('content')).toBeInTheDocument();
  });
});
