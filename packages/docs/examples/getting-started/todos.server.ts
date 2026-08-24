import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';

import { addTodo, todoList, toggleTodo } from './todos.sync';

export const TODOS_SCHEMA = [
  `create table if not exists todos (
     id text primary key,
     text text not null,
     done integer not null default 0,
     position real not null default 0
   )`
];

export const todoListServer = serveQuery({
  query: todoList,
  sql: () => sql`
    select id, text, done, position
    from todos
    order by position
  `,
  rerunOn: ['todos']
});

export const addTodoServer = serveMutation({
  mutation: addTodo,
  handler: async (tx, args, ctx) => {
    await tx.sql`
      insert into todos (id, text, done, position)
      values (
        ${ctx.newId('todo')},
        ${args.text},
        0,
        (select coalesce(max(position), -1) + 1 from todos)
      )
    `;
  }
});

export const toggleTodoServer = serveMutation({
  mutation: toggleTodo,
  handler: async (tx, args) => {
    await tx.sql`
      update todos
      set done = not done
      where id = ${args.todoId}
    `;
  }
});
