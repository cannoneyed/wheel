/**
 * The board view — a sibling of the issue list under the same team layout.
 *
 * Switching between the two swaps only this node: the team header, tabs, and
 * status filter above stay mounted, because only the leaf of the matched chain
 * changed.
 */
import { For } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';

import { appRouter, type DemoRoutes } from '../shell/routes';
import { RoutingDemoService } from './services/routing-demo-service';
import styles from './routing.module.css';

const connectBoardPage = connect('BoardPage', (c) => {
  const router = c.service(appRouter.Service) as RouterService<DemoRoutes>;
  const data = c.service(RoutingDemoService);
  const teamId = (): string => router.matchOf('routing.team')?.params.teamId ?? '';
  return view({
    open: () => data.issuesForTeam(teamId()).filter((issue) => issue.status === 'open'),
    done: () => data.issuesForTeam(teamId()).filter((issue) => issue.status === 'done')
  });
});

/** Two columns of issue titles, split by status. */
export function BoardPage() {
  const state = connectBoardPage({});
  return (
    <div use:componentRoot class={styles.board} data-testid="board-page">
      <section data-testid="board-open">
        <h3>Open</h3>
        <ul>
          <For each={state.open}>{(issue) => <li>{issue.title}</li>}</For>
        </ul>
      </section>
      <section data-testid="board-done">
        <h3>Done</h3>
        <ul>
          <For each={state.done}>{(issue) => <li>{issue.title}</li>}</For>
        </ul>
      </section>
    </div>
  );
}
