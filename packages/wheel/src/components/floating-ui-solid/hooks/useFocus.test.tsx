// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSignal, Show } from 'solid-js';
import { render } from '@solidjs/testing-library';
import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails';
import { REASONS } from '../../internals/reasons';
import { useFloating } from './useFloating';
import { useFocus, type UseFocusProps } from './useFocus';

interface TestProps extends UseFocusProps {
  initialOpen?: boolean;
  onOpenChange?: (open: boolean, details: unknown) => void;
  onContext?: (context: ReturnType<typeof useFloating>['context']) => void;
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
  // Runs once at setup to hand the context out to the test; not meant to
  // track `props.onContext` reactively.
  props.onContext?.(floating.context);
  const focus = useFocus(floating.context, props);

  return (
    <>
      <button data-testid="reference" ref={floating.refs.setReference} {...focus.reference} />
      <Show when={open()}>
        <div data-testid="floating" tabIndex={-1} ref={floating.refs.setFloating}>
          floating
        </div>
      </Show>
    </>
  );
}

describe('useFocus', () => {
  it('opens on focus', () => {
    const onOpenChange = vi.fn();
    const { getByTestId, queryByTestId } = render(() => <Test onOpenChange={onOpenChange} />);
    const button = getByTestId('reference');

    expect(queryByTestId('floating')).toBeNull();

    button.dispatchEvent(new FocusEvent('focus'));

    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: REASONS.triggerFocus }),
    );
    expect(queryByTestId('floating')).not.toBeNull();
  });

  it('does not open on focus when disabled', () => {
    const onOpenChange = vi.fn();
    const { getByTestId, queryByTestId } = render(() => (
      <Test enabled={() => false} onOpenChange={onOpenChange} />
    ));
    const button = getByTestId('reference');

    button.dispatchEvent(new FocusEvent('focus'));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(queryByTestId('floating')).toBeNull();
  });

  it('delays opening by the configured delay', () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();
      const { getByTestId } = render(() => (
        <Test onOpenChange={onOpenChange} delay={() => 50} />
      ));
      const button = getByTestId('reference');

      button.dispatchEvent(new FocusEvent('focus'));
      expect(onOpenChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(49);
      expect(onOpenChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onOpenChange).toHaveBeenCalledWith(
        true,
        expect.objectContaining({ reason: REASONS.triggerFocus }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes on blur once focus moves to an unrelated element', () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();
      const { getByTestId } = render(() => (
        <Test initialOpen onOpenChange={onOpenChange} />
      ));
      const button = getByTestId('reference');

      button.dispatchEvent(new FocusEvent('blur', { relatedTarget: document.body }));
      vi.advanceTimersByTime(0);

      expect(onOpenChange).toHaveBeenCalledWith(
        false,
        expect.objectContaining({ reason: REASONS.triggerFocus }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays open when blur moves focus into the floating element', () => {
    vi.useFakeTimers();
    try {
      const onOpenChange = vi.fn();
      const { getByTestId } = render(() => (
        <Test initialOpen onOpenChange={onOpenChange} />
      ));
      const button = getByTestId('reference');
      const floatingEl = getByTestId('floating');

      floatingEl.focus();
      button.dispatchEvent(new FocusEvent('blur', { relatedTarget: floatingEl }));
      vi.advanceTimersByTime(0);

      expect(onOpenChange).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks a focus event from reopening right after a triggerPress dismissal, until the reference is unfocused', () => {
    let context!: ReturnType<typeof useFloating>['context'];
    const onOpenChange = vi.fn();

    const { getByTestId } = render(() => (
      <Test initialOpen onOpenChange={onOpenChange} onContext={(c) => (context = c)} />
    ));
    const button = getByTestId('reference');

    // Simulate a dismissal (e.g. Escape or an outside press) closing the popup
    // while the reference still has DOM focus.
    context.onOpenChange(
      false,
      createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click')),
    );
    onOpenChange.mockClear();

    // A focus event firing right after (the reference never actually lost focus)
    // must not reopen it.
    button.dispatchEvent(new FocusEvent('focus'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('clears the focus block on mouseleave, allowing a later focus to reopen', () => {
    let context!: ReturnType<typeof useFloating>['context'];
    const onOpenChange = vi.fn();

    const { getByTestId } = render(() => (
      <Test initialOpen onOpenChange={onOpenChange} onContext={(c) => (context = c)} />
    ));
    const button = getByTestId('reference');

    context.onOpenChange(
      false,
      createChangeEventDetails(REASONS.triggerPress, new MouseEvent('click')),
    );
    onOpenChange.mockClear();

    button.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    button.dispatchEvent(new FocusEvent('focus'));

    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: REASONS.triggerFocus }),
    );
  });

  it('bypasses the delay when refocusing from another registered enabled trigger while already open', () => {
    let context!: ReturnType<typeof useFloating>['context'];
    const onOpenChange = vi.fn();

    const { getByTestId } = render(() => (
      <Test
        initialOpen
        onOpenChange={onOpenChange}
        onContext={(c) => (context = c)}
        delay={() => 50}
      />
    ));
    const button = getByTestId('reference');

    const otherTrigger = document.createElement('button');
    context.rootStore.context.triggerElements.add('other-trigger', otherTrigger);

    button.dispatchEvent(new FocusEvent('focus', { relatedTarget: otherTrigger }));

    // No timers were advanced — the `movedFromOtherEnabledTrigger` + already-open
    // branch opens synchronously rather than scheduling the configured delay.
    expect(onOpenChange).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ reason: REASONS.triggerFocus }),
    );
  });
});
