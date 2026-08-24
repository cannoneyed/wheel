/**
 * Axle's route table.
 *
 * Replaces the hand-rolled `NavigationService` (a `Route` union, a hash
 * parser, and a serializer) with the real thing. Two consequences worth
 * knowing:
 *
 * - URLs are paths now, not fragments: `/teams/core/issues`, not
 *   `#/team/core/issues`. That needs the host to serve `index.html` for every
 *   path; `vite preview` and the dev server already do.
 * - The route NAME carries what the old union's `kind` and `tab` carried.
 *   `routeName() === 'team.board'` replaces `route.kind === 'team' && route.tab === 'board'`.
 *
 * The four `team.*` children exist only to name a URL segment — the team
 * layout renders the whole workspace itself and never opens an `<Outlet/>`,
 * because the tabs share one component that switches internally. Declaring
 * them as routes is what makes `/teams/core/board` a real, linkable,
 * highlightable destination instead of hidden component state.
 */
import { createRouter } from 'wheel/router';

import { RoutedMain } from './components/shell/routed-main';
import { HomePlaceholder } from './components/shell/home-placeholder';
import { TeamPage } from './components/shell/team-page';
import { IssueRoute } from './components/detail/issue-route';
import { ProjectRoute } from './components/projects/project-route';
import { InboxPage } from './components/inbox/inbox-page';
import { MyIssuesPage } from './components/inbox/my-issues-page';

const routes = {
  path: '/',
  component: RoutedMain,
  children: {
    home: { path: '/', component: HomePlaceholder },
    inbox: { path: 'inbox', component: InboxPage },
    myIssues: { path: 'my-issues', component: MyIssuesPage },
    issue: { path: 'issues/$issueId', component: IssueRoute },
    project: { path: 'projects/$projectId', component: ProjectRoute },
    team: {
      path: 'teams/$teamId',
      component: TeamPage,
      children: {
        issues: { path: 'issues' },
        board: { path: 'board' },
        cycles: { path: 'cycles' },
        projects: { path: 'projects' }
      }
    }
  }
} as const;

/** The tree's type, for services and components that name the router's generic. */
export type TrackerRoutes = typeof routes;

/** Which team tab a route name selects; `issues` for anything else. */
export type TeamTab = 'issues' | 'board' | 'cycles' | 'projects';

/** Axle's router: service class, `<Root/>`, and a typed `<Link>`. */
export const trackerRouter = createRouter(routes, {
  name: 'TrackerRouter',
  notFound: HomePlaceholder
});

/** Read the active team tab out of a route name. */
export function tabOf(routeName: string | null): TeamTab {
  // Route names are child-key paths without the unnamed root: 'team.board',
  // not 'root.team.board' — the tab is the second segment.
  const tab = routeName?.split('.')[1];
  return tab === 'board' || tab === 'cycles' || tab === 'projects' ? tab : 'issues';
}
