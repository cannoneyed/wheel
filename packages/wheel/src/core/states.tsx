/**
 * Component states — the storybook convention, wheel-shaped.
 *
 * A component's connect shape is its complete data manifest, so a NAMED
 * SHAPE is a complete renderable state. A colocated `<component>.states.tsx`
 * file enumerates them:
 *
 *   // toast.states.tsx
 *   export default defineStates({
 *     name: 'ToastSystem',
 *     component: ToastSystem,
 *     connection: connectToastSystem,
 *     states: {
 *       'three kinds stacked': { shape: { toasts: () => [...], dismiss: noop } },
 *       'empty':               { shape: { toasts: () => [], dismiss: noop } }
 *     }
 *   });
 *
 * `defineStates` is typed against the connection function, so the compiler
 * holds every fixture to exactly what the component declared it needs — a
 * drifted manifest breaks the states file at build time, not at demo time.
 *
 * The playground globs these files and renders every component × state,
 * each hash-addressable (`#/states/ToastSystem/empty`) — so a human browses
 * them in a sidebar and an agent screenshots any state by URL. `StateMount`
 * is the one renderer both use: Tier-1 stubbing (`StubProvider`), no
 * services, no client, no providers.
 *
 * Enforced for wheel/kit by `require-component-states`; app packages opt in
 * by writing the file.
 */
import type { JSX } from 'solid-js';

import { StubProvider, stubOf } from './stubs';

/** One named state: the stubbed shape, mount props, and an optional note. */
export interface ComponentState<Props, Shape> {
  /** The connect shape this state renders with (typed by the connection). */
  readonly shape: Shape;
  /** Identity/variation props for the mount; omit when the component takes none. */
  readonly props?: Props;
  /** One line shown under the state's title in the playground. */
  readonly note?: string;
}

/** A component's enumerated states — the default export of a `*.states.tsx` file. */
export interface StatesDefinition<Props, Shape> {
  /** The component's name — must equal the component function's name (lint-checked someday; keep them identical). */
  readonly name: string;
  readonly component: (props: Props) => JSX.Element;
  /**
   * The component's connect function. Typed with a `never` prop so ANY
   * connection fits — the stub map keys on function identity; the
   * connection's own props never matter for stubbing.
   */
  readonly connection: (props: never) => Shape;
  readonly states: Readonly<Record<string, ComponentState<Props, Shape>>>;
}

/** Erased form the playground iterates over (the glob loses the generics). */
export type AnyStatesDefinition = StatesDefinition<never, unknown>;

/** Identity with inference: holds `states` to the connection's exact Shape. */
export function defineStates<Props, Shape>(
  definition: StatesDefinition<Props, Shape>
): StatesDefinition<Props, Shape> {
  return definition;
}

/**
 * Render one named state: the component alone under a `StubProvider` — no
 * services, no client. Throws (loudly, at mount) on an unknown state name.
 */
export function StateMount(props: { definition: AnyStatesDefinition; state: string }): JSX.Element {
  const entry = props.definition.states[props.state];
  if (!entry) {
    throw new Error(
      `'${props.definition.name}' has no state '${props.state}' (states: ${Object.keys(props.definition.states).join(', ')})`
    );
  }
  const Component = props.definition.component as (componentProps: Record<string, unknown>) => JSX.Element;
  return (
    <StubProvider stubs={[stubOf(props.definition.connection, entry.shape)]}>
      <Component {...((entry.props ?? {}) as Record<string, unknown>)} />
    </StubProvider>
  );
}
