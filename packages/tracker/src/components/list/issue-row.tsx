/**
 * One issue row: property icons open pickers, the title inline-
 * edits (`e` or double-click), clicks drive cursor/selection per the
 * interaction service's rules. Per-instance connect name — every mounted row
 * has its own registry manifest.
 *
 * Pending server field: `number === 0` means the server hasn't
 * confirmed the create yet — the identifier renders as `ENG-…` with a pending
 * style until the rebase swaps the real number in.
 */
import { For, Show, onCleanup } from 'solid-js';
import { componentRoot, connect, systemClock, view } from 'wheel/core';
import { contextMenu } from 'wheel/kit';

import { SelectionService } from '../../services/selection-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import type { IssueVm } from '../../services/view-options-service';
import { priorityDef } from '../../utils/priorities';
import { formatDueDate, isOverdue } from '../../utils/dates';
import { IssueContextMenu } from '../common/issue-context-menu';
import styles from './issue-row.module.css';

const connectIssueRow = connect(
  (props: { teamId: string; vm: IssueVm }) => `IssueRow:${props.vm.issue.id}`,
  (c, props: { teamId: string; vm: IssueVm }) => {
    const selectionService = c.service(SelectionService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        selected: () => selectionService.isSelected(props.vm.issue.id),
        isCursor: () => selectionService.cursor.get() === props.vm.issue.id,
        isEditing: () => interactionService.editingId.get() === props.vm.issue.id
      },
      {
        rowClick: interactionService.rowClick,
        toggleSelect: selectionService.toggle,
        beginEdit: interactionService.beginEdit,
        commitEdit: interactionService.commitEdit,
        cancelEdit: interactionService.cancelEdit,
        openStatus: interactionService.openStatusPicker,
        openPriority: interactionService.openPriorityPicker,
        openAssignee: interactionService.openAssigneePicker,
        openPeek: interactionService.openPeek
      }
    );
  }
);

/** Renders one display-ready issue row. */
export function IssueRow(props: { teamId: string; vm: IssueVm }) {
  const state = connectIssueRow(props);
  const issue = () => props.vm.issue;
  const stop = (event: MouseEvent) => event.stopPropagation();
  let titleClickTimer: number | undefined;
  onCleanup(() => window.clearTimeout(titleClickTimer));
  return (
    <div
      use:componentRoot
      class={styles.row}
      classList={{
        [styles.rowCursor]: state.isCursor,
        [styles.rowSelected]: state.selected,
        [styles.rowArchived]: issue().archivedAt !== null
      }}
      onClick={(event) =>
        state.rowClick(issue().id, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey })
      }
      use:contextMenu={{
        id: `issue:${issue().id}`,
        menu: () => <IssueContextMenu teamId={props.teamId} issueId={issue().id} />
      }}
    >
      <span
        class={styles.selectBox}
        classList={{ [styles.selectBoxOn]: state.selected }}
        title="Select (x)"
        onClick={(event) => {
          stop(event);
          state.toggleSelect(issue().id);
        }}
      >
        {state.selected ? '☑' : '☐'}
      </span>
      <button
        class={styles.priority}
        title={`Priority: ${priorityDef(issue().priority).label}`}
        onClick={(event) => {
          stop(event);
          state.openPriority(issue().id);
        }}
      >
        {priorityDef(issue().priority).icon}
      </button>
      <span class={styles.identifier} classList={{ [styles.identifierPending]: issue().number === 0 }}>
        {props.vm.teamKey}-{issue().number === 0 ? '…' : issue().number}
      </span>
      <button
        class={styles.stateDot}
        title="Change status (s)"
        onClick={(event) => {
          stop(event);
          state.openStatus(issue().id);
        }}
      >
        <span style={{ color: props.vm.stateColor }}>●</span>
      </button>
      <Show
        when={state.isEditing}
        fallback={
          <span
            class={styles.title}
            data-testid={`issue-title-${issue().id}`}
            onClick={(event) => {
              event.stopPropagation();
              window.clearTimeout(titleClickTimer);
              if (event.detail >= 2) {
                state.beginEdit(issue().id);
              } else {
                // wheel-view-timing: wait for a possible second click before opening the single-click peek
                titleClickTimer = window.setTimeout(
                  () => state.openPeek(issue().id),
                  250
                );
              }
            }}
          >
            {issue().title}
          </span>
        }
      >
        <input
          class={styles.titleInput}
          data-testid={`issue-title-input-${issue().id}`}
          value={issue().title}
          onClick={stop}
          onKeyDown={(event) => {
            if (event.key === 'Enter') state.commitEdit(event.currentTarget.value);
            else if (event.key === 'Escape') state.cancelEdit();
          }}
          onBlur={(event) => state.commitEdit(event.currentTarget.value)}
          ref={(element) => {
            // dom boundary: the edit input just mounted; focus + select it.
            queueMicrotask(() => {
              element.focus();
              element.select();
            });
          }}
        />
      </Show>
      <span class={styles.meta}>
        <For each={props.vm.labels}>
          {(label) => (
            <span class={styles.label} style={{ 'border-color': label.color }}>
              {label.name}
            </span>
          )}
        </For>
        <Show when={issue().estimate !== null}>
          <span class={styles.estimate}>{issue().estimate}pt</span>
        </Show>
        <Show when={issue().dueDate !== null}>
          <span
            class={styles.due}
            classList={{ [styles.dueOverdue]: isOverdue(issue().dueDate!, systemClock.now()) }}
          >
            {formatDueDate(issue().dueDate!)}
          </span>
        </Show>
        <button
          class={styles.assignee}
          title={props.vm.assignee ? `Assigned to ${props.vm.assignee.name} (a)` : 'Assign (a)'}
          onClick={(event) => {
            stop(event);
            state.openAssignee(issue().id);
          }}
        >
          <Show when={props.vm.assignee} fallback={<span class={styles.unassigned}>○</span>}>
            {(assignee) => (
              <span class={styles.avatar} style={{ background: assignee().avatarColor }}>
                {assignee().initials}
              </span>
            )}
          </Show>
        </button>
      </span>
    </div>
  );
}
