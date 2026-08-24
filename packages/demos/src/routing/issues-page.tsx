/**
 * The issue list — where the URL-backed filter earns its keep.
 *
 * Typing in the box writes an ordinary atom. The address bar follows on a short
 * coalescing delay, so a burst of keystrokes leaves one entry, and the filtered
 * view is a link you can paste to someone. Pressing back restores the previous
 * filter because the URL is what the atom reads from.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';
import { Input } from 'wheel/components';

import { appRouter, type DemoRoutes } from '../shell/routes';
import { IssueFilterService } from './services/issue-filter-service';
import styles from './routing.module.css';

/** Pill classes for an issue's status ("done" gets the green treatment). */
function statusBadge(status: string): string {
  return status === 'done' ? `${styles.badge} ${styles.done}` : styles.badge;
}

const connectIssuesPage = connect('IssuesPage', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  const filter = c.service(IssueFilterService);
  const teamId = (): string => router.matchOf('routing.team')?.params.teamId ?? '';
  return view(
    {
      teamId,
      query: filter.query,
      issues: () => filter.visibleIssues(teamId())
    },
    { setQuery: filter.query.set }
  );
});

/** Filter box plus the filtered issue list for the active team. */
export function IssuesPage() {
  const state = connectIssuesPage({});
  return (
    <div use:componentRoot class={styles.issueList} data-testid="issues-page">
      <Input
        type="search"
        placeholder="Filter issues…"
        data-testid="issue-filter"
        value={state.query}
        onInput={(event) => state.setQuery(event.currentTarget.value)}
      />
      <Show
        when={state.issues.length > 0}
        fallback={<p data-testid="issues-empty">Nothing matches that filter.</p>}
      >
        <ul data-testid="issue-rows">
          <For each={state.issues}>
            {(issue) => (
              <li>
                <appRouter.Link
                  to="routing.team.issue"
                  params={{ teamId: state.teamId, issueId: issue.id }}
                  data-testid={`issue-link-${issue.id}`}
                >
                  {issue.title}
                </appRouter.Link>
                <span class={statusBadge(issue.status)}>{issue.status}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}
