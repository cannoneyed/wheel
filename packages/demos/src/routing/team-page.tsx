/**
 * The team layout: reads its own `$teamId`, renders tabs and a status filter,
 * and outlets whichever sub-route is active.
 *
 * Note what is NOT here: no `useParams()`. The team id arrives through the
 * connect declaration like every other value the component reads, so the
 * component's data manifest stays complete and the debug panel keeps the edge.
 * `matchOf('routing.team')` answers even though the route that actually matched
 * is one of the children — params accumulate down the chain.
 */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import { Outlet, type RouterService } from 'wheel/router';
import { Button } from 'wheel/components';

import { appRouter, type DemoRoutes } from '../shell/routes';
import { RoutingDemoService } from './services/routing-demo-service';
import styles from './routing.module.css';

const connectTeamPage = connect('TeamPage', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  const data = c.service(RoutingDemoService);
  const match = () => router.matchOf('routing.team');
  return view(
    {
      teamId: () => match()?.params.teamId ?? '',
      status: () => match()?.search.status ?? 'all',
      team: () => data.team(match()?.params.teamId ?? '')
    },
    { navigate: router.navigate }
  );
});

const STATUSES = ['all', 'open', 'done'] as const;

/** Team header, tabs, status filter, and the outlet for issues or board. */
export function TeamPage() {
  const state = connectTeamPage({});
  return (
    <div use:componentRoot class={styles.page} data-testid="team-page">
      <Show
        when={state.team}
        fallback={<p data-testid="team-missing">No team called “{state.teamId}”.</p>}
      >
        <h2 data-testid="team-name">{state.team?.name}</h2>
        <nav class={styles.tabs}>
          <appRouter.Link
            to="routing.team.issues"
            params={{ teamId: state.teamId }}
            search={{ status: state.status }}
            activeClass={styles.active}
            data-testid="tab-issues"
          >
            Issues
          </appRouter.Link>
          <appRouter.Link
            to="routing.team.board"
            params={{ teamId: state.teamId }}
            search={{ status: state.status }}
            activeClass={styles.active}
            data-testid="tab-board"
          >
            Board
          </appRouter.Link>
        </nav>
        <nav class={styles.filters} data-testid="status-filter">
          {STATUSES.map((status) => (
            <Button
              type="button"
              class={state.status === status ? styles.active : undefined}
              data-testid={`status-${status}`}
              onClick={() =>
                state.navigate('routing.team.issues', {
                  params: { teamId: state.teamId },
                  search: { status }
                })
              }
            >
              {status}
            </Button>
          ))}
        </nav>
        <Outlet />
      </Show>
    </div>
  );
}
