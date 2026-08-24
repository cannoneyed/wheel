/**
 * The todo row's context menu — an ORDINARY connected component ("globally
 * rendered, locally connected"): declared at the row, portaled by
 * ContextMenuSystem, fed by props. Per-instance connect name so each open
 * menu is auditable in the registry.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { ContextMenuService } from 'wheel/kit';

import { TodoService } from '../services/todo-service';
import styles from './todos.module.css';

const connectTodoContextMenu = connect(
  (props: { todoId: string }) => `contextMenu:todo:${props.todoId}`,
  (c, props) => {
    const todoService = c.service(TodoService);
    const contextMenuService = c.service(ContextMenuService);
    return view(
      {
        todo: () => todoService.list.rows.find((row) => row.id === props.todoId)
      },
      {
        toggle: () => void todoService.toggle(props.todoId),
        remove: () => void todoService.remove(props.todoId),
        close: contextMenuService.close
      }
    );
  }
);

/** Menu content for one todo: toggle done + delete. */
export function TodoContextMenu(props: { todoId: string }) {
  const state = connectTodoContextMenu(props);
  return (
    <div use:componentRoot class={styles.menu}>
      <Show when={state.todo}>
        {(todo) => (
          <button
            class={styles.menuItem}
            onClick={() => {
              state.toggle();
              state.close();
            }}
          >
            {todo().done ? 'Mark as not done' : 'Mark as done'}
          </button>
        )}
      </Show>
      <button
        class={`${styles.menuItem} ${styles.menuItemDanger}`}
        onClick={() => {
          state.remove();
          state.close();
        }}
      >
        Delete todo
      </button>
    </div>
  );
}
