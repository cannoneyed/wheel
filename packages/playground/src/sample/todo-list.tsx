/**
 * TodoList — the sandboxed component. ONE connection function, declared next
 * to the component, called as the component's first statement.
 */
import { For, type JSX } from 'solid-js';
import { componentRoot, connect } from 'wheel/core';
import { type QueryStatus } from 'wheel/sync';

import { TodoService } from './todo-service';
import type { Todo } from './todos.sync';

export const connectTodoList = connect('TodoList', (c) => {
  const todoService = c.service(TodoService);
  return {
    get rows(): readonly Todo[] {
      return todoService.list.rows;
    },
    get status(): QueryStatus {
      return todoService.list.status;
    },
    get remaining(): number {
      return todoService.remaining();
    },
    add: todoService.add,
    toggle: todoService.toggle
  };
});

export function TodoList(): JSX.Element {
  const state = connectTodoList({});
  let input!: HTMLInputElement;
  const submit = (event: Event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    state.add(title);
    input.value = '';
  };
  return (
    <div use:componentRoot class="todo-list">
      <div class="todo-status">
        {state.status.kind === 'live'
          ? `${state.remaining} remaining`
          : state.status.kind === 'loading'
            ? 'loading…'
            : `error: ${String((state.status as { error: unknown }).error)}`}
      </div>
      <ul class="todo-rows">
        <For each={state.rows}>
          {(todo) => (
            <li>
              <label classList={{ done: todo.done }}>
                <input type="checkbox" checked={todo.done} onChange={() => state.toggle(todo.id)} />
                <span>{todo.title}</span>
              </label>
            </li>
          )}
        </For>
      </ul>
      <form class="todo-add" onSubmit={submit}>
        <input ref={input} placeholder="Add a todo" />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
