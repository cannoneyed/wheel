/**
 * Server bindings for comments + reactions. Author-only enforcement lives
 * here: edit/delete compare the row's author against the mutation's actor
 * and reject with a typed 'forbidden'. Comment writes also append to the
 * issue's activity feed.
 */
import { rejection, sql } from 'wheel/sync';
import { serveMutation, serveQuery, SqlQueryHandler, type ServerTx } from 'wheel/sync/server/cloudflare';
import {
  commentCreate,
  commentDelete,
  commentEdit,
  commentsByIssue,
  reactionAdd,
  reactionRemove,
  reactionsByIssue,
  type Comment,
  type Reaction
} from './comments.sync';
import { logActivity } from './activity.server';
import { notify, parseMentions } from './inbox.server';

/** DDL for comments + reactions. */
export const COMMENTS_DDL = [
  `create table if not exists comments (
     id text primary key,
     issue_id text not null,
     author_id text not null,
     body text not null,
     edited_at bigint,
     created_at bigint not null)`,
  `create index if not exists comments_issue_idx on comments (issue_id, created_at)`,
  `create table if not exists reactions (
     comment_id text not null,
     issue_id text not null,
     user_id text not null,
     emoji text not null,
     primary key (comment_id, user_id, emoji))`,
  `create index if not exists reactions_issue_idx on reactions (issue_id)`
];

/** comments.byIssue — oldest first, pruned by issue id. */
export const commentsByIssueServer = serveQuery({
  query: commentsByIssue,
  handler: SqlQueryHandler<{ issueId: string }, Comment>({
    sql: (params) =>
      sql`select id, issue_id as "issueId", author_id as "authorId", body,
                 edited_at as "editedAt", created_at as "createdAt"
          from comments where issue_id = ${params.issueId}
          order by created_at, id`,
    prune: (image, params) => (image.n?.issue_id ?? image.o?.issue_id) === params.issueId
  })
});

/** reactions.byIssue — pruned by issue id. */
export const reactionsByIssueServer = serveQuery({
  query: reactionsByIssue,
  handler: SqlQueryHandler<{ issueId: string }, Reaction>({
    sql: (params) =>
      sql`select comment_id as "commentId", issue_id as "issueId", user_id as "userId", emoji
          from reactions where issue_id = ${params.issueId}
          order by comment_id, user_id, emoji`,
    prune: (image, params) => (image.n?.issue_id ?? image.o?.issue_id) === params.issueId
  })
});

function actorUser(actor: string): string {
  return actor.replace(/^user:/, '');
}

/** Reject with 'forbidden' unless the comment exists and the actor authored it. */
async function requireAuthor(tx: ServerTx, commentId: string, actor: string): Promise<void> {
  const [row] = await tx.sql<{ authorId: string }>`
    select author_id as "authorId" from comments where id = ${commentId}`;
  if (!row) {
    throw rejection('missing', 'This comment no longer exists.');
  }
  if (row.authorId !== actorUser(actor)) {
    throw rejection('forbidden', 'Only the comment author can change it.');
  }
}

/** comments.create — upsert (restore path replays), plus a 'commented' activity row. */
export const commentCreateServer = serveMutation({
  mutation: commentCreate,
  handler: async (tx, args, ctx) => {
    const createdAt = args.createdAt ?? ctx.now();
    await tx.sql`insert into comments (id, issue_id, author_id, body, edited_at, created_at)
                 values (${args.commentId}, ${args.issueId}, ${actorUser(ctx.actor)},
                         ${args.body}, null, ${createdAt})
                 on conflict (id) do update set body = excluded.body, edited_at = null`;
    // Restores (createdAt args-borne) are undo bookkeeping, not new commentary.
    if (args.createdAt === undefined) {
      await logActivity(tx, ctx, args.issueId, 'commented', '');
      // Fan-out: issue creator + assignee hear about the comment;
      // @mentions hear separately (mention wins if both apply — same id kind
      // dedupes per user via the deterministic notification id).
      const [issue] = await tx.sql<{ creatorId: string; assigneeId: string | null; title: string }>`
        select creator_id as "creatorId", assignee_id as "assigneeId", title
        from issues where id = ${args.issueId}`;
      const snippet = args.body.length > 80 ? `${args.body.slice(0, 77)}…` : args.body;
      const users = await tx.sql<{ id: string; name: string }>`select id, name from users`;
      const mentioned = new Set(parseMentions(args.body, users));
      for (const userId of mentioned) {
        await notify(tx, ctx, { userId, issueId: args.issueId, kind: 'mention', detail: snippet });
      }
      if (issue) {
        for (const userId of [issue.creatorId, issue.assigneeId]) {
          if (userId && !mentioned.has(userId)) {
            await notify(tx, ctx, { userId, issueId: args.issueId, kind: 'comment', detail: snippet });
          }
        }
      }
    }
  }
});

/** comments.edit — author-only. */
export const commentEditServer = serveMutation({
  mutation: commentEdit,
  handler: async (tx, args, ctx) => {
    await requireAuthor(tx, args.commentId, ctx.actor);
    await tx.sql`update comments set body = ${args.body}, edited_at = ${ctx.now()}
                 where id = ${args.commentId}`;
  }
});

/** comments.delete — author-only; reactions go with it. */
export const commentDeleteServer = serveMutation({
  mutation: commentDelete,
  handler: async (tx, args, ctx) => {
    await requireAuthor(tx, args.commentId, ctx.actor);
    await tx.sql`delete from reactions where comment_id = ${args.commentId}`;
    await tx.sql`delete from comments where id = ${args.commentId}`;
  }
});

/** reactions.add — idempotent. */
export const reactionAddServer = serveMutation({
  mutation: reactionAdd,
  handler: async (tx, args, ctx) => {
    await tx.sql`insert into reactions (comment_id, issue_id, user_id, emoji)
                 values (${args.commentId}, ${args.issueId}, ${actorUser(ctx.actor)}, ${args.emoji})
                 on conflict (comment_id, user_id, emoji) do nothing`;
  }
});

/** reactions.remove — idempotent. */
export const reactionRemoveServer = serveMutation({
  mutation: reactionRemove,
  handler: async (tx, args, ctx) => {
    await tx.sql`delete from reactions
                 where comment_id = ${args.commentId} and user_id = ${actorUser(ctx.actor)}
                   and emoji = ${args.emoji}`;
  }
});
