/**
 * Server bindings for the sample todo module. Executed in-process by the
 * Tier 3 World engine — same code a real deployment would hand to the server.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';

import { addTodo, todoList, toggleTodo } from './todos.sync';

export const todoServers = {
  todoListServer: serveQuery({
    query: todoList,
    sql: () => sql`select id, title, done, position from todos order by position`,
    rerunOn: ['todos']
  }),
  addTodoServer: serveMutation({
    mutation: addTodo,
    handler: async (tx, args, ctx) => {
      await tx.sql`insert into todos (id, title, done, position)
                   values (${ctx.newId('todo')}, ${args.title}, false,
                           (select coalesce(max(position), -1) + 1 from todos))`;
    }
  }),
  toggleTodoServer: serveMutation({
    mutation: toggleTodo,
    handler: async (tx, args) => {
      await tx.sql`update todos set done = not done where id = ${args.todoId}`;
    }
  })
};
