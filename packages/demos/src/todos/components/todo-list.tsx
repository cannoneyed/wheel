/**
 * The todo list: the toolbar (add input + add button + remaining count +
 * clear-completed) and the rows. One connected component; each row is its
 * own connected component (todo-row.tsx). The add input registers its
 * element with TodoService so the `n` shortcut can focus it.
 */
import { For, Show } from 'solid-js';
import Plus from 'lucide-solid/icons/plus';
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { Button, Input } from 'wheel/components';

import { TodoService } from '../services/todo-service';
import { TodoRow } from './todo-row';
import { ClearCompletedButton } from './clear-completed-button';
import styles from './todos.module.css';

const connectTodoList = connect('TodoList', (c) => {
  const todoService = c.service(TodoService);
  return view(
    {
      rows: () => todoService.list.rows,
      status: () => todoService.list.status,
      remaining: todoService.remaining
    },
    {
      add: todoService.add,
      registerAddInput: todoService.registerAddInput
    }
  );
});

/**
 * Toolbar (add + clear-completed) + the rows.
 *
 * `placeholder` exists because two hosts mount this list. The demos app runs a
 * `KeyboardSystem`, so `n` really does focus this input and the default says
 * so. The landing page's live figure does not — one document-level key
 * listener per pane would hijack `n` for anyone reading the page — so it
 * passes copy that does not promise a shortcut it cannot honor.
 */
export function TodoList(props: { placeholder?: string } = {}) {
  const state = connectTodoList({});
  // Draft input text is ephemeral, component-bound state: a named local signal
  // is the sanctioned tool here, not a service.
  const [draft, setDraft] = useSignal('', 'draft');
  const submit = () => {
    const text = draft().trim();
    if (!text) return;
    state.add(text);
    setDraft('');
  };
  return (
    <div use:componentRoot>
      <Show when={state.status.kind === 'loading'}>
        <span class="stale-note">loading… (first boot with no cache and no server waits here)</span>
      </Show>
      <div class={styles.addRow}>
        <Input
          type="text"
          placeholder={props.placeholder ?? 'Add a todo… (press n)'}
          ref={(el) => state.registerAddInput(el)}
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <Button class={styles.iconButton} title="Add todo" onClick={submit}>
          <Plus size={14} />
        </Button>
        <span class={styles.remaining}>{state.remaining} remaining</span>
        <ClearCompletedButton />
      </div>
      <ul class={styles.list}>
        <For each={state.rows}>{(todo) => <TodoRow todo={todo} />}</For>
      </ul>
    </div>
  );
}
