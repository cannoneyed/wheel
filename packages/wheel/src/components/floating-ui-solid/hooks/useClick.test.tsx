// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createSignal, Show } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useFloating } from './useFloating';
import { useClick, type UseClickProps } from './useClick';

function createMouseEvent(
  type: string,
  options: MouseEventInit & { pointerType?: string } = {},
) {
  const { pointerType, ...init } = options;
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  if (pointerType !== undefined) {
    Object.defineProperty(event, 'pointerType', { value: pointerType, configurable: true });
  }
  return event;
}

function pressMouse(element: Element, pointerType = 'mouse') {
  element.dispatchEvent(createMouseEvent('pointerdown', { pointerType }));
  element.dispatchEvent(createMouseEvent('mousedown', { pointerType }));
  element.dispatchEvent(createMouseEvent('click', { pointerType }));
}

interface TestProps extends UseClickProps {
  initialOpen?: boolean;
  onOpenChange?: (open: boolean, details: unknown) => void;
  typeable?: boolean;
}

function Test(props: TestProps) {
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const floating = useFloating({
    open,
    onOpenChange(nextOpen, details) {
      props.onOpenChange?.(nextOpen, details);
      setOpen(nextOpen);
    },
  });
  const click = useClick(floating.context, props);

  return (
    <>
      {props.typeable ? (
        <input data-testid="reference" ref={floating.refs.setReference} {...click.reference} />
      ) : (
        <button data-testid="reference" ref={floating.refs.setReference} {...click.reference} />
      )}
      <Show when={open()}>
        <div role="tooltip" ref={floating.refs.setFloating}>
          floating
        </div>
      </Show>
    </>
  );
}

