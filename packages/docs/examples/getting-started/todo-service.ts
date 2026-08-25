import { SyncService } from 'wheel/sync';

import { addTodo, todoList, toggleTodo } from './todos.sync';

export class TodoService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'TodoService';

  readonly list = this.liveQuery(todoList, {});

  readonly remaining = this.computed(
    () => this.list.rows.filter((todo) => !todo.done).length
  );

  readonly add = (text: string) => this.mutate(addTodo, { text });
  readonly toggle = (todoId: string) =>
    this.mutate(toggleTodo, { todoId });
}
