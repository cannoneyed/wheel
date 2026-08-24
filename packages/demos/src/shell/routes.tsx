/**
 * The demo app's route tree — one nested literal, compiled once.
 *
 * Reading it top to bottom gives you the URL space:
 *
 *   /                                       home
 *   /todos /kanban /editor /sheet /graph /sequencer   the six sync demos
 *   /framing                                application framing kitchen sink
 *   /routing                                routing playground (layout)
 *     /routing                              overview
 *     /routing/teams/$teamId                team layout (?status=)
 *       /routing/teams/$teamId/issues       issue list (?q=)
 *       /routing/teams/$teamId/board        board
 *       /routing/teams/$teamId/issues/$id   issue detail
 *
 * Page modules import `appRouter` from here for `<appRouter.Link>` and the
 * service class, which makes this file part of an import cycle with them. That
 * is fine as long as every use is DEFERRED — inside a component body or a
 * connect callback, both of which run long after module evaluation.
 *
 * What is NOT fine, and cost a debugging session to find: destructuring at
 * module scope.
 *
 *   const Link = appRouter.Link;      // ❌ runs during module evaluation
 *   <appRouter.Link to="home" />      // ✅ runs during render
 *
 * The bundler evaluates the page module first (this file imports it), so the
 * `const` reads `appRouter` before its initializer has run. Dev builds can get
 * away with it; the production bundle throws
 * "Cannot access 'appRouter' before initialization" and renders a blank page.
 */
import { createRouter } from 'wheel/router';
import { logger } from 'wheel/core';
import { z } from 'zod';

import { EditorDemo } from '../editor/index';
import { GraphDemo } from '../graph/index';
import { SequencerDemo } from '../sequencer/index';
import { KanbanDemo } from '../kanban/index';
import { SheetDemo } from '../sheet/index';
import { TodosDemo } from '../todos/index';
import { FramingDemo } from '../framing/index';

import { BoardPage } from '../routing/board-page';
import { CrashPage } from '../routing/crash-page';
import { IssuePage } from '../routing/issue-page';
import { IssuesPage } from '../routing/issues-page';
import { OverviewPage } from '../routing/overview-page';
import { RoutingDemoLayout } from '../routing/routing-demo-layout';
import { TeamPage } from '../routing/team-page';

import { AppShell } from './app-shell';
import { HomePage } from './home-page';
import { NotFoundPage } from './not-found-page';
import { RouteErrorPage } from './route-error-page';

/** The tree itself, kept as a literal so every path string keeps its type. */
const routes = {
  path: '/',
  component: AppShell,
  children: {
    home: { path: '/', component: HomePage },
    todos: { path: 'todos', component: TodosDemo },
    kanban: { path: 'kanban', component: KanbanDemo },
    editor: { path: 'editor', component: EditorDemo },
    sheet: { path: 'sheet', component: SheetDemo },
    graph: { path: 'graph', component: GraphDemo },
    sequencer: { path: 'sequencer', component: SequencerDemo },
    framing: { path: 'framing', component: FramingDemo },
    routing: {
      path: 'routing',
      component: RoutingDemoLayout,
      children: {
        overview: { path: '/', component: OverviewPage },
        // Deliberately broken, so the error boundary is demonstrable.
        crash: { path: 'crash', component: CrashPage },
        team: {
          path: 'teams/$teamId',
          component: TeamPage,
          // Inherited by every child below, so the board and the list share one
          // status filter without either declaring it.
          search: z.object({ status: z.enum(['all', 'open', 'done']).default('all') }),
          children: {
            issues: { path: 'issues', component: IssuesPage },
            board: { path: 'board', component: BoardPage },
            issue: { path: 'issues/$issueId', component: IssuePage }
          }
        }
      }
    }
  }
} as const;

/** The tree's type, for services that need to name the router's generic. */
export type DemoRoutes = typeof routes;

/** The app's router: service class, `<Root/>`, and a typed `<Link>`. */
export const appRouter = createRouter(routes, {
  notFound: NotFoundPage,
  errorFallback: RouteErrorPage,
  onError: (error, info) => {
    // Where a real app would call its crash reporter. `info.depth === 0` means
    // the root layout died and the user is looking at a bare fallback.
    logger.warn(`[demos] route error (${info.scope}, depth ${info.depth}) at ${info.url}`, error);
  },
  name: 'DemosRouter'
});
