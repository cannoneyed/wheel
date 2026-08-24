// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { For } from 'solid-js';
import { Toast } from '../index';

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

function simulateSwipe(
  element: HTMLElement,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  releaseTarget: HTMLElement | Document = element,
  releaseType: 'pointerup' | 'pointercancel' = 'pointerup',
) {
  fireEvent.pointerDown(element, {
    clientX: startX,
    clientY: startY,
    button: 0,
    bubbles: true,
    pointerId: 1,
  });

  // Fire an initial move event close to the start to trigger the isFirstPointerMove logic correctly.
  // This simulates the finger moving slightly before the main swipe movement is registered.
  let deltaX = 0;
  if (endX > startX) {
    deltaX = 1;
  } else if (endX < startX) {
    deltaX = -1;
  }

  let deltaY = 0;
  if (endY > startY) {
    deltaY = 1;
  } else if (endY < startY) {
    deltaY = -1;
  }

  fireEvent.pointerMove(element, {
    clientX: startX + deltaX,
    clientY: startY + deltaY,
    bubbles: true,
    pointerId: 1,
  });

  // Fire the main move event to the end position.
  fireEvent.pointerMove(element, {
    clientX: endX,
    clientY: endY,
    bubbles: true,
    pointerId: 1,
  });
  const releaseEvent = {
    clientX: endX,
    clientY: endY,
    bubbles: true,
    pointerId: 1,
  };

  if (releaseType === 'pointercancel') {
    fireEvent.pointerCancel(releaseTarget, releaseEvent);
  } else {
    fireEvent.pointerUp(releaseTarget, releaseEvent);
  }
}

