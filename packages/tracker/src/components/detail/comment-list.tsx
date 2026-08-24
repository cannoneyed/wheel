/**
 * The comment thread: items + composer. Author rows resolve here
 * so each item's connect stays small.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { CommentService } from '../../services/comment-service';
import { TeamService, type User } from '../../services/team-service';
import type { Comment } from '../../sync/comments.sync';
import { CommentItem } from './comment-item';
import { CommentComposer } from './comment-composer';
import styles from './comment-list.module.css';

/** One display-ready comment. */
export interface CommentVm {
  readonly comment: Comment;
  readonly author: User | undefined;
}

const connectCommentList = connect(
  (props: { teamId: string; issueId: string }) => `CommentList:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const commentService = c.service(CommentService);
    const teamService = c.service(TeamService);
    return view({
      comments: (): readonly CommentVm[] =>
        commentService.commentsOf(props.issueId).map((comment) => ({
          comment,
          author: teamService.user(comment.authorId)
        }))
    });
  }
);

/** The comments block. */
export function CommentList(props: { teamId: string; issueId: string }) {
  const state = connectCommentList(props);
  return (
    <section use:componentRoot class={styles.section}>
      <div class={styles.heading}>Comments</div>
      <For each={state.comments}>{(vm) => <CommentItem issueId={props.issueId} vm={vm} />}</For>
      <CommentComposer issueId={props.issueId} />
    </section>
  );
}
