// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSignal, Show, type JSX } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { REASONS } from '../../internals/reasons';
import {
  FloatingNode,
  FloatingTree,
  useFloatingNodeId,
  useFloatingParentNodeId,
} from '../components/FloatingTree';
import { useFloating } from './useFloating';
import { normalizeProp, useDismiss, type UseDismissProps } from './useDismiss';

// NOTE: this project's vitest config runs with `globals: false`, so
// `@solidjs/testing-library`'s auto-cleanup (`afterEach(cleanup)`, gated on
// `typeof afterEach === 'function'`) never registers, and mounted trees +
// document-level listeners from earlier tests stay live. Every test below
// therefore queries through the `render(...)` return value (scoped to that
// render's container) instead of the global `screen` singleton, matching the
// convention already used elsewhere in this package's tests.

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Minimal reference/floating harness, mirroring upstream's `useDismiss.test.tsx`
 * `App` component (single floating element, no tree).
 */
function App(props: {
  dismissProps?: UseDismissProps;
  onOpenChange?: (open: boolean, details: any) => void;
}) {
  const [open, setOpen] = createSignal(true);
  const floating = useFloating({
    open,
    onOpenChange(nextOpen, details) {
      setOpen(nextOpen);
      props.onOpenChange?.(nextOpen, details);
    },
  });
  // `dismissProps` is a static object per test (never swapped after mount).
  const dismiss = useDismiss(floating.context, props.dismissProps);

  return (
    <>
      <button {...dismiss.reference} ref={floating.refs.setReference} />
      <Show when={open()}>
        <div role="tooltip" {...dismiss.floating} ref={floating.refs.setFloating}>
          <input />
        </div>
      </Show>
    </>
  );
}

/**
 * Nested floating tree harness, mirroring upstream's `Dialog`/`NestedDialog`
 * pair used by the `prop: bubbles` describe block. `FloatingFocusManager`
 * isn't ported yet, so the floating panel is rendered as a plain `div`.
 */
function Dialog(props: {
  testId: string;
  dismissProps?: UseDismissProps;
  children?: JSX.Element;
}) {
  const [open, setOpen] = createSignal(true);
  const nodeId = useFloatingNodeId();
  const floating = useFloating({
    open,
    onOpenChange: (next) => setOpen(next),
    nodeId,
  });
  // `dismissProps` is a static object per test (never swapped after mount).
  const dismiss = useDismiss(floating.context, props.dismissProps);

  return (
    <FloatingNode id={nodeId}>
      <button {...dismiss.reference} ref={floating.refs.setReference} />
      <Show when={open()}>
        <div {...dismiss.floating} ref={floating.refs.setFloating} data-testid={props.testId}>
          {props.children}
        </div>
      </Show>
    </FloatingNode>
  );
}

function NestedDialog(props: {
  testId: string;
  dismissProps?: UseDismissProps;
  children?: JSX.Element;
}) {
  const parentId = useFloatingParentNodeId();

  // `parentId` is resolved once from context at setup and never changes
  // afterward, so branching on it here (rather than a reactive <Show/>) is
  // safe despite Solid's generic "components run once" lint heuristic.
  if (parentId == null) {
    return (
      <FloatingTree>
        <Dialog testId={props.testId} dismissProps={props.dismissProps}>
          {props.children}
        </Dialog>
      </FloatingTree>
    );
  }

  return (
    <Dialog testId={props.testId} dismissProps={props.dismissProps}>
      {props.children}
    </Dialog>
  );
}

