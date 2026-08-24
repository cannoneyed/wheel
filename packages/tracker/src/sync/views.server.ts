/** Server bindings for saved views — standard CRUD, no server-side logic. */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery } from 'wheel/sync/server/cloudflare';
import { viewCreate, viewDelete, viewsByTeam } from './views.sync';

/** DDL for the views table. */
export const VIEWS_DDL = [
  `create table if not exists views (
     id text primary key,
     team_id text not null,
     name text not null,
     creator_id text not null,
     filters text not null,
     display text not null,
     created_at bigint not null)`,
  `create index if not exists views_team_idx on views (team_id, created_at)`
];

/** views.byTeam — oldest first. */
export const viewsByTeamServer = serveQuery({
  query: viewsByTeam,
  sql: (params) =>
    sql`select id, team_id as "teamId", name, creator_id as "creatorId",
               filters, display, created_at as "createdAt"
        from views where team_id = ${params.teamId}
        order by created_at, id`,
  rerunOn: ['views']
});

/** views.create — upsert (restore path replays). */
export const viewCreateServer = serveMutation({
  mutation: viewCreate,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into views (id, team_id, name, creator_id, filters, display, created_at)
                 values (${args.viewId}, ${args.teamId}, ${args.name},
                         ${ctx.actor.replace(/^user:/, '')}, ${args.filters}, ${args.display},
                         ${args.createdAt ?? ctx.now()})
                 on conflict (id) do update set name = excluded.name,
                   filters = excluded.filters, display = excluded.display`;
  }
});

/** views.delete. */
export const viewDeleteServer = serveMutation({
  mutation: viewDelete,
  handler: async (tx, args) => {
    await tx.sql`delete from views where id = ${args.viewId}`;
  }
});
