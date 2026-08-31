/**
 * Todos server bindings: SQL for the query, authoritative handlers for the
 * mutations. Handlers must mirror the optimistic handlers in todos.sync.ts.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';
import {
  addTodo,
  deleteTodo,
  deleteTodos,
  restoreTodos,
  todoList,
  toggleTodo
} from './todos.sync';

/**
 * Schema + seed rows for the demo server's fresh SQLite database (the default
 * backend). `done` is an `integer` boolean (SQLite has no boolean type; the
 * backend coerces 0/1 back to real booleans at its read seam), `position` a
 * `real`.
 */
export const TODOS_SCHEMA = {
  create: [
    `create table todos (
       id text primary key,
       text text not null,
       done integer not null default 0,
       position real not null default 0)`
  ],
  seed: [
    `insert into todos values
       ('todo_0190b62e-0000-7000-8000-000000000001', 'Cut the connection — this list keeps working', 0, 0),
       ('todo_0190b62e-0000-7000-8000-000000000002', 'Add a todo while offline — watch it queue', 0, 1),
       ('todo_0190b62e-0000-7000-8000-000000000003', 'Reload while offline — cache hydrates instantly', 0, 2)`
  ]
};

export const todoListServer = serveQuery({
  query: todoList,
  sql: () => sql`select id, text, done, position from todos order by position`
});

export const addTodoServer = serveMutation({
  mutation: addTodo,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into todos (id, text, done, position)
                 values (${ctx.newId('todo')}, ${args.text}, 0,
                         (select coalesce(max(position), -1) + 1 from todos))`;
  }
});

export const toggleTodoServer = serveMutation({
  mutation: toggleTodo,
  handler: async (tx, args) => {
    await tx.sql`update todos set done = not done where id = ${args.todoId}`;
  }
});

export const deleteTodoServer = serveMutation({
  mutation: deleteTodo,
  handler: async (tx, args) => {
    await tx.sql`delete from todos where id = ${args.todoId}`;
  }
});

export const deleteTodosServer = serveMutation({
  mutation: deleteTodos,
  handler: async (tx, args) => {
    for (const todoId of args.todoIds) {
      await tx.sql`delete from todos where id = ${todoId}`;
    }
  }
});

export const restoreTodosServer = serveMutation({
  mutation: restoreTodos,
  handler: async (tx, args) => {
    for (const row of args.rows) {
      await tx.sql`
        insert or replace into todos (id, text, done, position)
        values (${row.id}, ${row.text}, ${row.done}, ${row.position})
      `;
    }
  }
});
