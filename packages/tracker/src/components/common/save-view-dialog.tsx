/** The save-view dialog: name the current filters, save, done. */
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './save-view-dialog.module.css';

const connectSaveViewDialog = connect('SaveViewDialog', (c) => {
  const interactionService = c.service(IssueInteractionService);
  return view({}, { save: interactionService.saveCurrentView });
});

/** Dialog content: one input + save. */
export function SaveViewDialog() {
  const state = connectSaveViewDialog({});
  const [name, setName] = useSignal('', 'name');
  const submit = () => {
    if (name().trim() === '') return;
    state.save(name());
  };
  return (
    <div use:componentRoot class={styles.dialog} role="dialog" aria-modal="true">
      <h2 class={styles.title}>Save view</h2>
      <p class={styles.hint}>Names the current filter + display configuration; saved views sync to everyone.</p>
      <input
        class={styles.input}
        placeholder="View name (e.g. Urgent bugs)"
        value={name()}
        onInput={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            // Without preventDefault, closing the dialog restores focus to
            // the "Save view" button that OPENED it — and the browser's
            // default Enter action then clicks that button, reopening an
            // empty dialog (found in a browser pass).
            event.preventDefault();
            submit();
          }
        }}
        ref={(element) => {
          // dom boundary: the dialog just opened; focus the name input.
          queueMicrotask(() => element.focus());
        }}
      />
      <div class={styles.actions}>
        <button class={styles.save} disabled={name().trim() === ''} onClick={submit}>
          Save view
        </button>
      </div>
    </div>
  );
}
