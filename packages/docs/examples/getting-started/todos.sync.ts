import { mutation, orphan, query, t, table } from 'wheel/sync';

export const TodoRow = t.object({
  id: t.string(),
  text: t.string(),
  done: t.boolean(),
  position: t.number()
});

export const todos = table({
  name: 'todos',
  type: TodoRow,
  key: (row) => row.id
});

export const todoList = query({
  name: 'todos.list',
  params: t.object({}),
  into: todos,
  projection: {
    filter: () => true,
    sort: (left, right) => left.position - right.position
  }
});

export const addTodo = mutation({
  name: 'todos.add',
  args: t.object({ text: t.string() }),
  optimistic: (cache, args, ctx) => {
    const position =
      Math.max(-1, ...cache.list(todos).map((todo) => todo.position)) + 1;
    cache.put(todos, {
      id: ctx.newId('todo'),
      text: args.text,
      done: false,
      position
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
