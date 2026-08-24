/**
 * `<Outlet/>` — where a layout renders whatever route is nested inside it.
 *
 * A matched URL produces a CHAIN of route nodes, outermost first:
 *
 *   /teams/t1/issues  →  [root, team, team.issues]
 *
 * The root renders at depth 0. Wherever it puts `<Outlet/>`, the node at depth
 * 1 renders, and so on down the chain. A node with no `component` of its own
 * behaves as a pass-through and renders its child directly.
 *
 * The chain is threaded REACTIVELY and each depth keys on its own node's
 * identity. Compiled `RouteDef` objects are stable across matches, so when
 * the route changes only the depths whose node actually differs remount:
 * `/teams/t1/issues` → `/teams/t1/settings` swaps the leaf while the root
 * and team layouts — and every service they provide — stay mounted. Param
 * changes swap nothing at all. Two routes sharing one `component` at the
 * same depth (an index route and its `$param` sibling) also keep that
 * component mounted, because `<Dynamic>` keys on the component value.
 */
import { createContext, useContext, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';

import { Show } from '../core/visibility';
import { RouteErrorBoundary } from './route-error';
import type { RouteDef } from './types';

/** The matched chain plus the depth the current node sits at. */
interface RouteChainValue {
  readonly nodes: readonly RouteDef[];
  readonly depth: number;
}

/** Internal: how `<Outlet/>` learns which node comes next. Never exported from the package. */
const RouteChainContext = createContext<RouteChainValue>();

/**
 * Render the chain node at `depth`, publishing the chain so any `<Outlet/>` in
 * its subtree can render the node below it.
 *
 * Each node gets its OWN error boundary, so a leaf that throws is contained
 * inside the layout that hosts it — the shell and its navigation survive. See
 * `route-error.tsx`.
 *
 * @internal Used by the root component `createRouter` generates.
 */
export function RouteNode(props: {
  nodes: readonly RouteDef[];
  depth: number;
}): JSX.Element {
  const node = (): RouteDef | undefined => props.nodes[props.depth];
  return (
    <Show when={node()}>
      {(current) => (
        // The getter keeps the chain REACTIVE through the context: a route
        // change flows down to every mounted depth, and each depth's
        // <Dynamic> decides for itself whether its component changed.
        <RouteChainContext.Provider
          value={{
            get nodes() {
              return props.nodes;
            },
            depth: props.depth
          }}
        >
          <RouteErrorBoundary scope="node" depth={props.depth}>
            <Dynamic component={current().component ?? Outlet} />
          </RouteErrorBoundary>
        </RouteChainContext.Provider>
      )}
    </Show>
  );
}

/**
 * Renders the child route inside a layout component.
 *
 *   function TeamLayout() {
 *     return (
 *       <div use:componentRoot>
 *         <TeamHeader />
 *         <Outlet />
 *       </div>
 *     );
 *   }
 *
 * Throws when used outside a router root, because a silent empty render is the
 * hardest routing bug to track down.
 */
export function Outlet(): JSX.Element {
  const chain = useContext(RouteChainContext);
  if (!chain) {
    throw new Error('<Outlet/> was rendered outside a router root. Mount the router root first.');
  }
  return <RouteNode nodes={chain.nodes} depth={chain.depth + 1} />;
}