describe('useDismiss', () => {
  describe('default options', () => {
    it('dismisses with the escape key, reporting the escapeKey reason', () => {
      const onOpenChange = vi.fn();
      const { getByRole, queryByRole } = render(() => <App onOpenChange={onOpenChange} />);
      expect(getByRole('tooltip')).toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
      expect(onOpenChange).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ reason: REASONS.escapeKey }),
      );
    });

    it('calls preventDefault on the escape keydown event when not canceled', () => {
      render(() => <App />);

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not call preventDefault when the dismissal is canceled', () => {
      function CancelApp() {
        const [open, setOpen] = createSignal(true);
        const floating = useFloating({
          open,
          onOpenChange(_next, details) {
            details.cancel();
            setOpen(true);
          },
        });
        const dismiss = useDismiss(floating.context);

        return (
          <>
            <button {...dismiss.reference} ref={floating.refs.setReference} />
            <Show when={open()}>
              <div role="tooltip" {...dismiss.floating} ref={floating.refs.setFloating} />
            </Show>
          </>
        );
      }

      const { getByRole } = render(() => <CancelApp />);

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('does not dismiss with the escape key while IME composing', async () => {
      const onOpenChange = vi.fn();
      render(() => <App onOpenChange={onOpenChange} />);

      fireEvent.compositionStart(document.body);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.compositionEnd(document.body);

      expect(onOpenChange).not.toHaveBeenCalled();

      // `compositionend` clears the composing flag on a timer tick.
      await wait(10);

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledTimes(1);
    });

    it('dismisses on an outside pointerdown press (sloppy default)', () => {
      const { queryByRole } = render(() => <App />);

      fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('does not dismiss on reference press by default', () => {
      const { getByRole } = render(() => <App />);

      fireEvent.pointerDown(getByRole('button'));

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('dismisses on a reference pointerdown press when referencePress is enabled', () => {
      const { getByRole, queryByRole } = render(() => (
        <App dismissProps={{ referencePress: () => true }} />
      ));

      fireEvent.pointerDown(getByRole('button'));

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('dismisses on a native reference click when referencePress is enabled', () => {
      const { getByRole, queryByRole } = render(() => (
        <App dismissProps={{ referencePress: () => true }} />
      ));

      fireEvent.click(getByRole('button'));

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('options set to false', () => {
    it('does not dismiss with the escape key when escapeKey is false', () => {
      const { getByRole } = render(() => <App dismissProps={{ escapeKey: () => false }} />);

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('does not dismiss on outside press when outsidePress is false', () => {
      const { getByRole } = render(() => <App dismissProps={{ outsidePress: () => false }} />);

      fireEvent.pointerDown(document.body);

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('outsidePress function guard blocks dismissal when it returns false', () => {
      const { getByRole } = render(() => (
        <App dismissProps={{ outsidePress: () => () => false }} />
      ));

      fireEvent.pointerDown(document.body);

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('outsidePress function guard allows dismissal when it returns true', () => {
      const { queryByRole } = render(() => (
        <App dismissProps={{ outsidePress: () => () => true }} />
      ));

      fireEvent.pointerDown(document.body);

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('prop: enabled', () => {
    it('is fully inert (escape, outside press, and reference press all no-op) when false', () => {
      const onOpenChange = vi.fn();
      const { getByRole } = render(() => (
        <App
          dismissProps={{ enabled: () => false, referencePress: () => true }}
          onOpenChange={onOpenChange}
        />
      ));

      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.pointerDown(document.body);
      fireEvent.pointerDown(getByRole('button'));

      expect(getByRole('tooltip')).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('prop: bubbles', () => {
    it('outsidePress bubbles through the floating tree by default', () => {
      const { getByTestId, queryByTestId } = render(() => (
        <NestedDialog testId="outer">
          <NestedDialog testId="inner">
            <button>test button</button>
          </NestedDialog>
        </NestedDialog>
      ));

      expect(getByTestId('outer')).toBeInTheDocument();
      expect(getByTestId('inner')).toBeInTheDocument();

      fireEvent.pointerDown(document.body);

      expect(queryByTestId('outer')).not.toBeInTheDocument();
      expect(queryByTestId('inner')).not.toBeInTheDocument();
    });

    it('outsidePress bubbles: false requires one outside press per nesting level', () => {
      const { getByTestId, queryByTestId } = render(() => (
        <NestedDialog testId="outer" dismissProps={{ bubbles: () => ({ outsidePress: false }) }}>
          <NestedDialog testId="inner" dismissProps={{ bubbles: () => ({ outsidePress: false }) }}>
            <button>test button</button>
          </NestedDialog>
        </NestedDialog>
      ));

      fireEvent.pointerDown(document.body);

      expect(getByTestId('outer')).toBeInTheDocument();
      expect(queryByTestId('inner')).not.toBeInTheDocument();

      fireEvent.pointerDown(document.body);

      expect(queryByTestId('outer')).not.toBeInTheDocument();
      expect(queryByTestId('inner')).not.toBeInTheDocument();
    });

    it('escapeKey does not bubble by default, requiring one Escape per nesting level', () => {
      const { getByTestId, queryByTestId } = render(() => (
        <NestedDialog testId="outer">
          <NestedDialog testId="inner">
            <button>test button</button>
          </NestedDialog>
        </NestedDialog>
      ));

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(getByTestId('outer')).toBeInTheDocument();
      expect(queryByTestId('inner')).not.toBeInTheDocument();

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(queryByTestId('outer')).not.toBeInTheDocument();
    });

    it('escapeKey bubbles: true closes the whole nested tree with a single Escape', () => {
      const { queryByTestId } = render(() => (
        <NestedDialog testId="outer" dismissProps={{ bubbles: () => true }}>
          <NestedDialog testId="inner" dismissProps={{ bubbles: () => true }}>
            <button>test button</button>
          </NestedDialog>
        </NestedDialog>
      ));

      fireEvent.keyDown(document.body, { key: 'Escape' });

      expect(queryByTestId('outer')).not.toBeInTheDocument();
      expect(queryByTestId('inner')).not.toBeInTheDocument();
    });
  });

  describe('outsidePressEvent: intentional', () => {
    it('dragging outside the floating element does not close it', () => {
      const { getByRole } = render(() => (
        <App dismissProps={{ outsidePressEvent: () => 'intentional' }} />
      ));
      const floatingEl = getByRole('tooltip');

      fireEvent.mouseDown(floatingEl);
      fireEvent.mouseUp(document.body);

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('dragging inside the floating element does not close it', () => {
      const { getByRole } = render(() => (
        <App dismissProps={{ outsidePressEvent: () => 'intentional' }} />
      ));
      const floatingEl = getByRole('tooltip');

      fireEvent.mouseDown(document.body);
      fireEvent.mouseUp(floatingEl);

      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('dragging outside then clicking outside eventually closes it', () => {
      const { getByRole, queryByRole } = render(() => (
        <App dismissProps={{ outsidePressEvent: () => 'intentional' }} />
      ));
      const floatingEl = getByRole('tooltip');

      fireEvent.mouseDown(floatingEl);
      fireEvent.mouseUp(document.body);
      // A click event will have fired before the proper outside click.
      fireEvent.click(document.body);
      fireEvent.click(document.body);

      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  describe('normalizeProp', () => {
    it('defaults to { escapeKey: false, outsidePress: true } for undefined/booleans', () => {
      expect(normalizeProp()).toEqual({ escapeKey: false, outsidePress: true });
      expect(normalizeProp(true)).toEqual({ escapeKey: true, outsidePress: true });
      expect(normalizeProp(false)).toEqual({ escapeKey: false, outsidePress: false });
    });

    it('reads individual keys from an object, defaulting missing ones', () => {
      expect(normalizeProp({})).toEqual({ escapeKey: false, outsidePress: true });
      expect(normalizeProp({ escapeKey: true })).toEqual({ escapeKey: true, outsidePress: true });
      expect(normalizeProp({ outsidePress: false })).toEqual({
        escapeKey: false,
        outsidePress: false,
      });
    });
  });
});
