/**
 * Sub-issues section: progress, children list (click peeks),
 * inline create, and the parent picker.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { IssueService } from '../../services/issue-service';
import { TeamService } from '../../services/team-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './sub-issues.module.css';

const connectSubIssues = connect(
  (props: { teamId: string; issueId: string }) => `SubIssues:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const issueService = c.service(IssueService);
    const teamService = c.service(TeamService);
    const interactionService = c.service(IssueInteractionService);
    return view(
      {
        children: () => issueService.childrenOf(props.teamId, props.issueId),
        progress: () => issueService.subProgress(props.teamId, props.issueId),
        parent: () => {
          const issue = issueService.issue(props.teamId, props.issueId);
          return issue?.parentId === null || issue === undefined
            ? undefined
            : issueService.issue(props.teamId, issue.parentId!);
        }
      },
      {
        // A parameterized read travels with the actions (view() reads are zero-arg).
        stateColor: (stateId: string) =>
          teamService.states(props.teamId).find((state) => state.id === stateId)?.color ??
          'var(--ink-muted)',
        openPeek: interactionService.openPeek,
        openParentPicker: interactionService.openParentPicker,
        createSub: interactionService.createSubIssue
      }
    );
  }
);

/** The sub-issues + parent block. */
export function SubIssues(props: { teamId: string; issueId: string }) {
  const state = connectSubIssues(props);
  const [draft, setDraft] = useSignal('', 'draft');
  const submit = () => {
    if (draft().trim() === '') return;
    state.createSub(props.issueId, draft());
    setDraft('');
  };
  return (
    <section use:componentRoot class={styles.section}>
      <header class={styles.header}>
        <span class={styles.heading}>Sub-issues</span>
        <Show when={state.progress.total > 0}>
          <span class={styles.progress}>
            {state.progress.done}/{state.progress.total} done
          </span>
        </Show>
        <span class={styles.spacer} />
        <button class={styles.parentButton} onClick={() => state.openParentPicker(props.issueId)}>
          <Show when={state.parent} fallback={<>Set parent…</>}>
            {(parent) => <>Parent: {parent().title}</>}
          </Show>
        </button>
      </header>
      <For each={state.children}>
        {(child) => (
          <button
            class={styles.child}
            classList={{ [styles.childArchived]: child.archivedAt !== null }}
            onClick={() => state.openPeek(child.id)}
          >
            <span style={{ color: state.stateColor(child.stateId) }}>●</span>
            <span class={styles.childTitle}>{child.title}</span>
          </button>
        )}
      </For>
      <input
        class={styles.input}
        placeholder="+ Add sub-issue (enter)"
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit();
        }}
      />
    </section>
  );
}
