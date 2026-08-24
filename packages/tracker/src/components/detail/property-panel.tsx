/**
 * The detail property panel: every property as a picker-opening
 * chip — the same pickers the list shortcuts use. Due date is a native date
 * input, not a picker; archive/restore/delete live at the bottom.
 */
import { For } from 'solid-js';
import { Show, componentRoot, connect, view } from 'wheel/core';

import { ViewOptionsService } from '../../services/view-options-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { TeamService } from '../../services/team-service';
import { priorityDef } from '../../utils/priorities';
import { formatDueDate } from '../../utils/dates';
import styles from './property-panel.module.css';

const connectPropertyPanel = connect(
  (props: { teamId: string; issueId: string }) => `PropertyPanel:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const viewOptions = c.service(ViewOptionsService);
    const interactionService = c.service(IssueInteractionService);
    const teamService = c.service(TeamService);
    return view(
      {
        vm: () => viewOptions.issueVm(props.teamId, props.issueId),
        stateName: () => {
          const vm = viewOptions.issueVm(props.teamId, props.issueId);
          return (
            teamService.states(props.teamId).find((s) => s.id === vm?.issue.stateId)?.name ?? '…'
          );
        },
        estimatesEnabled: () => teamService.team(props.teamId)?.estimatesEnabled ?? false
      },
      {
        openPicker: interactionService.openPropertyPicker,
        setDueDate: (issueId: string, value: string) =>
          interactionService.saveDueDate(issueId, value === '' ? null : value),
        archive: interactionService.archiveTargets,
        unarchive: interactionService.unarchiveTargets,
        deleteForever: interactionService.deleteTargets
      }
    );
  }
);

/** Property chips + lifecycle actions for one issue. */
export function PropertyPanel(props: { teamId: string; issueId: string }) {
  const state = connectPropertyPanel(props);
  return (
    <Show when={state.vm}>
      {(vm) => (
        <div use:componentRoot class={styles.panel}>
          <button class={styles.chip} onClick={() => state.openPicker('status', props.issueId)}>
            <span style={{ color: vm().stateColor }}>●</span> {state.stateName}
          </button>
          <button class={styles.chip} onClick={() => state.openPicker('priority', props.issueId)}>
            {priorityDef(vm().issue.priority).icon} {priorityDef(vm().issue.priority).label}
          </button>
          <button class={styles.chip} onClick={() => state.openPicker('assignee', props.issueId)}>
            <Show when={vm().assignee} fallback={<>○ Unassigned</>}>
              {(assignee) => (
                <>
                  <span class={styles.avatar} style={{ background: assignee().avatarColor }}>
                    {assignee().initials}
                  </span>
                  {assignee().name}
                </>
              )}
            </Show>
          </button>
          <button class={styles.chip} onClick={() => state.openPicker('labels', props.issueId)}>
            <Show when={vm().labels.length > 0} fallback={<>+ Labels</>}>
              <For each={vm().labels}>
                {(label) => (
                  <span class={styles.labelDot} style={{ color: label.color }}>
                    ● {label.name}
                  </span>
                )}
              </For>
            </Show>
          </button>
          <Show when={state.estimatesEnabled}>
            <button class={styles.chip} onClick={() => state.openPicker('estimate', props.issueId)}>
              {vm().issue.estimate === null ? '– Estimate' : `${vm().issue.estimate} pts`}
            </button>
          </Show>
          <button class={styles.chip} onClick={() => state.openPicker('project', props.issueId)}>
            {vm().projectName === undefined ? '▣ No project' : `▣ ${vm().projectName}`}
          </button>
          <button class={styles.chip} onClick={() => state.openPicker('cycle', props.issueId)}>
            {vm().cycleLabel === undefined ? '◌ No cycle' : `◌ ${vm().cycleLabel}`}
          </button>
          <label class={styles.chip}>
            <Show when={vm().issue.dueDate} fallback={<>📅 Due date</>}>
              {(dueDate) => <>📅 {formatDueDate(dueDate())}</>}
            </Show>
            <input
              type="date"
              class={styles.dateInput}
              value={vm().issue.dueDate ?? ''}
              onChange={(event) => state.setDueDate(props.issueId, event.currentTarget.value)}
            />
          </label>
          <span class={styles.spacer} />
          <Show
            when={vm().issue.archivedAt === null}
            fallback={
              <>
                <button class={styles.chip} onClick={() => state.unarchive(props.issueId)}>
                  Unarchive
                </button>
                <button class={`${styles.chip} ${styles.danger}`} onClick={() => void state.deleteForever(props.issueId)}>
                  Delete forever…
                </button>
              </>
            }
          >
            <button class={styles.chip} onClick={() => state.archive(props.issueId)}>
              Archive
            </button>
          </Show>
        </div>
      )}
    </Show>
  );
}
