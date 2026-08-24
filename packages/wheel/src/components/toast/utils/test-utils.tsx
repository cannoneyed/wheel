/* eslint-disable wheel/require-view-root -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { For, type JSX } from 'solid-js';
import { Toast } from '../index';

/**
 * @internal
 */
export function Button(): JSX.Element {
  const { add } = Toast.useToastManager();
  return (
    <button
      type="button"
      onClick={() => {
        add({
          title: 'title',
          description: 'description',
          actionProps: {
            id: 'action',
            children: 'action',
          },
        });
      }}
    >
      add
    </button>
  );
}

/**
 * @internal
 */
export function List(): JSX.Element {
  const { toasts } = Toast.useToastManager();
  return (
    <For each={toasts()}>
      {(toastItem) => (
        <Toast.Root toast={toastItem} data-testid="root">
          <Toast.Title data-testid="title" />
          <Toast.Description data-testid="description" />
          <Toast.Close aria-label="close-press" />
          <Toast.Action data-testid="action" />
        </Toast.Root>
      )}
    </For>
  );
}
