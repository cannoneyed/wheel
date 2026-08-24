/**
 * The issue context menu (rows and cards share it). Globally rendered,
 * locally connected: the trigger site declares it via `use:contextMenu`; the
 * kernel portal renders it with this declaration site's context. Actions
 * follow the targets rule — right-clicking a selected row acts on the whole
 * selection.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { IssueService } from '../../services/issue-service';
import { SelectionService } from '../../services/selection-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './issue-context-menu.module.css';

const connectIssueContextMenu = connect(
  (props: { teamId: string; issueId: string }) => `IssueContextMenu:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const issueService = c.service(IssueService);
    const selectionService = c.service(SelectionService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        isArchived: () => issueService.issue(props.teamId, props.issueId)?.archivedAt !== null,
        targetCount: () =>
          selectionService.isSelected(props.issueId) ? Math.max(1, selectionService.count()) : 1
      },
      {
        openStatus: interactionService.openStatusPicker,
        openAssignee: interactionService.openAssigneePicker,
        openPriority: interactionService.openPriorityPicker,
        openLabels: interactionService.openLabelPicker,
        archive: interactionService.archiveTargets,
        unarchive: interactionService.unarchiveTargets,
        deleteForever: interactionService.deleteTargets
      }
    );
  }
);

/** Menu content for one issue (mounted only while open). */
export function IssueContextMenu(props: { teamId: string; issueId: string }) {
  const state = connectIssueContextMenu(props);
  const suffix = () => (state.targetCount > 1 ? ` (${state.targetCount})` : '');
  return (
    <div use:componentRoot class={styles.menu}>
      <Show
        when={!state.isArchived}
        fallback={
          <>
            <button class={styles.item} onClick={() => state.unarchive(props.issueId)}>
              Unarchive{suffix()}
            </button>
            <button class={`${styles.item} ${styles.danger}`} onClick={() => void state.deleteForever(props.issueId)}>
              Delete forever…
            </button>
          </>
        }
      >
        <button class={styles.item} onClick={() => state.openStatus(props.issueId)}>
          Status…{suffix()}
        </button>
        <button class={styles.item} onClick={() => state.openAssignee(props.issueId)}>
          Assignee…{suffix()}
        </button>
        <button class={styles.item} onClick={() => state.openPriority(props.issueId)}>
          Priority…{suffix()}
        </button>
        <button class={styles.item} onClick={() => state.openLabels(props.issueId)}>
          Labels…{suffix()}
        </button>
        <div class={styles.divider} />
        <button class={styles.item} onClick={() => state.archive(props.issueId)}>
          Archive{suffix()}
        </button>
      </Show>
    </div>
  );
}
