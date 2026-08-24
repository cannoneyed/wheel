/**
 * One comment: markdown body, reactions (chips toggle; + opens the emoji
 * picker), edit/delete for the author (server-enforced — the UI gate is
 * convenience, the rejection toast is the truth).
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, systemClock, useSignal, view } from 'wheel/core';

import { CommentService, REACTION_EMOJI } from '../../services/comment-service';
import { PickerService } from '../../services/picker-service';
import { Markdown } from '../../utils/markdown';
import { formatRelativeTime } from '../../utils/dates';
import type { CommentVm } from './comment-list';
import styles from './comment-item.module.css';

const connectCommentItem = connect(
  (props: { issueId: string; vm: CommentVm }) => `CommentItem:${props.vm.comment.id}`,
  (c, props: { issueId: string; vm: CommentVm }) => {
    const commentService = c.service(CommentService);
    const pickerService = c.service(PickerService);
    return view(
      {
        isOwn: () => commentService.isOwn(props.issueId, props.vm.comment.id),
        reactions: () => commentService.reactionsOf(props.issueId, props.vm.comment.id)
      },
      {
        edit: commentService.edit,
        remove: commentService.remove,
        toggleReaction: commentService.toggleReaction,
        openEmojiPicker: () =>
          pickerService.open({
            title: 'Add reaction',
            options: REACTION_EMOJI.map((emoji) => ({ id: emoji, label: emoji })),
            multi: false,
            selected: () => new Set<string>(),
            onPick: (emoji) => commentService.toggleReaction(props.issueId, props.vm.comment.id, emoji)
          })
      }
    );
  }
);

/** Renders one comment. */
export function CommentItem(props: { issueId: string; vm: CommentVm }) {
  const state = connectCommentItem(props);
  const [editing, setEditing] = useSignal(false, 'editing');
  const comment = () => props.vm.comment;
  return (
    <article use:componentRoot class={styles.item}>
      <div class={styles.head}>
        <Show when={props.vm.author}>
          {(author) => (
            <span class={styles.avatar} style={{ background: author().avatarColor }}>
              {author().initials}
            </span>
          )}
        </Show>
        <span class={styles.author}>{props.vm.author?.name ?? comment().authorId}</span>
        <span class={styles.time}>{formatRelativeTime(comment().createdAt, systemClock.now())}</span>
        <Show when={comment().editedAt !== null}>
          <span class={styles.edited}>(edited)</span>
        </Show>
        <span class={styles.spacer} />
        <Show when={state.isOwn}>
          <button class={styles.tool} onClick={() => setEditing(!editing())}>
            Edit
          </button>
          <button class={styles.tool} onClick={() => state.remove(comment().id)}>
            Delete
          </button>
        </Show>
      </div>
      <Show
        when={editing()}
        fallback={<Markdown source={comment().body} class={styles.body} />}
      >
        <textarea
          class={styles.editInput}
          rows={3}
          value={comment().body}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              state.edit(comment().id, event.currentTarget.value);
              setEditing(false);
            } else if (event.key === 'Escape') {
              setEditing(false);
            }
          }}
          onBlur={(event) => {
            state.edit(comment().id, event.currentTarget.value);
            setEditing(false);
          }}
          ref={(element) => {
            // dom boundary: the edit textarea just opened; focus it.
            queueMicrotask(() => element.focus());
          }}
        />
      </Show>
      <div class={styles.reactions}>
        <For each={state.reactions}>
          {([emoji, users]) => (
            <button
              class={styles.reaction}
              title={users.join(', ')}
              onClick={() => state.toggleReaction(props.issueId, comment().id, emoji)}
            >
              {emoji} {users.length}
            </button>
          )}
        </For>
        <button class={styles.addReaction} title="Add reaction" onClick={() => state.openEmojiPicker()}>
          +
        </button>
      </div>
    </article>
  );
}
