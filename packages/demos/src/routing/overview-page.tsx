/**
 * The routing demo's index route — what `/routing` renders.
 *
 * An index child is how a layout's own path gets content: the root of this
 * subtree is `RoutingDemoLayout`, and this is the `path: '/'` child underneath
 * it. Without one, `/routing` would match the layout and render an empty
 * outlet.
 */
import { viewRoot } from 'wheel/core';

import { appRouter } from '../shell/routes';
import styles from './routing.module.css';

/** Explains what the demo shows, with links into each feature. */
export function OverviewPage() {
  return (
    <div use:viewRoot={'OverviewPage'} class={styles.page} data-testid="overview-page">
      <h2>Routing, as ordinary state</h2>
      <p>
        The current URL is an atom on <code>RouterService</code>. The matched route is a computed.
        Navigation is an action. Watch the panel on the right as you click around — those are the
        same values the debug panel shows.
      </p>
      <ul>
        <li>
          <appRouter.Link to="routing.team.issues" params={{ teamId: 'core' }} data-testid="overview-core">
            Core issues
          </appRouter.Link>{' '}
          — nested layout, a <code>$teamId</code> path param, and a URL-backed text filter.
        </li>
        <li>
          <appRouter.Link
            to="routing.team.issues"
            params={{ teamId: 'design' }}
            search={{ status: 'done' }}
            data-testid="overview-design-done"
          >
            Design issues, done only
          </appRouter.Link>{' '}
          — a typed search param, validated by Zod on the way in.
        </li>
        <li>
          <appRouter.Link to="routing.team.board" params={{ teamId: 'core' }} data-testid="overview-board">
            Core board
          </appRouter.Link>{' '}
          — a sibling route sharing the team layout above it.
        </li>
      </ul>
    </div>
  );
}
