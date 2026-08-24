/**
 * Binds `/projects/$projectId` to `<ProjectPage>`. Same seam as
 * `IssueRoute`: the page takes an id and knows nothing about routing.
 */
// wheel-component-root: headless — binds a route param to a page and adds no DOM
import { Show, connect, view } from 'wheel/core';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import { ProjectPage } from './project-page';

const connectProjectRoute = connect('ProjectRoute', (c) => {
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  return view({ projectId: () => router.matchOf('project')?.params.projectId ?? null });
});

/** Renders the project named by the URL. */
export function ProjectRoute() {
  const state = connectProjectRoute({});
  return (
    <Show when={state.projectId} keyed>
      {(projectId) => <ProjectPage projectId={projectId} />}
    </Show>
  );
}