describe('useClick', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 0;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens and closes on repeated clicks', () => {
    const { getByTestId, queryByRole } = render(() => <Test />);
    const button = getByTestId('reference');

    expect(queryByRole('tooltip')).toBeNull();

    button.dispatchEvent(createMouseEvent('click'));
    expect(queryByRole('tooltip')).not.toBeNull();

    button.dispatchEvent(createMouseEvent('click'));
    expect(queryByRole('tooltip')).toBeNull();
  });

  it('keeps open on repeated clicks when toggle is false', () => {
    const { getByTestId, queryByRole } = render(() => <Test toggle={() => false} />);
    const button = getByTestId('reference');

    button.dispatchEvent(createMouseEvent('click'));
    button.dispatchEvent(createMouseEvent('click'));

    expect(queryByRole('tooltip')).not.toBeNull();
  });

  it('opens from the mousedown event path', () => {
    const { getByTestId, queryByRole } = render(() => <Test event={() => 'mousedown'} />);
    const button = getByTestId('reference');

    pressMouse(button);

    expect(queryByRole('tooltip')).not.toBeNull();
  });

  it('closes from the mousedown event path', () => {
    const { getByTestId, queryByRole } = render(() => (
      <Test event={() => 'mousedown'} initialOpen />
    ));
    const button = getByTestId('reference');

    pressMouse(button);

    expect(queryByRole('tooltip')).toBeNull();
  });

  it('ignores the click event after mousedown when event is mousedown-only', () => {
    const { getByTestId, queryByRole } = render(() => <Test event={() => 'mousedown-only'} />);
    const button = getByTestId('reference');

    pressMouse(button);
    expect(queryByRole('tooltip')).not.toBeNull();

    button.dispatchEvent(createMouseEvent('click'));
    expect(queryByRole('tooltip')).not.toBeNull();
  });

  it('ignores mouse input when ignoreMouse is true', () => {
    const { getByTestId, queryByRole } = render(() => <Test ignoreMouse={() => true} />);
    const button = getByTestId('reference');

    button.dispatchEvent(createMouseEvent('pointerdown', { pointerType: 'mouse' }));
    button.dispatchEvent(createMouseEvent('click', { pointerType: 'mouse' }));

    expect(queryByRole('tooltip')).toBeNull();
  });

  it('delays touch opening when touchOpenDelay is set', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, queryByRole } = render(() => <Test touchOpenDelay={() => 100} />);
      const button = getByTestId('reference');

      button.dispatchEvent(createMouseEvent('pointerdown', { pointerType: 'touch' }));
      button.dispatchEvent(createMouseEvent('click', { pointerType: 'touch' }));

      expect(queryByRole('tooltip')).toBeNull();

      vi.advanceTimersByTime(100);

      expect(queryByRole('tooltip')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not delay touch closing', () => {
    vi.useFakeTimers();
    try {
      const { getByTestId, queryByRole } = render(() => (
        <Test initialOpen touchOpenDelay={() => 100} />
      ));
      const button = getByTestId('reference');

      button.dispatchEvent(createMouseEvent('pointerdown', { pointerType: 'touch' }));
      button.dispatchEvent(createMouseEvent('click', { pointerType: 'touch' }));

      expect(queryByRole('tooltip')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the configured reason', () => {
    const onOpenChange = vi.fn();

    const { getByTestId } = render(() => (
      <Test onOpenChange={onOpenChange} reason={() => REASONS.inputPress} typeable />
    ));

    getByTestId('reference').dispatchEvent(createMouseEvent('click'));

    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: REASONS.inputPress }),
    );
  });

  it('does not open, close, or call onOpenChange when disabled', () => {
    const onOpenChange = vi.fn();
    const { getByTestId, queryByRole } = render(() => (
      <Test enabled={() => false} onOpenChange={onOpenChange} />
    ));
    const button = getByTestId('reference');

    button.dispatchEvent(createMouseEvent('click'));

    expect(queryByRole('tooltip')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('stickIfOpen true keeps a hover-opened popup open on first click', () => {
    let context: ReturnType<typeof useFloating>['context'] | undefined;

    function HoverClickApp() {
      const [open, setOpen] = createSignal(false);
      const floating = useFloating({
        open,
        onOpenChange: setOpen,
      });
      context = floating.context;
      const click = useClick(floating.context, { stickIfOpen: () => true });

      return (
        <>
          <button data-testid="reference" ref={floating.refs.setReference} {...click.reference} />
          <Show when={open()}>
            <div role="tooltip" ref={floating.refs.setFloating} />
          </Show>
        </>
      );
    }

    const { getByTestId, queryByRole } = render(() => <HoverClickApp />);
    const button = getByTestId('reference');

    // Simulate a hover-open (as `useHover` would do) so `dataRef.current.openEvent`
    // is a non-click-like event before the click below.
    context!.onOpenChange(
      true,
      createChangeEventDetails(REASONS.triggerHover, createMouseEvent('mouseover')),
    );

    button.dispatchEvent(createMouseEvent('click'));

    expect(queryByRole('tooltip')).not.toBeNull();
  });

  it('stickIfOpen false closes a hover-opened popup on first click', () => {
    let context: ReturnType<typeof useFloating>['context'] | undefined;

    function HoverClickApp() {
      const [open, setOpen] = createSignal(false);
      const floating = useFloating({
        open,
        onOpenChange: setOpen,
      });
      context = floating.context;
      const click = useClick(floating.context, { stickIfOpen: () => false });

      return (
        <>
          <button data-testid="reference" ref={floating.refs.setReference} {...click.reference} />
          <Show when={open()}>
            <div role="tooltip" ref={floating.refs.setFloating} />
          </Show>
        </>
      );
    }

    const { getByTestId, queryByRole } = render(() => <HoverClickApp />);
    const button = getByTestId('reference');

    context!.onOpenChange(
      true,
      createChangeEventDetails(REASONS.triggerHover, createMouseEvent('mouseover')),
    );

    button.dispatchEvent(createMouseEvent('click'));

    expect(queryByRole('tooltip')).toBeNull();
  });
});
