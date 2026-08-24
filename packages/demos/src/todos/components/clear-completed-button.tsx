/**
 * "Clear completed" — lives in the todo toolbar (todo-list.tsx) and runs
 * TodoService's confirm-then-clear flow (the exact same path
 * `mod+backspace` triggers). Hidden while nothing is completed.
 */

import { Show, componentRoot, connect, view } from 'wheel/core';

import { TodoService } from '../services/todo-service';
import styles from './todos.module.css';

const connectClearCompletedButton = connect('ClearCompletedButton', (c) => {
  const todoService = c.service(TodoService);
  return view(
    { completedCount: todoService.completedCount },
    { requestClearCompleted: todoService.requestClearCompleted }
  );
});

/** Danger-styled button gating clear-completed behind a confirm dialog. */
export function ClearCompletedButton() {
  const state = connectClearCompletedButton({});
  return (
    <Show when={state.completedCount > 0}>
      <button
        use:componentRoot
        class={styles.clearButton}
        onClick={() => void state.requestClearCompleted()}
      >
        Clear completed ({state.completedCount})
      </button>
    </Show>
  );
}
