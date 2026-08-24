// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal, For } from 'solid-js';
import { Toast } from '../index';

const toast = {
  id: 'test',
  title: 'Toast title',
};

// Portal tests render into `document.body`; clean up explicitly since `globals: false` means
// `@solidjs/testing-library`'s automatic `afterEach(cleanup)` never registers (see CONVENTIONS.md).
afterEach(cleanup);

describe('<Toast.Content />', () => {
  // Upstream also runs `describeConformance(<Toast.Content />, ...)`, a React/MUI-only test
  // utility with no Solid equivalent in this repo (see `Button.test.tsx`'s note).
  it('renders as a plain <div> within a toast root', () => {
    render(() => (
      <Toast.Provider>
        <Toast.Viewport>
          <Toast.Root toast={toast}>
            <Toast.Content data-testid="content" />
          </Toast.Root>
        </Toast.Viewport>
      </Toast.Provider>
    ));

    const content = screen.getByTestId('content');
    expect(content.tagName).toBe('DIV');
  });

  function App() {
    const { toasts, add } = Toast.useToastManager();
    const [count, setCount] = createSignal(0);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            const next = count() + 1;
            setCount(next);
            add({ title: `toast-${next}` });
          }}
        >
          add
        </button>
        <Toast.Viewport data-testid="viewport">
          <For each={toasts()}>
            {(toastItem) => (
              <Toast.Root toast={toastItem}>
                <Toast.Content data-testid={`content-${toastItem.title}`}>
                  <Toast.Title />
                </Toast.Content>
              </Toast.Root>
            )}
          </For>
        </Toast.Viewport>
      </>
    );
  }

  it('marks content behind the frontmost toast with data-behind', async () => {
    render(() => (
      <Toast.Provider>
        <App />
      </Toast.Provider>
    ));

    const addButton = screen.getByRole('button', { name: 'add' });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    // The newest toast is at the front; the older one sits behind it.
    expect(screen.getByTestId('content-toast-2')).not.toHaveAttribute('data-behind');
    expect(screen.getByTestId('content-toast-1')).toHaveAttribute('data-behind');
  });

  it('reflects the expanded state when the viewport is hovered', async () => {
    render(() => (
      <Toast.Provider>
        <App />
      </Toast.Provider>
    ));

    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    const content = screen.getByTestId('content-toast-1');
    expect(content).not.toHaveAttribute('data-expanded');

    // Deviation: upstream fires `mouseEnter` (React synthesizes non-bubbling enter/leave semantics
    // on top of native `mouseover`/`mouseout`). Solid's `Toast.Viewport` listens for the underlying
    // bubbling `mouseover`/`mouseout` events directly (native `mouseenter`/`mouseleave` don't bubble
    // — see `ToastViewport.tsx`'s deviation comment), so the test dispatches `mouseOver` instead;
    // since it's fired directly on the viewport (the listener's own element), bubbling doesn't
    // factor in here, only the event *type* matching what's listened for.
    fireEvent.mouseOver(screen.getByTestId('viewport'));
    expect(content).toHaveAttribute('data-expanded');
  });
});
