/**
 * `createRouter(routes)` — one call that returns everything an app mounts.
 *
 *   export const router = createRouter({
 *     path: '/',
 *     component: AppShell,
 *     children: {
 *       home: { path: '/', component: Home },
 *       team: { path: 'teams/$teamId', component: TeamLayout, children: {
 *         issues: { path: 'issues', component: Issues }
 *       }}
 *     }
 *   });
 *
 *   router.Service   // inject in connect(): c.service(router.Service)
 *   router.Root      // mount once: <router.Root />
 *   router.Link      // typed: <router.Link to="team.issues" params={{ teamId }} />
 *
 * Why a factory instead of one exported `RouterService`: the route table is the
 * app's, not the framework's, and the table is what carries the types. Baking
 * it into a generated subclass is what lets `navigate('team.issues')` know that
 * route exists and that it needs a `teamId`.
 */
import type { JSX } from 'solid-js';

import type { ServiceClass } from '../core/services';

import { compileRoutes, type RouteTable } from './match';
import { Outlet } from './outlet';
import type { RouteErrorComponent, RouteErrorReporter } from './route-error';
import { createRouterLink, type LinkComponent } from './router-link';
import { createRouterRoot, type NotFoundComponent } from './router-root';
import { RouterService } from './router-service';
import type { RouteDef } from './types';

/** Options for `createRouter`. */
export interface CreateRouterOptions {
  /** Rendered when the URL matches nothing. Defaults to a plain "Not found". */
  readonly notFound?: NotFoundComponent;
  /**
   * Rendered in place of any route node that throws, at that node's own depth —
   * so a broken page keeps its layout and the app stays navigable. Resets on
   * navigation. Defaults to a plain box showing the message and a Retry button.
   */
  readonly errorFallback?: RouteErrorComponent;
  /**
   * Called for EVERY route error, from either boundary, before the fallback
   * renders. The one place to wire crash reporting; `info.scope` distinguishes a
   * contained page failure from one that took the whole routed tree down.
   */
  readonly onError?: RouteErrorReporter;
  /** Service name shown in the debug panel and error messages. Defaults to `AppRouter`. */
  readonly name?: string;
}

/** Everything one route table produces: a service class and its bound components. */
export interface Router<T extends RouteDef> {
  /** Inject this in a connect declaration to read or drive the router. */
  readonly Service: ServiceClass<RouterService<T>>;
  /** Mount once, where the app's routed content belongs. */
  readonly Root: () => JSX.Element;
  /** Typed link. `to` and `params` are checked against this table. */
  readonly Link: LinkComponent<T>;
  /** Where a layout renders its child route. Identical to the package-level `Outlet`. */
  readonly Outlet: () => JSX.Element;
  /** The compiled table, for tests and tooling. */
  readonly table: RouteTable<T>;
}

/**
 * Compile a route tree and bind a service class and components to it.
 *
 * Throws immediately on a malformed tree (a `$` with no name, one param name
 * twice in a chain, a route name containing a dot) — startup is the cheapest
 * place to find a typo'd route.
 */
export function createRouter<const T extends RouteDef>(
  routes: T,
  options: CreateRouterOptions = {}
): Router<T> {
  const table = compileRoutes(routes);

  class AppRouter extends RouterService<T> {
    /** The table this generated subclass navigates. */
    static override routeTable: RouteTable = table;
  }
  // The registry labels services by constructor name; without this every app's
  // router would show up as `AppRouter` regardless of what it routes.
  Object.defineProperty(AppRouter, 'name', { value: options.name ?? 'AppRouter' });

  return {
    Service: AppRouter,
    Root: createRouterRoot<T>(
      AppRouter,
      options.notFound,
      options.errorFallback,
      options.onError
    ),
    Link: createRouterLink<T>(AppRouter),
    Outlet,
    table
  };
}
