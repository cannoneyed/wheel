/**
 * Inbox server bindings + the `notify` fan-out helper mutation handlers call
 * (issues.server.ts and comments.server.ts). Ids derive from the mutationId
 * (same discipline as logActivity — server-authored rows never touch
 * ctx.newId).
 */
import { sql } from 'wheel/sync';
import { serveMutation, serveQuery, SqlQueryHandler, type ServerTx, type ServerMutationCtx } from 'wheel/sync/server/cloudflare';
import { notificationSetRead, notificationsInbox, type Notification } from './inbox.sync';

/** DDL for the notifications table. */
export const INBOX_DDL = [
  `create table if not exists notifications (
     id text primary key,
     user_id text not null,
     issue_id text not null,
     kind text not null,
     actor_id text not null,
     detail text not null default '',
     read_at bigint,
     created_at bigint not null)`,
  `create index if not exists notifications_user_idx on notifications (user_id, created_at desc)`
];

/** notifications.inbox — newest 100 for one user, pruned by user id. */
export const notificationsInboxServer = serveQuery({
  query: notificationsInbox,
  handler: SqlQueryHandler<{ userId: string }, Notification>({
    sql: (params, principal) =>
      sql`select id, user_id as "userId", issue_id as "issueId", kind,
                 actor_id as "actorId", detail, read_at as "readAt", created_at as "createdAt"
          from notifications
          where user_id = ${params.userId}
            and ${params.userId} = ${principal.actor.replace(/^user:/, '')}
          order by created_at desc, id desc limit 100`,
    prune: (image, params, principal) =>
      params.userId === principal.actor.replace(/^user:/, '') &&
      (image.n?.user_id ?? image.o?.user_id) === params.userId
  })
});

/** notifications.setRead — per-id explicit values (mark one/all/undo, same shape). */
export const notificationSetReadServer = serveMutation({
  mutation: notificationSetRead,
  handler: async (tx, args, ctx) => {
    const actorId = ctx.actor.replace(/^user:/, '');
    for (const update of args.updates) {
      await tx.sql`update notifications set read_at = ${update.readAt}
                   where id = ${update.notificationId} and user_id = ${actorId}`;
    }
  }
});

/**
 * Fan one notification out to a user, inside the mutation's transaction.
 * Self-notifications are dropped here so every call site stays simple.
 */
export async function notify(
  tx: ServerTx,
  ctx: ServerMutationCtx,
  input: { userId: string | null | undefined; issueId: string; kind: string; detail?: string }
): Promise<void> {
  const actor = ctx.actor.replace(/^user:/, '');
  if (!input.userId || input.userId === actor) return;
  const id = `notification_${ctx.mutationId.slice(2)}:${input.userId.slice(-8)}:${input.kind}`;
  await tx.sql`insert into notifications (id, user_id, issue_id, kind, actor_id, detail, created_at)
               values (${id}, ${input.userId}, ${input.issueId}, ${input.kind}, ${actor},
                       ${input.detail ?? ''}, ${ctx.now()})
               on conflict (id) do nothing`;
}

/**
 * Parse @mentions against the workspace's user list. Matches `@First` on
 * each user's first name, case-insensitively — a deliberate simplicity
 * cut (full names need a real mention syntax, which arrives with a rich
 * editor, not a regex).
 */
export function parseMentions(
  body: string,
  users: ReadonlyArray<{ id: string; name: string }>
): string[] {
  const handles = new Set(
    [...body.matchAll(/@([\p{L}\p{N}_-]+)/gu)].map((match) => match[1].toLowerCase())
  );
  if (handles.size === 0) return [];
  return users
    .filter((user) => handles.has(user.name.split(' ')[0]!.toLowerCase()))
    .map((user) => user.id);
}
