/**
 * TodoService — the one door to todo data. All server data flows through the
 * service's liveQuery; components connect to it directly (`state.list.rows`)
 * and read derived counts via connect().
 */
import { SyncService } from 'wheel/sync';

import { addTodo, todoList, toggleTodo } from './todos.sync';

export class TodoService extends SyncService {
  /** The todo subscription — connect directly (`state.list.rows` / `.status`). */
  readonly list = this.liveQuery(todoList, {});

  readonly remaining = this.computed(
    () => this.list.rows.filter((row) => !row.done).length,
    'remaining'
  );

  readonly add = this.action((title: string) => {
    this.mutate(addTodo, { title });
  }, 'add');

  readonly toggle = this.action((todoId: string) => {
    this.mutate(toggleTodo, { todoId });
  }, 'toggle');
}
