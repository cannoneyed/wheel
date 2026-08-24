/** My Issues: assigned / created tabs over every team. */
import { For, Show } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { IssueService } from '../../services/issue-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import styles from './inbox-page.module.css';

const connectMyIssuesPage = connect('MyIssuesPage', (c) => {
  const issueService = c.service(IssueService);
  const interactionService = c.service(IssueInteractionService);
  return view(
    {},
    {
      rows: (tab: 'assigned' | 'created') => issueService.myIssues(tab),
      openIssue: interactionService.openFull
    }
  );
});

/** The my-issues route. */
export function MyIssuesPage() {
  const state = connectMyIssuesPage({});
  const [tab, setTab] = useSignal<'assigned' | 'created'>('assigned', 'tab');
  return (
    <div use:componentRoot class={styles.page}>
      <header class={styles.header}>
        <h2 class={styles.title}>My Issues</h2>
        <button
          class={styles.markAll}
          classList={{ [styles.tabActive]: tab() === 'assigned' }}
          onClick={() => setTab('assigned')}
        >
          Assigned
        </button>
        <button
          class={styles.markAll}
          classList={{ [styles.tabActive]: tab() === 'created' }}
          onClick={() => setTab('created')}
        >
          Created
        </button>
      </header>
      <div class={styles.list}>
        <For each={state.rows(tab())}>
          {(row) => (
            <div class={styles.row}>
              <button class={styles.body} onClick={() => state.openIssue(row.issue.id)}>
                <span class={styles.sentence}>
                  {row.teamKey}-{row.issue.number === 0 ? '…' : row.issue.number}
                </span>
                <span class={styles.issueTitle}>{row.issue.title}</span>
              </button>
            </div>
          )}
        </For>
        <Show when={state.rows(tab()).length === 0}>
          <div class={styles.empty}>Nothing {tab() === 'assigned' ? 'assigned to' : 'created by'} you.</div>
        </Show>
      </div>
    </div>
  );
}
