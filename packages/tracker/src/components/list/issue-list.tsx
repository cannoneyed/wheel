/**
 * The grouped issue list: state groups in workflow order, rows
 * display-ready from ViewOptionsService. Keyboard navigation and every row
 * action live in IssueInteractionService — this component just renders.
 */
import { For, Match, Switch } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { ViewOptionsService } from '../../services/view-options-service';
import { IssueRow } from './issue-row';
import styles from './issue-list.module.css';

const connectIssueList = connect(
  (props: { teamId: string }) => `IssueList:${props.teamId}`,
  (c, props: { teamId: string }) => {
    const viewOptions = c.service(ViewOptionsService);
    return view({
      groups: () => viewOptions.groupVms(props.teamId),
      loadState: () => viewOptions.loadState(props.teamId)
    });
  }
);

/** The list view for one team. */
export function IssueList(props: { teamId: string }) {
  const state = connectIssueList(props);
  return (
    <div use:componentRoot class={styles.list}>
      <Switch>
        <Match when={state.loadState.kind === 'error'}>
          <div class={styles.notice}>Could not load issues.</div>
        </Match>
        <Match when={state.groups.length === 0 && state.loadState.kind === 'loading'}>
          <div class={styles.notice}>Loading…</div>
        </Match>
        <Match when={state.groups.length === 0}>
          <div class={styles.notice}>No issues match the current filters.</div>
        </Match>
        <Match when={true}>
          <For each={state.groups}>
            {(group) => (
              <section class={styles.group}>
                <header class={styles.groupHeader}>
                  <span class={styles.stateDot} style={{ color: group.state.color }}>
                    ●
                  </span>
                  <span class={styles.stateName}>{group.state.name}</span>
                  <span class={styles.stateCount}>{group.rows.length}</span>
                </header>
                <For each={group.rows}>{(vm) => <IssueRow teamId={props.teamId} vm={vm} />}</For>
              </section>
            )}
          </For>
        </Match>
      </Switch>
    </div>
  );
}
