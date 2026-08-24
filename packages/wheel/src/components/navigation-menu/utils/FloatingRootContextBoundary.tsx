/* eslint-disable wheel/require-tracked-show -- These framework-independent primitives cannot import Wheel application state or inspection helpers without a layer cycle. */
import { Show, type JSX } from 'solid-js';
import type { FloatingRootContext } from '../../floating-ui-solid';

/**
 * Remounts `children` whenever `context` changes identity.
 *
 * Shared hooks built on `FloatingRootContext` (`useDismiss`, `useHoverFloatingInteraction`,
 * `useAnchorPositioning`/`useFloating`) set up long-lived effects that close over the store
 * instance passed in at setup time — by design, since every other consumer of these hooks
 * (Popover, Menu, Tooltip, ...) creates exactly one `FloatingRootContext` for the lifetime of its
 * Root and never swaps it. `NavigationMenu` is the first port where the *active*
 * `FloatingRootContext` itself changes identity over time — each `NavigationMenu.Trigger` creates
 * its own context via `useFloatingRootContext`, and the Root's `floatingRootContext` signal points
 * at whichever trigger is currently active, swapping when the active item changes.
 *
 * This boundary re-runs `children` (disposing the previous hook instance and creating a fresh one)
 * whenever `context`'s identity changes — the Solid analog of React re-running a whole hook body on
 * every render with a new `context` argument. This is a call-site adaptation, not a change to the
 * shared hooks themselves: ideally `useDismiss`/`useHoverFloatingInteraction`/`useAnchorPositioning`
 * would accept a reactive `Accessor<FloatingRootContext | undefined>` and remount internally, but
 * today they take a plain value — see this port's final report for the shared-infra gap this
 * papers over.
 */
export function FloatingRootContextBoundary(props: {
  context: FloatingRootContext;
  children: (context: FloatingRootContext) => JSX.Element;
}): JSX.Element {
  return (
    <Show when={props.context} keyed>
      {(ctx) => props.children(ctx)}
    </Show>
  );
}
