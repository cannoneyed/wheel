import { Service } from 'wheel/core';
import { SyncService } from 'wheel/sync';

import { addTodo, todoList, toggleTodo } from '../getting-started/todos.sync';

export class SelectionService extends Service {
  readonly selected = this.atom(new Set<string>(), 'selected');
  readonly count = this.computed(() => this.selected.get().size);

  readonly toggle = this.action((id: string) => {
    this.selected.update((draft) => {
      if (draft.has(id)) {
        draft.delete(id);
      } else {
        draft.add(id);
      }
    });
  });
}

export class TodoService extends SyncService {
  readonly list = this.liveQuery(todoList, {});

  readonly remaining = this.computed(
    () => this.list.rows.filter((todo) => !todo.done).length
  );

  readonly add = (text: string) => this.mutate(addTodo, { text });
  readonly toggle = (todoId: string) =>
    this.mutate(toggleTodo, { todoId });
}
