import { For } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { TodoService } from './todo-service';

export const connectTodoList = connect('TodoList', (context) => {
  const todoService = context.service(TodoService);
  return view(
    {
      rows: () => todoService.list.rows,
      remaining: todoService.remaining
    },
    {
      add: todoService.add,
      toggle: todoService.toggle
    }
  );
});

export function TodoList() {
  const state = connectTodoList({});
  const [draft, setDraft] = useSignal('', 'draft');

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const text = draft().trim();
    if (!text) {
      return;
    }
    state.add(text);
    setDraft('');
  };

  return (
    <section use:componentRoot>
      <form onSubmit={submit}>
        <input
          aria-label="New todo"
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit">Add</button>
      </form>
      <p>{state.remaining} remaining</p>
      <ul>
        <For each={state.rows}>
          {(todo) => (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => state.toggle(todo.id)}
                />
                {todo.text}
              </label>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
