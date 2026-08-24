// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { useFloating } from './useFloating';
import { useHover, type UseHoverProps } from './useHover';
import { REASONS } from '../../internals/reasons';

function App(props: UseHoverProps & { showReference?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const { refs, context } = useFloating({
    open,
    onOpenChange(next) {
      setOpen(next);
    },
  });
  const hover = useHover(context, props);

  return (
    <>
      <Show when={props.showReference ?? true}>
        <button role="button" ref={refs.setReference} {...hover.reference} />
      </Show>
      <Show when={open()}>
        <div role="tooltip" ref={refs.setFloating} />
      </Show>
    </>
  );
}

describe('useHover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on mouseenter', () => {
    const { getByRole } = render(() => <App />);
    fireEvent.mouseEnter(getByRole('button'));
    expect(getByRole('tooltip')).toBeInTheDocument();
  });

  it('closes on mouseleave', () => {
    const { getByRole, queryByRole } = render(() => <App />);
    fireEvent.mouseEnter(getByRole('button'));
    fireEvent.mouseLeave(getByRole('button'));
    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });

  describe('prop: delay', () => {
    it('symmetric number delays the open', () => {
      const { getByRole, queryByRole } = render(() => <App delay={() => 1000} />);
      fireEvent.mouseEnter(getByRole('button'));

      vi.advanceTimersByTime(999);
      expect(queryByRole('tooltip')).not.toBeInTheDocument();

      vi.advanceTimersByTime(1);
      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('open-only delay', () => {
      const { getByRole, queryByRole } = render(() => <App delay={() => ({ open: 500 })} />);
      fireEvent.mouseEnter(getByRole('button'));

      vi.advanceTimersByTime(499);
      expect(queryByRole('tooltip')).not.toBeInTheDocument();

      vi.advanceTimersByTime(1);
      expect(getByRole('tooltip')).toBeInTheDocument();
    });

    it('close-only delay', () => {
      const { getByRole, queryByRole } = render(() => <App delay={() => ({ close: 500 })} />);
      fireEvent.mouseEnter(getByRole('button'));
      fireEvent.mouseLeave(getByRole('button'));

      vi.advanceTimersByTime(499);
      expect(getByRole('tooltip')).toBeInTheDocument();

      vi.advanceTimersByTime(1);
      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('open delay with close 0 cancels a pending open on leave', () => {
      const { getByRole, queryByRole } = render(() => <App delay={() => ({ open: 500 })} />);
      fireEvent.mouseEnter(getByRole('button'));

      vi.advanceTimersByTime(499);
      fireEvent.mouseLeave(getByRole('button'));

      vi.advanceTimersByTime(1);
      expect(queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  it('restMs opens only after the cursor rests', () => {
    const { getByRole, queryByRole } = render(() => <App restMs={() => 100} />);
    const button = getByRole('button');

    const originalDispatchEvent = button.dispatchEvent.bind(button);
    const spy = vi.spyOn(button, 'dispatchEvent').mockImplementation((event) => {
      Object.defineProperty(event, 'movementX', { value: 10, configurable: true });
      Object.defineProperty(event, 'movementY', { value: 10, configurable: true });
      return originalDispatchEvent(event);
    });

    fireEvent.mouseMove(button);
    vi.advanceTimersByTime(99);
    expect(queryByRole('tooltip')).not.toBeInTheDocument();

    // Movement resets the pending rest timer.
    fireEvent.mouseMove(button);
    vi.advanceTimersByTime(1);
    expect(queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.mouseMove(button);
    vi.advanceTimersByTime(100);
    expect(getByRole('tooltip')).toBeInTheDocument();

    spy.mockRestore();
  });

  it('mouseenter on the floating element cancels a pending close (stays open)', () => {
    const { getByRole } = render(() => <App delay={() => ({ close: 500 })} />);
    const button = getByRole('button');

    fireEvent.mouseEnter(button);
    expect(getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    vi.advanceTimersByTime(200);
    expect(getByRole('tooltip')).toBeInTheDocument();

    // Moving onto the floating element clears the scheduled close.
    fireEvent.mouseEnter(getByRole('tooltip'));

    vi.advanceTimersByTime(1000);
    expect(getByRole('tooltip')).toBeInTheDocument();
  });

  it('mouseleave on the reference with the floating element as relatedTarget closes immediately without a handleClose handler', () => {
    const { getByRole, queryByRole } = render(() => <App />);
    fireEvent.mouseEnter(getByRole('button'));

    fireEvent(
      getByRole('button'),
      new MouseEvent('mouseleave', {
        relatedTarget: getByRole('tooltip'),
      }),
    );

    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('reports REASONS.triggerHover as the open-change reason', () => {
    const reasons: Array<string | undefined> = [];

    function ReasonApp() {
      const [isOpen, setIsOpen] = createSignal(false);
      const { refs, context } = useFloating({
        open: isOpen,
        onOpenChange(next, details) {
          reasons.push(details?.reason);
          setIsOpen(next);
        },
      });
      const hover = useHover(context);

      return (
        <>
          <button role="button" ref={refs.setReference} {...hover.reference} />
          <Show when={isOpen()}>
            <div role="tooltip" ref={refs.setFloating} />
          </Show>
        </>
      );
    }

    const { getByRole } = render(() => <ReasonApp />);
    fireEvent.mouseEnter(getByRole('button'));
    fireEvent.mouseLeave(getByRole('button'));

    expect(reasons).toEqual([REASONS.triggerHover, REASONS.triggerHover]);
  });
});
