// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@solidjs/testing-library';
import { useFloating } from './useFloating';
import { useClientPoint, type UseClientPointProps } from './useClientPoint';

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('useClientPoint', () => {
  it('returns the same handler bag for `reference` and `trigger`', () => {
    let clientPoint: ReturnType<typeof useClientPoint> | undefined;

    function Harness() {
      const floating = useFloating({ open: () => false });
      clientPoint = useClientPoint(floating.context);
      return null;
    }

    render(() => <Harness />);

    expect(clientPoint!.reference).toBe(clientPoint!.trigger);
    expect(typeof clientPoint!.reference?.onMouseMove).toBe('function');
  });

  it('tracks the pointer position on the reference element before opening', async () => {
    let getReferenceRect: (() => DOMRect) | undefined;

    function Harness(props: UseClientPointProps) {
      const floating = useFloating({ open: () => false });
      const clientPoint = useClientPoint(floating.context, props);
      getReferenceRect = () =>
        floating.context.elements.reference()!.getBoundingClientRect() as DOMRect;

      return (
        <button
          data-testid="reference"
          ref={floating.refs.setReference}
          {...clientPoint.reference}
        />
      );
    }

    const { getByTestId } = render(() => <Harness />);
    await flushMicrotasks();

    const reference = getByTestId('reference');
    reference.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 200 }),
    );

    const rect = getReferenceRect!();
    expect(rect.x).toBe(150);
    expect(rect.y).toBe(200);
  });

  it('does not track the pointer when disabled', async () => {
    let getReferenceElement: (() => unknown) | undefined;

    function Harness(props: UseClientPointProps) {
      const floating = useFloating({ open: () => false });
      const clientPoint = useClientPoint(floating.context, props);
      getReferenceElement = () => floating.context.elements.reference();

      return (
        <button
          data-testid="reference"
          ref={floating.refs.setReference}
          {...clientPoint.reference}
        />
      );
    }

    const { getByTestId } = render(() => <Harness enabled={() => false} />);
    await flushMicrotasks();

    const reference = getByTestId('reference');
    reference.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 150, clientY: 200 }),
    );

    // Disabled: the reference element itself stays the position reference
    // (no virtual element tracking the pointer).
    expect(getReferenceElement!()).toBe(reference);
  });

  it('clears the position reference on unmount', async () => {
    let context: ReturnType<typeof useFloating>['context'] | undefined;

    function Harness() {
      const floating = useFloating({ open: () => false });
      context = floating.context;
      const clientPoint = useClientPoint(floating.context);
      return (
        <button
          data-testid="reference"
          ref={floating.refs.setReference}
          {...clientPoint.reference}
        />
      );
    }

    const { getByTestId, unmount } = render(() => <Harness />);
    await flushMicrotasks();

    const reference = getByTestId('reference');
    reference.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 10, clientY: 20 }),
    );

    expect(context!.elements.reference()).not.toBe(reference);

    unmount();

    expect(context!.rootStore.state.positionReference).toBeNull();
  });
});
