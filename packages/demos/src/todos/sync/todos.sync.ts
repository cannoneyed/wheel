/**
 * Todos sync module: the shared client/server contract. Both sides compile
 * against these declarations; the optimistic handlers here must mirror the
 * server handlers in todos.server.ts (same writes, same id order).
 */
import {
  mutation,
  orphan,
  query,
  t,
  collection,
  type Infer,
  type InverseSpec,
  type MutationDecl
} from 'wheel/sync';

/** One todo row as it lives in SQLite and in every client cache. */
export const TodoRow = t.object({
  id: t.string(),
  text: t.string(),
  done: t.boolean(),
  position: t.number()
});

export const todos = collection({ name: 'todos', type: TodoRow, key: (row) => row.id });

/** All todos, server-ordered by position. */
export const todoList = query({
  name: 'todos.list',
  params: t.object({}),
  into: todos,
  projection: {
    filter: () => true,
    sort: (a, b) => a.position - b.position
  }
});

export const addTodo = mutation({
  name: 'todos.add',
  args: t.object({ text: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.put(todos, {
      id: ctx.newId('todo'),
      text: args.text,
      done: false,
      position: cache.list(todos).length
    });
  }
});

export const toggleTodo = mutation({
  name: 'todos.toggle',
  args: t.object({ todoId: t.string() }),
  optimistic: (cache, args) => {
    const row = cache.get(todos, args.todoId);
    if (!row) {
      throw orphan(`todo ${args.todoId} is gone`);
    }
    cache.update(todos, args.todoId, { done: !row.done });
  }
});

export const deleteTodo = mutation({
  name: 'todos.delete',
  args: t.object({ todoId: t.string() }),
  optimistic: (cache, args) => {
    cache.delete(todos, args.todoId);
  }
});

const RestoreTodosArgs = t.object({ rows: t.array(TodoRow) });
type RestoreTodosArgs = Infer<typeof RestoreTodosArgs>;
const DeleteTodosArgs = t.object({ todoIds: t.array(t.string()) });
type DeleteTodosArgs = Infer<typeof DeleteTodosArgs>;

/** Restore an exact row set; used as the atomic inverse of `todos.deleteMany`. */
export const restoreTodos: MutationDecl<RestoreTodosArgs> = mutation({
  name: 'todos.restoreMany',
  args: RestoreTodosArgs,
  optimistic: (cache, args) => {
    for (const row of args.rows) {
      cache.put(todos, row);
    }
  },
  invert: (_reader, args): InverseSpec | null =>
    args.rows.length === 0
      ? null
      : {
          mutation: deleteTodos,
          args: { todoIds: args.rows.map((row) => row.id) },
          description: 'clear completed todos'
        }
});

/** Delete an exact row set in one mutation and one undo step. */
export const deleteTodos: MutationDecl<DeleteTodosArgs> = mutation({
  name: 'todos.deleteMany',
  args: DeleteTodosArgs,
  optimistic: (cache, args) => {
    for (const todoId of args.todoIds) {
      cache.delete(todos, todoId);
    }
  },
  invert: (reader, args): InverseSpec | null => {
    const rows = args.todoIds.flatMap((todoId) => {
      const row = reader.get(todos, todoId);
      return row ? [row] : [];
    });
    return rows.length === 0
      ? null
      : {
          mutation: restoreTodos,
          args: { rows },
          description: 'clear completed todos'
        };
  }
});