describe('<Toast.Root />', () => {
  // Upstream also runs `describeConformance(<Toast.Root toast={toast} />, ...)`, a React/MUI-only
  // test utility with no Solid equivalent in this repo (see `Button.test.tsx`'s note).

  // Upstream skips this test under jsdom too (requires real layout/ResizeObserver timing).
  it.skip('recalculates height when content mutates (requires a real browser)', () => {});

  // Upstream skips this test under jsdom too (`:focus-visible` matching requires a real browser).
  it.skip('closes when pressing escape (requires a real browser for :focus-visible)', () => {});

  // Upstream skips this entire describe block under jsdom too (swipe gestures rely on real pointer
  // capture / layout timing that jsdom doesn't implement).
  describe.skip('swipe behavior (requires a real browser)', () => {});

  describe('drag behavior regression', () => {
    function DragList() {
      const { toasts } = Toast.useToastManager();
      return (
        <For each={toasts()}>
          {(toastItem) => (
            <Toast.Root toast={toastItem} data-testid="toast-root">
              <Toast.Content data-testid="toast-content">
                <Toast.Title>{toastItem.title}</Toast.Title>
                <Toast.Description>{toastItem.description}</Toast.Description>
              </Toast.Content>
            </Toast.Root>
          )}
        </For>
      );
    }

    function DragButton() {
      const { add } = Toast.useToastManager();
      return (
        <button
          type="button"
          onClick={() => {
            add({ title: 'T', description: 'D' });
          }}
        >
          add toast
        </button>
      );
    }

    it('resets drag state after releasing a far swipe even when the release lands on the document', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <DragList />
          </Toast.Viewport>
          <DragButton />
        </Toast.Provider>
      ));

      fireEvent.click(screen.getByRole('button', { name: 'add toast' }));

      const toastElement = screen.getByTestId('toast-root');

      // Default swipeDirection=['down','right']. Dragging left triggers the damped, opposite-
      // direction path. Release on the document to cover browsers that don't deliver the final
      // pointer event back to the toast root.
      simulateSwipe(toastElement, 300, 100, -5000, 100, document);

      expect(toastElement).not.toHaveAttribute('data-swiping');
      expect(toastElement).not.toHaveAttribute('data-swipe-direction');
      expect(toastElement.style.getPropertyValue('--toast-swipe-movement-x')).toBe('0px');
      expect(toastElement.style.getPropertyValue('--toast-swipe-movement-y')).toBe('0px');
      expect(toastElement.style.transition).toBe('');
      expect(toastElement.style.transform).toBe('');

      simulateSwipe(toastElement, 100, 100, 150, 100);

      await waitFor(() => {
        expect(screen.queryByTestId('toast-root')).toBe(null);
      });
    });

    it('resets drag state after a document pointercancel', async () => {
      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <DragList />
          </Toast.Viewport>
          <DragButton />
        </Toast.Provider>
      ));

      fireEvent.click(screen.getByRole('button', { name: 'add toast' }));

      const toastElement = screen.getByTestId('toast-root');

      simulateSwipe(toastElement, 300, 100, -5000, 100, document, 'pointercancel');

      expect(toastElement).not.toHaveAttribute('data-swiping');
      expect(toastElement).not.toHaveAttribute('data-swipe-direction');
      expect(toastElement.style.getPropertyValue('--toast-swipe-movement-x')).toBe('0px');
      expect(toastElement.style.getPropertyValue('--toast-swipe-movement-y')).toBe('0px');
      expect(toastElement.style.transition).toBe('');
      expect(toastElement.style.transform).toBe('');
    });
  });

  describe('object identity', () => {
    // Regression test for https://github.com/mui/base-ui/issues/3922
    // Toast calculations should use ID-based lookups, not referential equality
    it('works correctly when toast objects are recreated (not referentially equal)', async () => {
      // This component wraps useToastManager and creates NEW toast objects
      // by spreading them. This is a common pattern when users want to
      // add type-safety to the data field or transform toast properties.
      function ToastListWithNewObjects() {
        const { toasts } = Toast.useToastManager();

        // Create a NEW object (breaking referential equality) for each toast. Unlike React's
        // `key={toast.id}` (which preserves component identity across a fresh object on every
        // render), Solid's `<For>` diffs by array *value* identity — so the copy must be made once
        // per stable store item inside the render callback, not via an external `.map()` accessor
        // re-evaluated on every store change (that would recreate every row on every unrelated
        // update and infinite-loop against `Toast.Root`'s own mount-time height recalculation).
        return (
          <For each={toasts()}>
            {(storeToast) => {
              // A `Proxy` wrapper gives a distinct object identity (`!== storeToast`) while every field
              // read still forwards live to the store's own reactive item — reproducing "recreated,
              // not referentially equal, but still live" without freezing the toast's fields at
              // mount time (a plain `{ ...storeToast }` snapshot would never observe the store's own
              // `transitionStatus: 'ending'` update, so `Toast.Root` could never remove itself).
              const toastItem = new Proxy(storeToast, {}) as typeof storeToast;
              return (
                <Toast.Root toast={toastItem} data-testid="toast-root">
                  <Toast.Title>{toastItem.title}</Toast.Title>
                  <Toast.Description>{toastItem.description}</Toast.Description>
                  <Toast.Close data-testid="toast-close">Close</Toast.Close>
                </Toast.Root>
              );
            }}
          </For>
        );
      }

      function AddButton() {
        const { add } = Toast.useToastManager();
        return (
          <button
            type="button"
            onClick={() => {
              add({
                id: 'test-toast',
                title: 'Test Title',
                description: 'Test Description',
              });
            }}
          >
            add toast
          </button>
        );
      }

      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <ToastListWithNewObjects />
          </Toast.Viewport>
          <AddButton />
        </Toast.Provider>
      ));

      fireEvent.click(screen.getByRole('button', { name: 'add toast' }));

      const toastElement = await screen.findByTestId('toast-root');

      // Verify the toast index is correctly calculated (should be 0, not -1)
      // The --toast-index CSS variable is set based on the domIndex calculation
      await waitFor(() => {
        const toastIndex = toastElement.style.getPropertyValue('--toast-index');
        expect(toastIndex).toBe('0');
      });

      // Verify the close button works (which also relies on ID-based lookup)
      fireEvent.click(screen.getByTestId('toast-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('toast-root')).toBe(null);
      });
    });

    it('correctly calculates indices for multiple toasts with recreated objects', async () => {
      function ToastListWithNewObjects() {
        const { toasts } = Toast.useToastManager();

        return (
          <For each={toasts()}>
            {(storeToast) => {
              // A `Proxy` wrapper gives a distinct object identity (`!== storeToast`) while every field
              // read still forwards live to the store's own reactive item — reproducing "recreated,
              // not referentially equal, but still live" without freezing the toast's fields at
              // mount time (a plain `{ ...storeToast }` snapshot would never observe the store's own
              // `transitionStatus: 'ending'` update, so `Toast.Root` could never remove itself).
              const toastItem = new Proxy(storeToast, {}) as typeof storeToast;
              return (
                <Toast.Root toast={toastItem} data-testid={`toast-${toastItem.id}`}>
                  <Toast.Title>{toastItem.title}</Toast.Title>
                </Toast.Root>
              );
            }}
          </For>
        );
      }

      function AddButton() {
        const { add } = Toast.useToastManager();
        return (
          <button
            type="button"
            onClick={() => {
              add({ title: 'Toast 1' });
              add({ title: 'Toast 2' });
              add({ title: 'Toast 3' });
            }}
          >
            add toasts
          </button>
        );
      }

      render(() => (
        <Toast.Provider>
          <Toast.Viewport>
            <ToastListWithNewObjects />
          </Toast.Viewport>
          <AddButton />
        </Toast.Provider>
      ));

      fireEvent.click(screen.getByRole('button', { name: 'add toasts' }));

      const toasts = await screen.findAllByTestId(/^toast-/);
      expect(toasts).toHaveLength(3);

      await waitFor(() => {
        toasts.forEach((toastEl) => {
          const toastIndex = parseInt(toastEl.style.getPropertyValue('--toast-index'), 10);
          expect(toastIndex).toBeGreaterThanOrEqual(0);
        });
      });
    });
  });
});
