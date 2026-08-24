// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@solidjs/testing-library';
import { createSignal, Show } from 'solid-js';
import { useFloating } from './useFloating';
import {
  useHoverReferenceInteraction,
  type UseHoverReferenceInteractionProps,
} from './useHoverReferenceInteraction';
import { useHoverFloatingInteraction } from './useHoverFloatingInteraction';

function ReferenceOnlyApp(props: UseHoverReferenceInteractionProps) {
  const [open, setOpen] = createSignal(false);
  const { refs, context } = useFloating({
    open,
    onOpenChange(next) {
      setOpen(next);
    },
  });
  const hoverProps = useHoverReferenceInteraction(context, props);

  return (
    <>
      <button role="button" ref={refs.setReference} {...hoverProps()} />
      <Show when={open()}>
        <div role="tooltip" ref={refs.setFloating} />
      </Show>
    </>
  );
}

function ReferenceAndFloatingApp(props: UseHoverReferenceInteractionProps) {
  const [open, setOpen] = createSignal(false);
  const { refs, context } = useFloating({
    open,
    onOpenChange(next) {
      setOpen(next);
    },
  });
  const hoverProps = useHoverReferenceInteraction(context, props);
  useHoverFloatingInteraction(context);

  return (
    <>
      <button role="button" ref={refs.setReference} {...hoverProps()} />
      <Show when={open()}>
        <div role="tooltip" ref={refs.setFloating} />
      </Show>
    </>
  );
}

describe('useHoverReferenceInteraction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined and never opens when disabled', () => {
    const { getByRole, queryByRole } = render(() => <ReferenceOnlyApp enabled={() => false} />);
    fireEvent.mouseEnter(getByRole('button'));
    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on mouseenter when enabled', () => {
    const { getByRole } = render(() => <ReferenceOnlyApp />);
    fireEvent.mouseEnter(getByRole('button'));
    expect(getByRole('tooltip')).toBeInTheDocument();
  });

  it('mouseOnly ignores a touch pointer, so mouseenter does not open', () => {
    const { getByRole, queryByRole } = render(() => <ReferenceOnlyApp mouseOnly={() => true} />);
    const button = getByRole('button');

    // jsdom has no real PointerEvent; the polyfilled constructor won't carry
    // a `pointerType` through its init dict, so it's defined explicitly here
    // (mirrors upstream's manual `Object.defineProperty` workarounds for
    // properties jsdom's event constructors don't propagate).
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'touch', configurable: true });
    fireEvent(button, pointerDown);

    fireEvent.mouseEnter(button);

    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('mouse pointer input still opens when mouseOnly is set', () => {
    const { getByRole } = render(() => <ReferenceOnlyApp mouseOnly={() => true} />);
    const button = getByRole('button');

    const pointerDown = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(pointerDown, 'pointerType', { value: 'mouse', configurable: true });
    fireEvent(button, pointerDown);

    fireEvent.mouseEnter(button);

    expect(getByRole('tooltip')).toBeInTheDocument();
  });

  it('opens after the configured open delay', () => {
    const { getByRole, queryByRole } = render(() => (
      <ReferenceOnlyApp delay={() => ({ open: 300 })} />
    ));
    fireEvent.mouseEnter(getByRole('button'));

    vi.advanceTimersByTime(299);
    expect(queryByRole('tooltip')).not.toBeInTheDocument();

    vi.advanceTimersByTime(1);
    expect(getByRole('tooltip')).toBeInTheDocument();
  });

  it('closes after the configured close delay', () => {
    const { getByRole, queryByRole } = render(() => (
      <ReferenceOnlyApp delay={() => ({ close: 300 })} />
    ));
    const button = getByRole('button');

    fireEvent.mouseEnter(button);
    expect(getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    vi.advanceTimersByTime(299);
    expect(getByRole('tooltip')).toBeInTheDocument();

    vi.advanceTimersByTime(1);
    expect(queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shares state with useHoverFloatingInteraction: moving onto the floating element cancels a pending close', () => {
    const { getByRole } = render(() => (
      <ReferenceAndFloatingApp delay={() => ({ close: 300 })} />
    ));
    const button = getByRole('button');

    fireEvent.mouseEnter(button);
    expect(getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    vi.advanceTimersByTime(150);
    expect(getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseEnter(getByRole('tooltip'));

    vi.advanceTimersByTime(1000);
    expect(getByRole('tooltip')).toBeInTheDocument();
  });
});
