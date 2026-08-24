/**
 * One board card. Clicks drive cursor/selection (same rules as list rows);
 * pointer presses are forwarded up to BoardView's drag machine via the
 * `onPress` callback prop. Per-instance connect name.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { contextMenu } from 'wheel/kit';

import { SelectionService } from '../../services/selection-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import type { IssueVm } from '../../services/view-options-service';
import { priorityDef } from '../../utils/priorities';
import { IssueContextMenu } from '../common/issue-context-menu';
import styles from './board-card.module.css';

const connectBoardCard = connect(
  (props: { teamId: string; vm: IssueVm }) => `BoardCard:${props.vm.issue.id}`,
  (c, props: { teamId: string; vm: IssueVm }) => {
    const selectionService = c.service(SelectionService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        selected: () => selectionService.isSelected(props.vm.issue.id),
        isCursor: () => selectionService.cursor.get() === props.vm.issue.id
      },
      {
        rowClick: interactionService.rowClick,
        openPriority: interactionService.openPriorityPicker,
        openAssignee: interactionService.openAssigneePicker,
        openPeek: interactionService.openPeek
      }
    );
  }
);

/** Renders one display-ready board card. */
export function BoardCard(props: {
  teamId: string;
  vm: IssueVm;
  ghosted: boolean;
  onPress: (issueId: string, event: PointerEvent) => void;
}) {
  const state = connectBoardCard(props);
  const issue = () => props.vm.issue;
  return (
    <article
      use:componentRoot
      class={styles.card}
      classList={{
        [styles.cardSelected]: state.selected,
        [styles.cardCursor]: state.isCursor,
        [styles.cardGhosted]: props.ghosted
      }}
      data-board-card={issue().id}
      onPointerDown={(event) => props.onPress(issue().id, event)}
      onClick={(event) =>
        state.rowClick(issue().id, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey })
      }
      onDblClick={() => state.openPeek(issue().id)}
      use:contextMenu={{
        id: `card:${issue().id}`,
        menu: () => <IssueContextMenu teamId={props.teamId} issueId={issue().id} />
      }}
    >
      <div class={styles.top}>
        <span class={styles.identifier} classList={{ [styles.identifierPending]: issue().number === 0 }}>
          {props.vm.teamKey}-{issue().number === 0 ? '…' : issue().number}
        </span>
        <button
          class={styles.assignee}
          title={props.vm.assignee ? `Assigned to ${props.vm.assignee.name}` : 'Assign'}
          onClick={(event) => {
            event.stopPropagation();
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
      </div>
      <div class={styles.title}>{issue().title}</div>
      <div class={styles.bottom}>
        <button
          class={styles.priority}
          title={priorityDef(issue().priority).label}
          onClick={(event) => {
            event.stopPropagation();
            state.openPriority(issue().id);
          }}
        >
          {priorityDef(issue().priority).icon}
        </button>
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
      </div>
    </article>
  );
}
