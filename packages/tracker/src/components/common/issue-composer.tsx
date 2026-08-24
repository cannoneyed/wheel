/**
 * The issue composer dialog content. Declared with
 * `<Dialog id="issue-composer">` in team-page.tsx, so it renders with the
 * team page's context. Draft fields are LOCAL state (useSignal) — nothing
 * here is shared until Create fires the mutation.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { TeamService } from '../../services/team-service';
import { IssueService } from '../../services/issue-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { PRIORITIES, ESTIMATES } from '../../utils/priorities';
import styles from './issue-composer.module.css';

const connectIssueComposer = connect(
  (props: { teamId: string }) => `IssueComposer:${props.teamId}`,
  (c, props: { teamId: string }) => {
    const teamService = c.service(TeamService);
    const issueService = c.service(IssueService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        states: () => teamService.states(props.teamId),
        users: teamService.users,
        labels: () => issueService.labelsFor(props.teamId),
        estimatesEnabled: () => teamService.team(props.teamId)?.estimatesEnabled ?? false
      },
      {
        submit: interactionService.submitComposer,
        close: interactionService.closeComposer
      }
    );
  }
);

/** The composer form. Fresh local draft per open (the dialog mounts lazily). */
export function IssueComposer(props: { teamId: string }) {
  const state = connectIssueComposer(props);
  const [title, setTitle] = useSignal('', 'title');
  const [description, setDescription] = useSignal('', 'description');
  const [stateId, setStateId] = useSignal(
    state.states.find((workflowState) => workflowState.type === 'unstarted')?.id ?? state.states[0]?.id ?? '',
    'stateId'
  );
  const [priority, setPriority] = useSignal(0, 'priority');
  const [assigneeId, setAssigneeId] = useSignal('', 'assigneeId');
  const [estimate, setEstimate] = useSignal(0, 'estimate');
  const [dueDate, setDueDate] = useSignal('', 'dueDate');
  const [labelIds, setLabelIds] = useSignal<readonly string[]>([], 'labelIds');

  const submit = () => {
    if (title().trim() === '') return;
    state.submit({
      title: title(),
      description: description(),
      stateId: stateId(),
      priority: priority(),
      assigneeId: assigneeId() === '' ? null : assigneeId(),
      estimate: estimate() === 0 ? null : estimate(),
      dueDate: dueDate() === '' ? null : dueDate(),
      labelIds: labelIds()
    });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };
  const toggleLabel = (labelId: string) =>
    setLabelIds((current) =>
      current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]
    );

  return (
    <div use:componentRoot class={styles.composer} role="dialog" aria-modal="true">
      <input
        class={styles.title}
        placeholder="Issue title"
        value={title()}
        onInput={(event) => setTitle(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        ref={(element) => {
          // dom boundary: the dialog just opened; focus starts in the title.
          queueMicrotask(() => element.focus());
        }}
      />
      <textarea
        class={styles.description}
        placeholder="Description (markdown)…"
        rows={5}
        value={description()}
        onInput={(event) => setDescription(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <div class={styles.properties}>
        <select value={stateId()} onChange={(event) => setStateId(event.currentTarget.value)}>
          <For each={state.states}>{(workflowState) => <option value={workflowState.id}>{workflowState.name}</option>}</For>
        </select>
        <select value={String(priority())} onChange={(event) => setPriority(Number(event.currentTarget.value))}>
          <For each={PRIORITIES}>{(def) => <option value={String(def.value)}>{def.label}</option>}</For>
        </select>
        <select value={assigneeId()} onChange={(event) => setAssigneeId(event.currentTarget.value)}>
          <option value="">Unassigned</option>
          <For each={state.users}>{(user) => <option value={user.id}>{user.name}</option>}</For>
        </select>
        <Show when={state.estimatesEnabled}>
          <select value={String(estimate())} onChange={(event) => setEstimate(Number(event.currentTarget.value))}>
            <For each={ESTIMATES}>
              {(points) => <option value={String(points)}>{points === 0 ? 'No estimate' : `${points} pts`}</option>}
            </For>
          </select>
        </Show>
        <input type="date" value={dueDate()} onChange={(event) => setDueDate(event.currentTarget.value)} />
      </div>
      <div class={styles.labels}>
        <For each={state.labels}>
          {(label) => (
            <button
              class={styles.labelChip}
              classList={{ [styles.labelChipOn]: labelIds().includes(label.id) }}
              style={{ 'border-color': label.color }}
              onClick={() => toggleLabel(label.id)}
            >
              {label.name}
            </button>
          )}
        </For>
      </div>
      <div class={styles.actions}>
        <button onClick={() => state.close()}>Cancel</button>
        <button class={styles.create} onClick={submit} disabled={title().trim() === ''}>
          Create issue <span class={styles.kbd}>⌘↵</span>
        </button>
      </div>
    </div>
  );
}
