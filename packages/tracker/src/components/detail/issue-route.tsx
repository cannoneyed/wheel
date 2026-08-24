/**
 * Binds `/issues/$issueId` to `<IssuePage>`.
 *
 * A thin seam on purpose: `IssuePage` takes an id and knows nothing about
 * routing, so it stays usable from a sandbox, a test, and a peek pane. The
 * `keyed` Show remounts the page when the id changes, which is what the old
 * shell's `<Match ... keyed>` did.
 */
// wheel-component-root: headless — binds a route param to a page and adds no DOM
import { Show, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import { IssuePage } from './issue-page';

const connectIssueRoute = connect('IssueRoute', (c) => {
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  return view({ issueId: () => router.matchOf('issue')?.params.issueId ?? null });
});

/** Renders the issue named by the URL. */
export function IssueRoute() {
  const state = connectIssueRoute({});
  return (
    <Show when={state.issueId} keyed>
      {(issueId) => <IssuePage issueId={issueId} />}
    </Show>
  );
}
