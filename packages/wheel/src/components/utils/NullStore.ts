/* eslint-disable wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { SolidStore } from '../base-utils/store/SolidStore';

type SelectorFunction<State> = (state: State, ...args: any[]) => any;

/**
 * A `SolidStore` whose state never changes.
 *
 * Useful for fallback stores that need to support normal store reads while detached from the
 * component that owns real state. Context values may still contain mutable refs or maps.
 */
export class NullStore<
  State extends object,
  Context = Record<string, never>,
  Selectors extends Record<string, SelectorFunction<State>> = Record<string, never>,
> extends SolidStore<State, Context, Selectors> {
  // All mutators are overridden explicitly (rather than only the ones that funnel through
  // `setState` today) so the store stays inert even if a future base-class change reroutes one.
  setState(_newState: State) {}

  update(_changes: Partial<State>) {}

  set<Key extends keyof State>(_key: Key, _value: State[Key]) {}

  apply(_changes: Partial<State>) {}
}
