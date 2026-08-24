/**
 * The sample sync module the playground sandboxes: one table, one query, two
 * mutations. Same split-file convention as a real feature — server bindings
 * live in todos.server.ts.
 */
import { mutation, query, t, table, type Infer } from 'wheel/sync';

export const TodoRow = t.object({
  id: t.string(),
  title: t.string(),
  done: t.boolean(),
  position: t.number()
});

export type Todo = Infer<typeof TodoRow>;

export const todos = table({ name: 'todos', type: TodoRow, key: (row) => row.id });

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
  args: t.object({ title: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.put(todos, {
      id: ctx.newId('todo'),
      title: args.title,
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
      throw new Error(`todo ${args.todoId} is gone`);
    }
    cache.update(todos, args.todoId, { done: !row.done });
  }
});

export const todoSyncModule = { todos, todoList, addTodo, toggleTodo };
