import { rejection, sql } from 'wheel/sync';
import { serveMutation, serveQuery, type ServerTx } from 'wheel/sync/server/cloudflare';

import {
  channelCreate,
  channelJoin,
  channelsForMember,
  membersAll,
  messageDelete,
  messageEdit,
  messageSend,
  messagesByChannel,
  readsForMember,
  readsMark,
  unreadForMember
} from './spoke.sync';

/** Spoke's physical schema. One database holds one workspace. */
export const SPOKE_DDL = [
  `create table if not exists members (
     id text primary key,
     name text not null)`,
  `create table if not exists channels (
     id text primary key,
     name text not null,
     is_private integer not null,
     created_at integer not null)`,
  `create table if not exists channel_members (
     channel_id text not null,
     member_id text not null,
     primary key (channel_id, member_id))`,
  `create table if not exists messages (
     id text primary key,
     channel_id text not null,
     author_id text not null,
     body text not null,
     created_at integer not null,
     edited_at integer)`,
  `create table if not exists channel_reads (
     channel_id text not null,
     member_id text not null,
     last_read_at integer not null,
     primary key (channel_id, member_id))`
] as const;

const actorMember = (actor: string): string => actor.replace(/^user:/, '');

async function requireMember(tx: ServerTx, channelId: string, actor: string): Promise<string> {
  const memberId = actorMember(actor);
  const rows = await tx.sql<{ readonly allowed: number }>`
    select count(*) as allowed from channel_members
    where channel_id = ${channelId} and member_id = ${memberId}`;
  if (rows[0]?.allowed !== 1) throw rejection('forbidden', 'This channel is not visible to you.');
  return memberId;
}

async function requireAuthor(tx: ServerTx, messageId: string, actor: string): Promise<void> {
  const rows = await tx.sql<{ readonly channelId: string; readonly authorId: string }>`
    select channel_id as "channelId", author_id as "authorId" from messages where id = ${messageId}`;
  const row = rows[0];
  if (!row) throw rejection('missing_message', 'The message no longer exists.');
  const memberId = await requireMember(tx, row.channelId, actor);
  if (row.authorId !== memberId) throw rejection('forbidden', 'Only the author can change this message.');
}

export const membersAllServer = serveQuery({
  query: membersAll,
  sql: () => sql`select id, name from members order by name, id`
});

export const channelsForMemberServer = serveQuery({
  query: channelsForMember,
  sql: (_params, principal) => sql`
    select c.id, c.name, c.is_private as private, c.created_at as "createdAt"
    from channels c join channel_members cm on cm.channel_id = c.id
    where cm.member_id = ${actorMember(principal.actor)}
    order by c.name, c.id`
});

export const messagesByChannelServer = serveQuery({
  query: messagesByChannel,
  sql: (params, principal) => sql`
    select m.id, m.channel_id as "channelId", m.author_id as "authorId", m.body,
           m.created_at as "createdAt", m.edited_at as "editedAt"
    from messages m
    where m.channel_id = ${params.channelId}
      and exists (
        select 1 from channel_members cm
        where cm.channel_id = m.channel_id and cm.member_id = ${actorMember(principal.actor)})
    order by m.created_at, m.id
    limit ${Math.min(100, Math.max(1, Math.trunc(params.limit)))}`
});

export const readsForMemberServer = serveQuery({
  query: readsForMember,
  sql: (_params, principal) => sql`
    select channel_id || ':' || member_id as id, channel_id as "channelId",
           member_id as "memberId", last_read_at as "lastReadAt"
    from channel_reads where member_id = ${actorMember(principal.actor)} order by channel_id`
});

export const unreadForMemberServer = serveQuery({
  query: unreadForMember,
  sql: (_params, principal) => {
    const memberId = actorMember(principal.actor);
    return sql`
      select c.id || ':' || ${memberId} as id, c.id as "channelId", ${memberId} as "memberId",
             count(m.id) as count
      from channels c
      join channel_members cm on cm.channel_id = c.id and cm.member_id = ${memberId}
      left join channel_reads r on r.channel_id = c.id and r.member_id = ${memberId}
      left join messages m on m.channel_id = c.id and m.author_id <> ${memberId}
                           and m.created_at > coalesce(r.last_read_at, 0)
      group by c.id order by c.id`;
  }
});

export const messageSendServer = serveMutation({
  mutation: messageSend,
  handler: async (tx, args, context) => {
    const memberId = await requireMember(tx, args.channelId, context.actor);
    const body = args.body.trim();
    if (body.length === 0 || body.length > 240) {
      throw rejection('invalid_message', 'Messages must contain 1 to 240 characters.');
    }
    await tx.sql`
      insert into messages (id, channel_id, author_id, body, created_at, edited_at)
      values (${context.newId('message')}, ${args.channelId}, ${memberId}, ${body}, ${context.now()}, null)`;
  }
});

export const messageEditServer = serveMutation({
  mutation: messageEdit,
  handler: async (tx, args, context) => {
    await requireAuthor(tx, args.messageId, context.actor);
    const body = args.body.trim();
    if (body.length === 0 || body.length > 240) {
      throw rejection('invalid_message', 'Messages must contain 1 to 240 characters.');
    }
    await tx.sql`update messages set body = ${body}, edited_at = ${context.now()} where id = ${args.messageId}`;
  }
});

export const messageDeleteServer = serveMutation({
  mutation: messageDelete,
  handler: async (tx, args, context) => {
    await requireAuthor(tx, args.messageId, context.actor);
    await tx.sql`delete from messages where id = ${args.messageId}`;
  }
});

export const channelCreateServer = serveMutation({
  mutation: channelCreate,
  handler: async (tx, args, context) => {
    const name = args.name.trim();
    if (name.length === 0 || name.length > 40) {
      throw rejection('invalid_channel', 'Channel names must contain 1 to 40 characters.');
    }
    const channelId = context.newId('channel');
    const memberId = actorMember(context.actor);
    await tx.sql`
      insert into channels (id, name, is_private, created_at)
      values (${channelId}, ${name}, ${args.private}, ${context.now()})`;
    await tx.sql`insert into channel_members (channel_id, member_id) values (${channelId}, ${memberId})`;
  }
});

export const channelJoinServer = serveMutation({
  mutation: channelJoin,
  handler: async (tx, args, context) => {
    const rows = await tx.sql<{ readonly private: number }>`
      select is_private as private from channels where id = ${args.channelId}`;
    if (!rows[0]) throw rejection('missing_channel', 'The channel no longer exists.');
    if (rows[0].private !== 0) throw rejection('forbidden', 'Private channels require an invitation.');
    await tx.sql`
      insert into channel_members (channel_id, member_id)
      values (${args.channelId}, ${actorMember(context.actor)})
      on conflict (channel_id, member_id) do nothing`;
  }
});

export const readsMarkServer = serveMutation({
  mutation: readsMark,
  handler: async (tx, args, context) => {
    const memberId = await requireMember(tx, args.channelId, context.actor);
    await tx.sql`
      insert into channel_reads (channel_id, member_id, last_read_at)
      values (${args.channelId}, ${memberId}, ${context.now()})
      on conflict (channel_id, member_id) do update set last_read_at = excluded.last_read_at`;
  }
});
