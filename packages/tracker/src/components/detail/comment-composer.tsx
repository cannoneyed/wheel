/**
 * The comment composer: markdown textarea, ⌘↵ posts, typing presence while
 * the user is actively writing (debounced off after a quiet second).
 */
import { For, Show, onCleanup } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { CommentService } from '../../services/comment-service';
import { PresenceService } from '../../services/presence-service';
import styles from './comment-composer.module.css';

const connectCommentComposer = connect(
  (props: { issueId: string }) => `CommentComposer:${props.issueId}`,
  (c, props: { issueId: string }) => {
    const commentService = c.service(CommentService);
    const presenceService = c.service(PresenceService);
    return view(
      { typers: () => presenceService.typerUsers(props.issueId) },
      {
        post: commentService.create,
        setTyping: presenceService.setTyping
      }
    );
  }
);

/** The composer under the comment thread. */
export function CommentComposer(props: { issueId: string }) {
  const state = connectCommentComposer(props);
  const [draft, setDraft] = useSignal('', 'draft');
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearTimeout(quietTimer);
    state.setTyping(false);
  });
  const noteTyping = () => {
    state.setTyping(true);
    clearTimeout(quietTimer);
    // wheel-view-timing: clear ephemeral typing presence after one quiet second
    quietTimer = setTimeout(() => state.setTyping(false), 1000);
  };
  const submit = () => {
    if (draft().trim() === '') return;
    state.post(props.issueId, draft());
    setDraft('');
    state.setTyping(false);
  };
  return (
    <div use:componentRoot class={styles.composer}>
      <Show when={state.typers.length > 0}>
        <div class={styles.typing}>
          <For each={state.typers}>{(user) => <span>{user.name}</span>}</For>
          {state.typers.length === 1 ? ' is' : ' are'} typing…
        </div>
      </Show>
      <textarea
        class={styles.input}
        rows={2}
        placeholder="Leave a comment… (markdown, ⌘↵ to post)"
        value={draft()}
        onInput={(event) => {
          setDraft(event.currentTarget.value);
          noteTyping();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div class={styles.actions}>
        <button class={styles.post} disabled={draft().trim() === ''} onClick={submit}>
          Comment
        </button>
      </div>
    </div>
  );
}
