// #region mutation
import {
  mutation,
  orphan,
  t,
  type InverseSpec
} from 'wheel/sync';

import { todos } from '../getting-started/todos.sync';

export const renameTodo = mutation({
  name: 'todos.rename',
  args: t.object({ todoId: t.string(), text: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(todos, args.todoId);
    if (!row) {
      throw orphan(`todo ${args.todoId} is gone`);
    }
    cache.update(todos, args.todoId, { text: args.text });
  },
  invert: (reader, args): InverseSpec | null => {
    const row = reader.get(todos, args.todoId);
    return row
      ? {
          mutation: renameTodo,
          args: { todoId: args.todoId, text: row.text }
        }
      : null;
  }
});
// #endregion mutation

// #region patch
import { patchMutation } from 'wheel/sync';

const TodoPatch = t.object({
  text: t.string().optional(),
  done: t.boolean().optional()
});

export const updateTodo = patchMutation({
  name: 'todos.update',
  args: t.object({ todoId: t.string(), patch: TodoPatch }),
  collection: todos,
  id: (args) => args.todoId,
  description: 'edit todo'
});
// #endregion patch

// #region service
import { type ServiceContext } from 'wheel/core';
import { KeyboardService } from 'wheel/kit';
import { SyncService } from 'wheel/sync';

export class UndoService extends SyncService {
         /** Identity that survives minification (see require-service-name). */
         static override serviceName = 'UndoService';

  readonly canUndo = this.clientRead(() => this.client.canUndo());
  readonly canRedo = this.clientRead(() => this.client.canRedo());
  readonly undo = () => void this.client.undo();
  readonly redo = () => void this.client.redo();

  constructor(context: ServiceContext) {
    super(context);
    const keyboard = this.service(KeyboardService);
    this.addCleanup(
      keyboard.register({
        id: 'todos.undo',
        key: 'mod+z',
        run: this.undo,
        when: () => this.canUndo()
      })
    );
    this.addCleanup(
      keyboard.register({
        id: 'todos.redo',
        key: 'shift+mod+z',
        run: this.redo,
        when: () => this.canRedo()
      })
    );
  }
}
// #endregion service
