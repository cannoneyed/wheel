/**
 * Comments + reactions sync module. Optimistic handlers mirror
 * comments.server.ts.
 *
 * Author model: `authorId`/`userId` always derive from the mutation ctx's
 * actor on BOTH sides — the args never carry an author, so a client can't
 * claim someone else's voice (within the documented no-auth trust model:
 * the server enforces author-only edit/delete against the actor string).
 *
 * Restore path: comments.delete inverts to comments.create with the original
 * id/body/createdAt travelling in the args (same discipline as the editor
 * demo's blocks).
 */
import { mutation, orphan, query, t, table, type Infer, type InverseSpec } from 'wheel/sync';

/** One comment as it lives in SQLite and every client cache. */
export const CommentRow = t.object({
  id: t.string(),
  issueId: t.string(),
  authorId: t.string(),
  body: t.string(),
  editedAt: t.number().nullable(),
  createdAt: t.number()
});

/** The comments table. */
export const comments = table({ name: 'comments', type: CommentRow, key: (row) => row.id });

/** One emoji reaction; the key is (comment, user, emoji) — toggling is add/remove. */
export const ReactionRow = t.object({
  commentId: t.string(),
  issueId: t.string(),
  userId: t.string(),
  emoji: t.string()
});

/** The reactions table (composite key). */
export const reactions = table({
  name: 'reactions',
  type: ReactionRow,
  key: (row) => `${row.commentId}:${row.userId}:${row.emoji}`
});

/** One issue's comments, oldest first. */
export const commentsByIssue = query({
  name: 'comments.byIssue',
  params: t.object({ issueId: t.string() }),
  into: comments,
  projection: {
    filter: (row, params) => row.issueId === params.issueId,
    sort: (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)
  }
});

/** One issue's reactions (client groups them per comment). */
export const reactionsByIssue = query({
  name: 'reactions.byIssue',
  params: t.object({ issueId: t.string() }),
  into: reactions,
  projection: {
    filter: (row, params) => row.issueId === params.issueId,
    sort: (a, b) =>
      (`${a.commentId}:${a.userId}:${a.emoji}` < `${b.commentId}:${b.userId}:${b.emoji}` ? -1 : 1)
  }
});

/** The bare userId behind a `user:<id>` actor string. */
function actorUser(actor: string): string {
  return actor.replace(/^user:/, '');
}

/**
 * Write a comment. `createdAt` is args-borne only on the RESTORE path
 * (comments.delete's inverse re-creates the row byte-identical).
 * Inverse: delete it.
 */
export const commentCreate = mutation({
  name: 'comments.create',
  args: t.object({
    commentId: t.string(),
    issueId: t.string(),
    body: t.string(),
    createdAt: t.number().optional()
  }),
  optimistic: (cache, args, ctx) => {
    cache.put(comments, {
      id: args.commentId,
      issueId: args.issueId,
      authorId: actorUser(ctx.actor),
      body: args.body,
      editedAt: null,
      createdAt: args.createdAt ?? ctx.now()
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: commentDelete,
    args: { commentId: args.commentId },
    description: 'comment'
  })
});

/** Edit a comment's body (server: author-only). Inverse: prior body + edited mark. */
export const commentEdit = mutation({
  name: 'comments.edit',
  args: t.object({ commentId: t.string(), body: t.string() }),
  optimistic: (cache, args, ctx) => {
    const comment = cache.get(comments, args.commentId);
    if (!comment) throw orphan(`comment ${args.commentId} is gone`);
    cache.update(comments, args.commentId, { body: args.body, editedAt: ctx.now() });
  },
  invert: (reader, args): InverseSpec | null => {
    const comment = reader.get(comments, args.commentId);
    if (!comment) return null;
    return {
      mutation: commentEdit,
      args: { commentId: args.commentId, body: comment.body },
      description: 'edit comment'
    };
  }
});

/** Delete a comment (server: author-only). Inverse: re-create it exactly. */
export const commentDelete = mutation({
  name: 'comments.delete',
  args: t.object({ commentId: t.string() }),
  optimistic: (cache, args) => {
    for (const reaction of cache.list(reactions)) {
      if (reaction.commentId === args.commentId) {
        cache.delete(reactions, `${reaction.commentId}:${reaction.userId}:${reaction.emoji}`);
      }
    }
    cache.delete(comments, args.commentId);
  },
  invert: (reader, args): InverseSpec | null => {
    const comment = reader.get(comments, args.commentId);
    if (!comment) return null;
    return {
      mutation: commentCreate,
      args: {
        commentId: comment.id,
        issueId: comment.issueId,
        body: comment.body,
        createdAt: comment.createdAt
      },
      description: 'delete comment'
    };
  }
});

/** Add the actor's emoji reaction. Inverse: remove it. */
export const reactionAdd = mutation({
  name: 'reactions.add',
  args: t.object({ commentId: t.string(), issueId: t.string(), emoji: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.put(reactions, {
      commentId: args.commentId,
      issueId: args.issueId,
      userId: actorUser(ctx.actor),
      emoji: args.emoji
    });
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: reactionRemove,
    args: { commentId: args.commentId, issueId: args.issueId, emoji: args.emoji },
    description: 'reaction'
  })
});

/** Remove the actor's emoji reaction. Inverse: add it back. */
export const reactionRemove = mutation({
  name: 'reactions.remove',
  args: t.object({ commentId: t.string(), issueId: t.string(), emoji: t.string() }),
  optimistic: (cache, args, ctx) => {
    cache.delete(reactions, `${args.commentId}:${actorUser(ctx.actor)}:${args.emoji}`);
  },
  invert: (_reader, args): InverseSpec => ({
    mutation: reactionAdd,
    args: { commentId: args.commentId, issueId: args.issueId, emoji: args.emoji },
    description: 'reaction'
  })
});

/** Comment type alias for services/components. */
export type Comment = Infer<typeof CommentRow>;
/** Reaction type alias. */
export type Reaction = Infer<typeof ReactionRow>;
