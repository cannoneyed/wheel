/**
 * The bulk-action bar: appears while a selection exists, offers
 * the property pickers and archive over the whole selection.
 */
import { Show, componentRoot, connect, view } from 'wheel/core';

import { SelectionService } from '../../services/selection-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './selection-bar.module.css';

const connectSelectionBar = connect('SelectionBar', (c) => {
  const selectionService = c.service(SelectionService);
  const interactionService = c.service(IssueInteractionService);
  return view(
    { count: selectionService.count },
    {
      clear: selectionService.clear,
      openStatus: interactionService.openStatusPicker,
      openAssignee: interactionService.openAssigneePicker,
      openPriority: interactionService.openPriorityPicker,
      openLabels: interactionService.openLabelPicker,
      archive: interactionService.archiveTargets
    }
  );
});

/** Renders nothing until something is selected. */
export function SelectionBar() {
  const state = connectSelectionBar({});
  return (
    <Show when={state.count > 0}>
      <div use:componentRoot class={styles.bar}>
        <span class={styles.count}>{state.count} selected</span>
        <button class={styles.action} onClick={() => state.openStatus()}>Status</button>
        <button class={styles.action} onClick={() => state.openAssignee()}>Assignee</button>
        <button class={styles.action} onClick={() => state.openPriority()}>Priority</button>
        <button class={styles.action} onClick={() => state.openLabels()}>Labels</button>
        <button class={styles.action} onClick={() => state.archive()}>Archive</button>
        <button class={styles.dismiss} title="Clear selection (esc)" onClick={() => state.clear()}>
          ✕
        </button>
      </div>
    </Show>
  );
}
