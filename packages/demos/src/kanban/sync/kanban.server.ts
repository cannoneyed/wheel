/**
 * Kanban server bindings: SQL for the query, authoritative handlers for the
 * mutations. Handlers must mirror the optimistic handlers in kanban.sync.ts.
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server';
import { addCard, cardList, deleteCard, deleteCards, moveCard } from './kanban.sync';

/** Schema + seed rows for the demo server's fresh SQLite database (the default backend); `position` is a `real`. */
export const KANBAN_SCHEMA = {
  create: [
    `create table cards (
       id text primary key,
       title text not null,
       tag text not null,
       column_id text not null,
       position real not null default 0)`
  ],
  seed: [
    `insert into cards values
       ('card_0190b62e-0000-7000-8000-000000000001', 'Sketch the board layout', 'design', 'todo', 0),
       ('card_0190b62e-0000-7000-8000-000000000002', 'Fix drop-position rounding', 'bug', 'todo', 1),
       ('card_0190b62e-0000-7000-8000-000000000003', 'Provision the demo server', 'infra', 'todo', 2),
       ('card_0190b62e-0000-7000-8000-000000000004', 'Polish the sync badge', 'design', 'doing', 0),
       ('card_0190b62e-0000-7000-8000-000000000005', 'Fractional move ordering', 'infra', 'doing', 1),
       ('card_0190b62e-0000-7000-8000-000000000006', 'Bootstrap the cards schema', 'infra', 'done', 0)`
  ]
};

export const cardListServer = serveQuery({
  query: cardList,
  sql: () => sql`select id, title, tag, column_id as "columnId", position from cards order by position`,
  rerunOn: ['cards']
});

export const addCardServer = serveMutation({
  mutation: addCard,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into cards (id, title, tag, column_id, position)
                 values (${ctx.newId('card')}, ${args.title}, ${args.tag}, ${args.columnId},
                         (select coalesce(max(position), -1) + 1 from cards
                           where column_id = ${args.columnId}))`;
  }
});

export const moveCardServer = serveMutation({
  mutation: moveCard,
  handler: async (tx, args) => {
    await tx.sql`update cards set column_id = ${args.columnId}, position = ${args.position}
                 where id = ${args.cardId}`;
  }
});

export const deleteCardServer = serveMutation({
  mutation: deleteCard,
  handler: async (tx, args) => {
    await tx.sql`delete from cards where id = ${args.cardId}`;
  }
});

export const deleteCardsServer = serveMutation({
  mutation: deleteCards,
  handler: async (tx, args) => {
    for (const cardId of args.cardIds) {
      await tx.sql`delete from cards where id = ${cardId}`;
    }
  }
});
