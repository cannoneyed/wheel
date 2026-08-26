/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { For, type JSX } from 'solid-js';
import { useSignal } from 'wheel/core';
import { Button, Toast } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleToast() {
  return (
    <Toast.Provider>
      <ToastButton />
      <Toast.Portal>
        <Toast.Viewport>
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastButton(): JSX.Element {
  const toastManager = Toast.useToastManager();
  const [count, setCount] = useSignal(0, 'toastCount');

  function createToast() {
    setCount((prev) => prev + 1);
    // Deviation from upstream: Solid signal writes propagate synchronously (unlike React, which
    // defers re-renders), so `count()` here already reflects the post-increment value — no need
    // to add 1 again as upstream does when reading its stale `count` render variable.
    toastManager.add({
      title: `Toast ${count()} created`,
      description: 'This is a toast notification.',
    });
  }

  return (
    <Button data-testid="toast-create" onClick={createToast}>
      Create toast
    </Button>
  );
}

function ToastList(): JSX.Element {
  const { toasts } = Toast.useToastManager();
  return (
    <For each={toasts()}>
      {(toast) => (
        <Toast.Root toast={toast} data-testid="toast-root">
          <Toast.Content>
            <div style={{ display: 'flex', 'flex-direction': 'column', gap: '0.25rem', 'min-width': 0, flex: 1 }}>
              <Toast.Title />
              <Toast.Description />
            </div>
            <Toast.Close>Dismiss</Toast.Close>
          </Toast.Content>
        </Toast.Root>
      )}
    </For>
  );
}
