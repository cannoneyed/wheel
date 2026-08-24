/**
 * Comments + reactions for the detail view. Per-issue lazy
 * subscriptions; rejection/orphan feedback rides the same toast path as
 * issues.
 */
import { SyncService, type MutationHandle } from 'wheel/sync';
import {
  commentCreate,
  commentDelete,
  commentEdit,
  commentsByIssue,
  reactionAdd,
  reactionRemove,
  reactionsByIssue,
  type Comment
} from '../sync/comments.sync';
import { ToastService } from 'wheel/kit';
import { UserService } from './user-service';

/** Emoji offered by the reaction picker. */
export const REACTION_EMOJI: readonly string[] = ['👍', '🎉', '👀', '❤️', '😅', '🚀'];

/** Owns comment/reaction subscriptions and mutations. */
export class CommentService extends SyncService {
  private readonly toastService = this.service(ToastService);
  private readonly userService = this.service(UserService);
  private readonly commentsView = this.liveQueryFor(commentsByIssue, (issueId: string) => ({ issueId }));
  private readonly reactionsView = this.liveQueryFor(reactionsByIssue, (issueId: string) => ({ issueId }));

  /** An issue's comments, oldest first. */
  readonly commentsOf = this.computedFor(
    (issueId: string): readonly Comment[] => this.commentsView(issueId).rows,
    'commentsOf'
  );
  /** One comment's reactions grouped by emoji: [emoji, userIds]. */
  readonly reactionsOf = this.computedFor(
    (issueId: string, commentId: string): ReadonlyArray<readonly [string, readonly string[]]> => {
      const grouped = new Map<string, string[]>();
      for (const reaction of this.reactionsView(issueId).rows) {
        if (reaction.commentId !== commentId) continue;
        const users = grouped.get(reaction.emoji) ?? [];
        users.push(reaction.userId);
        grouped.set(reaction.emoji, users);
      }
      return [...grouped.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    },
    'reactionsOf'
  );
  /** Whether the current actor authored a comment (gates edit/delete UI). */
  readonly isOwn = this.computedFor(
    (issueId: string, commentId: string): boolean => {
      const comment = this.commentsOf(issueId).find((row) => row.id === commentId);
      return comment !== undefined && comment.authorId === this.userService.actorId.get();
    },
    'isOwn'
  );

  private watch(handle: MutationHandle, verb: string): MutationHandle {
    void handle.settled.then((info) => {
      if (info.state === 'rejected' || info.state === 'orphaned' || info.state === 'failed') {
        this.toastService.flash(
          `comment:${info.mutationId}`,
          info.rejection?.message ?? info.error?.message ?? `Could not ${verb}.`,
          'warn'
        );
      }
    });
    return handle;
  }

  /** Post a comment. */
  readonly create = (issueId: string, body: string) => {
    const trimmed = body.trim();
    if (trimmed === '') return null;
    return this.watch(
      this.mutate(commentCreate, { commentId: this.client.newId('comment'), issueId, body: trimmed }),
      'post the comment'
    );
  };

  /** Edit a comment (server enforces author-only). */
  readonly edit = (commentId: string, body: string) =>
    this.watch(this.mutate(commentEdit, { commentId, body }), 'edit the comment');

  /** Delete a comment (undoable — the inverse re-creates it). */
  readonly remove = (commentId: string) =>
    this.watch(this.mutate(commentDelete, { commentId }), 'delete the comment');

  /** Toggle the actor's reaction on a comment. */
  readonly toggleReaction = (issueId: string, commentId: string, emoji: string) => {
    const mine = this.reactionsOf(issueId, commentId).some(
      ([reactionEmoji, users]) => reactionEmoji === emoji && users.includes(this.userService.actorId.get())
    );
    const decl = mine ? reactionRemove : reactionAdd;
    return this.watch(this.mutate(decl, { commentId, issueId, emoji }), 'react');
  };
}
