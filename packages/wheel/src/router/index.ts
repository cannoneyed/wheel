/**
 * wheel/router — routing as ordinary Wheel state.
 *
 * The current URL is an `Atom<string>` on a `Service`. The matched route is a
 * `computed`. Navigation is an `action`. That is the whole idea, and it is what
 * makes the router show up in the debug panel and the inspector like any other
 * state, and testable through the same override seam as any other service.
 *
 *   const router = createRouter({ path: '/', component: Shell, children: {
 *     home: { path: '/', component: Home },
 *     team: { path: 'teams/$teamId', component: Team }
 *   }});
 *
 *   <router.Root />
 *   <router.Link to="team" params={{ teamId: 't1' }}>Team</router.Link>
 *
 * Depends on `core` only — never `sync`, never `kit`.
 */
export { createRouter, type CreateRouterOptions, type Router } from './create-router';
export { Outlet } from './outlet';
export {
  type RouteErrorComponent,
  type RouteErrorInfo,
  type RouteErrorProps,
  type RouteErrorReporter
} from './route-error';
export { type LinkComponent, type LinkProps } from './router-link';
export { type NotFoundComponent } from './router-root';
export {
  RouterHistoryService,
  RouterService,
  basedHistoryOverride,
  memoryHistoryOverride,
  type NavigateArgs,
  type NavigateOptions,
  type SearchAtomOptions,
  type TypedRouteMatch,
  type UncheckedNavigateOptions
} from './router-service';
export {
  basedHistory,
  browserHistory,
  defaultHistory,
  memoryHistory,
  type HistoryUrl,
  type RouterHistory
} from './history';
export {
  buildUrl,
  compileRoutes,
  defineRoutes,
  matchUrl,
  type BuildUrlOptions,
  type CompiledRoute,
  type RouteMatch,
  type RouteTable,
  type Segment
} from './match';
export type {
  PathParams,
  RouteChildren,
  RouteComponent,
  RouteDef,
  RouteName,
  RouteNeedsNoArgs,
  RouteParams,
  RouteSearchInput,
  RouteSearchOutput
} from './types';
