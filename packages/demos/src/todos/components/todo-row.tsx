/**
 * One todo row: checkbox, text, delete button — with a right-click context
 * menu (todo-context-menu.tsx) attached via the use:contextMenu directive.
 *
 * The checkbox and the delete button are the SHIPPED wheel components, not
 * hand-rolled controls: the demos are the library's shop window, so what runs
 * here is what a consumer gets.
 */
import Check from 'lucide-solid/icons/check';
import Trash2 from 'lucide-solid/icons/trash-2';
import { componentRoot, connect, view } from 'wheel/core';
import { contextMenu } from 'wheel/kit';
import { Button, Checkbox } from 'wheel/components';

import { TodoService, type Todo } from '../services/todo-service';
import { TodoContextMenu } from './todo-context-menu';
import styles from './todos.module.css';

const connectTodoRow = connect('TodoRow', (c) => {
  const todoService = c.service(TodoService);
  return view(
    {},
    {
      toggle: todoService.toggle,
      remove: todoService.remove
    }
  );
});

/** Checkbox + text + delete for a single todo. */
export function TodoRow(props: { todo: Todo }) {
  const state = connectTodoRow(props);
  return (
    <li
      use:componentRoot
      class={styles.row}
      use:contextMenu={{
        id: `todo:${props.todo.id}`,
        menu: () => <TodoContextMenu todoId={props.todo.id} />
      }}
    >
      <Checkbox.Root
        data-wheel-role="done"
        checked={props.todo.done}
        onCheckedChange={() => state.toggle(props.todo.id)}
        aria-label={props.todo.text}
      >
        <Checkbox.Indicator>
          <Check size={12} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <span class={props.todo.done ? `${styles.rowText} ${styles.rowTextDone}` : styles.rowText}>
        {props.todo.text}
      </span>
      <Button
        class={styles.iconButton}
        data-wheel-role="delete"
        title="Delete todo"
        onClick={() => state.remove(props.todo.id)}
      >
        <Trash2 size={14} />
      </Button>
    </li>
  );
}
