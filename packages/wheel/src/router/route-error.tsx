/**
 * Error containment for routing: no single component can cost you the app.
 *
 * A route component that throws — or a service it injects that throws while
 * constructing — is an ordinary render error, and Solid's answer to an uncaught
 * render error is to tear down the whole tree. That turns a bug on one page into
 * a blank screen with no navigation left, which is the worst possible failure
 * mode for a router: you cannot even leave the page that broke.
 *
 * There are TWO boundaries, and the pairing is the point:
 *
 *  1. PER NODE. `RouteNode` wraps every node in the matched chain, at every
 *     depth. A leaf that throws is contained inside the layout hosting it — the
 *     shell, the sidebar, and the links around it keep working, so the next
 *     click leaves the wreck behind.
 *  2. GLOBAL. The router root wraps the whole routed tree, including the root
 *     layout and the not-found view. This is the one that holds when the failure
 *     is ABOVE every layout — a broken shell, a throw in the chain renderer
 *     itself. It cannot preserve on-screen navigation (the shell is what died),
 *     but it keeps the document alive, and that is enough: the router service,
 *     its URL atom, and its `popstate` listener are all outside the render that
 *     failed. Browser back/forward still work, and any navigation resets the
 *     boundary and re-renders the app.
 *
 * Three details that make this usable rather than merely quiet:
 *
 *  - The error is reported to `onError` (and `console.error`'d) BEFORE the
 *    fallback renders. A boundary that swallows its cause is a debugging trap;
 *    the stack the developer needs is the one the browser already had.
 *  - Navigating away RESETS the boundary. Solid's `ErrorBoundary` latches, so
 *    without this the fallback would outlive the route that produced it and
 *    every later page would render the old error.
 *  - Fallbacks render INSIDE the service provider, so an app's fallback may use
 *    `<router.Link>` and `router.navigate` freely. A global fallback that offers
 *    "back to home" is the recommended shape.
 */
import { ErrorBoundary, createContext, createEffect, on, useContext, type JSX } from 'solid-js';

import { viewRoot } from '../core/connect';
import { logger } from '../core/logger';

/** Where a route error was caught. */
export interface RouteErrorInfo {
  /** URL at the moment of the failure. */
  readonly url: string;
  /**
   * `'node'` for a component inside the matched chain; `'global'` for the
   * outermost boundary — the not-found view or the chain renderer itself.
   */
  readonly scope: 'node' | 'global';
  /**
   * Depth in the matched chain, or `null` for a global catch. `0` is the root
   * layout, which means the user is looking at a fallback where the whole app
   * used to be — the case worth paging someone about.
   */
  readonly depth: number | null;
}

/** Notified for every route error, before the fallback renders. */
export type RouteErrorReporter = (error: unknown, info: RouteErrorInfo) => void;

/** What a route-error fallback is handed. */
export interface RouteErrorProps {
  /** Whatever was thrown. Rarely an `Error` in practice — render defensively. */
  readonly error: unknown;
  /** Re-render the failed route. Called automatically on navigation. */
  readonly reset: () => void;
  /** Where this was caught — lets one fallback serve both boundaries. */
  readonly scope: 'node' | 'global';
}

/** Rendered in place of a route node that threw. */
export type RouteErrorComponent = (props: RouteErrorProps) => JSX.Element;

/** Per-router settings every node needs; provided once by the router root. */
export interface RouterRuntime {
  /** The app's fallback, or the default one below. */
  readonly errorFallback: RouteErrorComponent;
  /** Current URL. A change resets every boundary in the tree. */
  readonly resetKey: () => string;
  /** The app's reporter, or a no-op. */
  readonly onError: RouteErrorReporter;
}

/** @internal How `RouteNode` finds its router's error settings. Never exported from the package. */
export const RouterRuntimeContext = createContext<RouterRuntime>();

/** Best-effort human text for anything a route may have thrown. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * Plain, unstyled default. Deliberately shows the message: a route that fails
 * silently in production is a bug report nobody can act on.
 */
function DefaultRouteError(props: RouteErrorProps): JSX.Element {
  return (
    <div
      use:viewRoot={{ name: 'DefaultRouteError', group: 'framework', props }}
      data-wheel-router="error"
      data-wheel-router-scope={props.scope}
      role="alert"
    >
      <p>{props.scope === 'global' ? 'The app failed to render.' : 'This page failed to render.'}</p>
      <pre>{messageOf(props.error)}</pre>
      <button type="button" onClick={() => props.reset()}>
        Retry
      </button>
    </div>
  );
}

/** The fallback used when `createRouter` was given none. */
export const defaultRouteError: RouteErrorComponent = DefaultRouteError;

/** Reporter used when `createRouter` was given none. */
export const defaultRouteErrorReporter: RouteErrorReporter = () => {};

/**
 * Wrap a subtree so a throw inside it cannot escape.
 *
 * @internal Used by `RouteNode` (per node) and the router root (global). Apps
 * configure it through `createRouter(routes, { errorFallback, onError })`.
 */
export function RouteErrorBoundary(props: {
  scope: 'node' | 'global';
  depth?: number;
  children: JSX.Element;
}): JSX.Element {
  const runtime = useContext(RouterRuntimeContext);
  // No runtime means this node is rendered outside a router root, which
  // `<Outlet/>` already refuses. Passing through beats inventing a boundary
  // with no reset signal.
  if (!runtime) return props.children;
  const Fallback = runtime.errorFallback;
  return (
    <ErrorBoundary
      fallback={(error, reset) => {
        const info: RouteErrorInfo = {
          url: runtime.resetKey(),
          scope: props.scope,
          depth: props.depth ?? null
        };
        logger.error(`[wheel/router] ${props.scope} route error at ${info.url}:`, error);
        // Reporting must never be the thing that breaks the fallback.
        try {
          runtime.onError(error, info);
        } catch (reportingError) {
          logger.error('[wheel/router] onError threw:', reportingError);
        }
        // `defer` so mounting the fallback does not immediately reset it.
        createEffect(on(runtime.resetKey, () => reset(), { defer: true }));
        return <Fallback error={error} reset={reset} scope={props.scope} />;
      }}
    >
      {props.children}
    </ErrorBoundary>
  );
}
