/**
 * The add-card form at the foot of each column: title + tag inputs and the
 * one BoardService.add action.
 */
import { componentRoot, connect, useSignal, view } from 'wheel/core';
import { Button, Input } from 'wheel/components';

import { BoardService } from '../services/board-service';
import styles from './add-card-form.module.css';

const connectAddCardForm = connect('AddCardForm', (c) => {
  const boardService = c.service(BoardService);
  return view({}, { add: boardService.add });
});

/** Title/tag inputs + submit for one column. */
export function AddCardForm(props: { columnId: string }) {
  const state = connectAddCardForm(props);
  // Draft inputs are ephemeral, component-bound state: named local signals are
  // the sanctioned tool here, not a service.
  const [draft, setDraft] = useSignal('', 'draft');
  const [tag, setTag] = useSignal('misc', 'tag');
  const submit = () => {
    const title = draft().trim();
    if (!title) return;
    state.add(props.columnId, title, tag().trim() || 'misc');
    setDraft('');
  };
  return (
    <div use:componentRoot class={styles.form}>
      <Input data-wheel-role="add-a-card"
        type="text"
        class={styles.titleInput}
        placeholder="Add a card…"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <Input data-wheel-role="tag"
        type="text"
        class={styles.tagInput}
        placeholder="tag"
        value={tag()}
        onInput={(e) => setTag(e.currentTarget.value)}
      />
      <Button data-wheel-role="add" onClick={submit}>+</Button>
    </div>
  );
}
