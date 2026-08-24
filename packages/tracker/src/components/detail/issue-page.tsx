/**
 * The full-page issue route (#/issue/<id>). The route only carries the id, so
 * the page locates the issue across teams (lazy per-team subscriptions).
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { IssueService } from '../../services/issue-service';
import { IssueDetail } from './issue-detail';
import styles from './issue-page.module.css';

const connectIssuePage = connect(
  (props: { issueId: string }) => `IssuePage:${props.issueId}`,
  (c, props: { issueId: string }) => {
    const issueService = c.service(IssueService);
    return view({ issue: () => issueService.locate(props.issueId) });
  }
);

/** Routed page wrapper around IssueDetail. */
export function IssuePage(props: { issueId: string }) {
  const state = connectIssuePage(props);
  return (
    <div use:componentRoot class={styles.page}>
      <Show when={state.issue} fallback={<div class={styles.locating}>Locating issue…</div>}>
        {(issue) => <IssueDetail teamId={issue().teamId} issueId={props.issueId} mode="page" />}
      </Show>
    </div>
  );
}
