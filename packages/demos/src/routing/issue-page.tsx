/**
 * One issue, addressed by a SECOND path param nested under the team's.
 *
 * `/routing/teams/core/issues/c-1` binds both `$teamId` and `$issueId`, and the
 * type system requires both at every call site that links here. A URL naming an
 * issue that does not exist still matches the route — the page decides what
 * "missing" looks like, which is a data question, not a routing one.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';

import { appRouter, type DemoRoutes } from '../shell/routes';
import { RoutingDemoService } from './services/routing-demo-service';
import styles from './routing.module.css';

const connectIssuePage = connect('IssuePage', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  const data = c.service(RoutingDemoService);
  const match = () => router.matchOf('routing.team.issue');
  return view({
    teamId: () => match()?.params.teamId ?? '',
    issueId: () => match()?.params.issueId ?? '',
    issue: () => data.issue(match()?.params.issueId ?? '')
  });
});

/** Issue detail, with a link back to the list it came from. */
export function IssuePage() {
  const state = connectIssuePage({});
  return (
    <div use:componentRoot class={styles.page} data-testid="issue-page">
      <Show
        when={state.issue}
        fallback={<p data-testid="issue-missing">No issue “{state.issueId}”.</p>}
      >
        <h3 data-testid="issue-title">{state.issue?.title}</h3>
        <p data-testid="issue-status">Status: {state.issue?.status}</p>
      </Show>
      <appRouter.Link
        to="routing.team.issues"
        params={{ teamId: state.teamId }}
        data-testid="issue-back-to-list"
      >
        ← All issues
      </appRouter.Link>
    </div>
  );
}
