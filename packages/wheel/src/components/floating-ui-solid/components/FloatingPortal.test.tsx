// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createSignal } from 'solid-js';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { useFloating } from '../hooks/useFloating';
import { FloatingPortal, usePortalContext } from './FloatingPortal';

// `globals: false` in vitest.config.mts means `@solidjs/testing-library`'s
// own `afterEach(cleanup)` registration (gated on a global `afterEach`
// existing at import time) never runs, so tests that portal content into
// `document.body` must clean up explicitly or leak DOM across tests in this
// file.
afterEach(cleanup);

describe('FloatingPortal', () => {
  it('renders floating content into document.body by default', () => {
    function App() {
      const [open, setOpen] = createSignal(true);
      const floating = useFloating({ open, onOpenChange: setOpen });
      return (
        <FloatingPortal>
          <div ref={floating.refs.setFloating} data-testid="floating">
            floating
          </div>
        </FloatingPortal>
      );
    }

    render(() => <App />);

    // Note: Solid's `<Portal>` (unlike React's `createPortal`) always
    // inserts its own wrapper `<div>` around the portalled content, so the
    // DOM nests an extra level deeper than upstream's React output. What
    // matters behaviorally is containment, and that a `data-base-ui-portal`
    // ancestor exists.
    const floatingEl = screen.getByTestId('floating');
    const portalDiv = floatingEl.closest('[data-base-ui-portal]');
    expect(portalDiv).not.toBeNull();
    expect(document.body.contains(portalDiv)).toBe(true);
    expect(document.body.contains(floatingEl)).toBe(true);
  });

  it('renders into a custom container element', () => {
    const customRoot = document.createElement('div');
    document.body.appendChild(customRoot);

    function App() {
      return (
        <FloatingPortal container={() => customRoot}>
          <div data-testid="floating">floating</div>
        </FloatingPortal>
      );
    }

    render(() => <App />);

    const floatingEl = screen.getByTestId('floating');
    expect(customRoot.contains(floatingEl)).toBe(true);

    customRoot.remove();
  });

  it('forwards class and data-* attributes to the portal wrapper div', () => {
    render(() => (
      <FloatingPortal class="my-portal" data-testid="portal-element">
        <div>content</div>
      </FloatingPortal>
    ));

    const portal = screen.getByTestId('portal-element');
    expect(portal.className).toBe('my-portal');
    expect(portal.hasAttribute('data-base-ui-portal')).toBe(true);
  });

  it('removes the portal wrapper from the DOM on unmount', () => {
    const { unmount } = render(() => (
      <FloatingPortal>
        <div data-testid="floating">floating</div>
      </FloatingPortal>
    ));

    const floatingEl = screen.getByTestId('floating');
    const wrapper = floatingEl.parentElement!;
    expect(document.body.contains(wrapper)).toBe(true);

    unmount();

    expect(document.body.contains(wrapper)).toBe(false);
  });

  it('exposes the wrapper div through usePortalContext for descendants', () => {
    let portalNodeId: string | undefined | null;

    function Consumer() {
      const portalContext = usePortalContext();
      portalNodeId = portalContext?.portalNode()?.id;
      return <div data-testid="floating">floating</div>;
    }

    render(() => (
      <FloatingPortal>
        <Consumer />
      </FloatingPortal>
    ));

    expect(portalNodeId).toBeDefined();
    expect(screen.getByTestId('floating').closest('[data-base-ui-portal]')?.id).toBe(portalNodeId);
  });

  it('renders focus guards once a non-modal, open focus-manager state is set', () => {
    function FocusManagerSimulator() {
      const portalContext = usePortalContext();
      portalContext?.setFocusManagerState({
        modal: false,
        open: true,
        onOpenChange: () => {},
        domReference: null,
        closeOnFocusOut: false,
      });
      return <div data-testid="floating">floating</div>;
    }

    render(() => (
      <FloatingPortal>
        <FocusManagerSimulator />
      </FloatingPortal>
    ));

    const guards = document.querySelectorAll('[data-base-ui-focus-guard]');
    expect(guards.length).toBe(2);
  });

  it('does not render focus guards when the focus-manager state is modal', () => {
    function FocusManagerSimulator() {
      const portalContext = usePortalContext();
      portalContext?.setFocusManagerState({
        modal: true,
        open: true,
        onOpenChange: () => {},
        domReference: null,
        closeOnFocusOut: false,
      });
      return <div data-testid="floating">floating</div>;
    }

    render(() => (
      <FloatingPortal>
        <FocusManagerSimulator />
      </FloatingPortal>
    ));

    const guards = document.querySelectorAll('[data-base-ui-focus-guard]');
    expect(guards.length).toBe(0);
  });
});
