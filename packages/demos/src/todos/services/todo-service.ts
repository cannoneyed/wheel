/**
 * The todos feature service: the ONLY place this demo touches synced data.
 * Components read the computeds; the connection layer never declares queries.
 * Shared behavior lives here too: the keyboard shortcuts register in the
 * constructor (paired with addCleanup), and the clear-completed confirm flow
 * is a service member so the button and `mod+backspace` share one code path.
 */
import { type ServiceContext } from 'wheel/core';
import { SyncService, type Infer } from 'wheel/sync';
import { DialogService, KeyboardService } from 'wheel/kit';
import {
  addTodo,
  deleteTodo,
  deleteTodos,
  todoList,
  toggleTodo,
  type TodoRow
} from '../sync/todos.sync';

export type Todo = Infer<typeof TodoRow>;

/** Owns the todo list subscription, every todo mutation, and the demo's shortcuts. */
export class TodoService extends SyncService {
  private readonly dialogService = this.service(DialogService);

  /** The todo list subscription — read `list.rows` / `list.status` directly. */
  readonly list = this.liveQuery(todoList, {});

  // The add input is a live DOM handle, not data. A field tracks writes
  // without freezing the element or making it reactive.
  private readonly addInput = this.field<HTMLInputElement | null>(null);

  constructor(context: ServiceContext) {
    super(context);
    // Shortcuts are shared feature behavior, so they register here — one
    // auditable table (`bindingsFor`), not listeners scattered in components.
    const keyboardService = this.service(KeyboardService);
    this.addCleanup(keyboardService.register({ id: 'todos.focusAddInput', key: 'n', run: () => this.focusAddInput() }));
    this.addCleanup(
      keyboardService.register({
        id: 'todos.clearCompleted',
        key: 'mod+backspace',
        run: () => void this.requestClearCompleted(),
        when: () => this.completedCount() > 0
      })
    );
  }

  /** Derive, don't store: open-todo count can never go stale. */
  readonly remaining = this.computed(() => this.list.rows.filter((todo) => !todo.done).length);
  /** Derived twin of `remaining` — drives the clear-completed surfaces. */
  readonly completedCount = this.computed(() => this.list.rows.filter((todo) => todo.done).length);

  readonly add = (text: string) => this.mutate(addTodo, { text });
  readonly toggle = (todoId: string) => this.mutate(toggleTodo, { todoId });
  readonly remove = (todoId: string) => this.mutate(deleteTodo, { todoId });

  /** Delete every completed todo in one transaction and one undo step. */
  readonly clearCompleted = () => {
    const todoIds = this.list.rows
      .filter((todo) => todo.done)
      .map((todo) => todo.id);
    return todoIds.length === 0
      ? null
      : this.mutate(deleteTodos, { todoIds });
  };

  /** The confirm-then-clear flow shared by the button and `mod+backspace`. */
  readonly requestClearCompleted = async (): Promise<void> => {
    const count = this.completedCount();
    if (count === 0) return;
    const confirmed = await this.dialogService.confirm(
      `Clear ${count} completed todo${count === 1 ? '' : 's'}?`,
      { danger: true, confirmLabel: 'Clear' }
    );
    if (confirmed) this.clearCompleted();
  };

  /** The add input registers its element here so `n` has somewhere to land. */
  readonly registerAddInput = (el: HTMLInputElement | null): void => {
    this.addInput.set(el);
  };

  /** Focus the add input (the `n` shortcut). No-op if it left the document. */
  readonly focusAddInput = (): void => {
    const input = this.addInput.get();
    if (input?.isConnected) input.focus();
  };
}
