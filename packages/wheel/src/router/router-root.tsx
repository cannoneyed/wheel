/**
 * The router's root component — one `<Show>` over the matched chain.
 *
 * `createRouter(routes)` builds this and hands it back bound to the generated
 * service class, so an app mounts `<Root/>` with no arguments and never names
 * the router service in its tree.
 *
 * The Show is deliberately NOT keyed: the chain flows reactively into
 * `RouteNode`, where each depth keys on its own node's identity (see
 * outlet.tsx). A route change therefore remounts only the depths that
 * actually changed — parent layouts, their providers, and every service
 * under them survive sibling navigation, which is what keeps live queries
 * warm and kills the flash-of-empty-state on every route transition.
 */
// wheel-component-root: headless — renders the matched route chain and adds no DOM of its own
import { Show, type JSX } from 'solid-js';

import { connect, viewRoot } from '../core/connect';
import { view } from '../core/view';
import type { ServiceClass } from '../core/services';

import { RouteNode } from './outlet';
import {
  RouteErrorBoundary,
  RouterRuntimeContext,
  defaultRouteError,
  defaultRouteErrorReporter,
  type RouteErrorComponent,
  type RouteErrorReporter
} from './route-error';
import type { RouterService } from './router-service';
import type { RouteDef } from './types';

/** What to render when the URL matches no route in the table. */
export type NotFoundComponent = () => JSX.Element;

/** Plain, unstyled default so a missing route is visible rather than blank. */
function DefaultNotFound(): JSX.Element {
  return (
    <div use:viewRoot={{ name: 'DefaultNotFound', group: 'framework' }} data-wheel-router="not-found">
      Not found
    </div>
  );
}

/**
 * Build the root component for one router service class.
 *
 * @internal Called by `createRouter`; apps use the returned `Root`.
 */
export function createRouterRoot<T extends RouteDef>(
  RouterClass: ServiceClass<RouterService<T>>,
  notFound: NotFoundComponent = DefaultNotFound,
  errorFallback: RouteErrorComponent = defaultRouteError,
  onError: RouteErrorReporter = defaultRouteErrorReporter
): () => JSX.Element {
  const connectRouterRoot = connect(
    'RouterRoot',
    (c) => {
      const router = c.service(RouterClass);
      return view({ nodes: () => router.match()?.nodes ?? null, url: router.url });
    },
    { group: 'framework' }
  );

  return function RouterRoot(): JSX.Element {
    const state = connectRouterRoot({});
    const NotFound = notFound;
    // The provider sits OUTSIDE the global boundary so the boundary can read its
    // own reset signal — and so the whole routed tree, including the root layout
    // and the not-found view, is inside something that catches.
    return (
      <RouterRuntimeContext.Provider
        value={{ errorFallback, onError, resetKey: () => state.url }}
      >
        <RouteErrorBoundary scope="global">
          <Show when={state.nodes} fallback={<NotFound />}>
            {(nodes) => <RouteNode nodes={nodes()} depth={0} />}
          </Show>
        </RouteErrorBoundary>
      </RouterRuntimeContext.Provider>
    );
  };
}
