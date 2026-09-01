/** Server bindings for favorites — standard CRUD, actor-owned rows. */
import { rejection, sql } from 'wheel/sync';
import {
  serveMutation,
  serveQuery,
  type ServerMutationCtx,
  type ServerTx
} from 'wheel/sync/server/cloudflare';
import { favoriteAdd, favoriteRemove, favoriteReorder, favoritesMine } from './favorites.sync';

/** DDL for the favorites table. */
export const FAVORITES_DDL = [
  `create table if not exists favorites (
     id text primary key,
     user_id text not null,
     kind text not null,
     target_id text not null,
     position real not null default 0)`,
  `create index if not exists favorites_user_idx on favorites (user_id, position)`
];

/** favorites.mine — manual order. */
export const favoritesMineServer = serveQuery({
  query: favoritesMine,
  sql: (params, principal) =>
    sql`select id, user_id as "userId", kind, target_id as "targetId", position
        from favorites
        where user_id = ${params.userId}
          and ${params.userId} = ${principal.actor.replace(/^user:/, '')}
        order by position, id`
});

async function requireOwner(
  tx: ServerTx,
  favoriteId: string,
  ctx: ServerMutationCtx
): Promise<void> {
  const rows = await tx.sql<{ userId: string }>`
    select user_id as "userId" from favorites where id = ${favoriteId}
  `;
  const owner = rows[0]?.userId;
  if (owner !== undefined && owner !== ctx.actor.replace(/^user:/, '')) {
    throw rejection('forbidden', 'Favorite belongs to another user.');
  }
}

/** favorites.add — upsert (restore path replays). */
export const favoriteAddServer = serveMutation({
  mutation: favoriteAdd,
  handler: async (tx, args, ctx) => {
    await requireOwner(tx, args.favoriteId, ctx);
    await tx.sql`insert into favorites (id, user_id, kind, target_id, position)
                 values (${args.favoriteId}, ${ctx.actor.replace(/^user:/, '')},
                         ${args.kind}, ${args.targetId}, ${args.position})
                 on conflict (id) do update set position = excluded.position`;
  }
});

/** favorites.remove. */
export const favoriteRemoveServer = serveMutation({
  mutation: favoriteRemove,
  handler: async (tx, args, ctx) => {
    await requireOwner(tx, args.favoriteId, ctx);
    await tx.sql`delete from favorites where id = ${args.favoriteId}`;
  }
});

/** favorites.reorder — one fractional write. */
export const favoriteReorderServer = serveMutation({
  mutation: favoriteReorder,
  handler: async (tx, args, ctx) => {
    await requireOwner(tx, args.favoriteId, ctx);
    await tx.sql`update favorites set position = ${args.position} where id = ${args.favoriteId}`;
  }
});
