/* eslint-disable wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createComputed, onCleanup, untrack, type Accessor } from 'solid-js';
import { Store } from './Store';

type SelectorFunction<State> = (state: State, ...args: any[]) => any;

type KeysAllowingUndefined<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

type MaybeAccessor<T> = T | (() => T);

type MaybeAccessorArgs<Args extends any[]> = { [K in keyof Args]: MaybeAccessor<Args[K]> };

function access<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * Solid port of upstream's `ReactStore`: a Store with non-reactive context
 * values, named selectors, and helpers to sync external (prop) values into
 * the store. Reads through `state`/selectors are reactive in tracked scopes,
 * so upstream's `useState(selector)` subscription machinery reduces to plain
 * accessor functions.
 */
export class SolidStore<
  State extends object,
  Context = Record<string, never>,
  Selectors extends Record<string, SelectorFunction<State>> = Record<string, never>,
> extends Store<State> {
  /**
   * Non-reactive values such as refs, callbacks, event emitters, etc.
   */
  readonly context: Context;

  readonly selectors: Selectors;

  constructor(state: State, context: Context = {} as Context, selectors?: Selectors) {
    super(state);
    this.context = context;
    this.selectors = selectors ?? ({} as Selectors);
  }

  /**
   * Returns an accessor for a named selector — the Solid equivalent of
   * upstream's `store.useState('key')`.
   *
   * Extra selector args may be plain values or zero-arg accessors. Upstream's `useState` is a React
   * hook re-invoked (with fresh arg values) on every render, so a selector keyed by e.g. an
   * "is this the active trigger" boolean naturally stays current. Here, `useState(...)` itself runs
   * once, so an arg that varies over time (rather than being constant for the call's lifetime) must
   * be passed as an accessor — resolved via `access()` on every read of the returned accessor,
   * not just once at this call site — for the same reactive behavior.
   */
  useState<Key extends keyof Selectors>(
    key: Key,
    ...args: MaybeAccessorArgs<SelectorArgs<State, Selectors[Key]>>
  ): Accessor<ReturnType<Selectors[Key]>> {
    return () => this.selectors[key](this.state, ...(args.map(access) as any));
  }

  /**
   * Synchronizes an external reactive value (e.g. a prop) into the store.
   * Runs during the reactive phase (before effects), the closest analog to
   * upstream's layout-effect timing.
   *
   * The equality check (and the write itself) is wrapped in `untrack()` so this computation's
   * only tracked dependency is `value()` — matching upstream's `useSyncedValue`, whose
   * `useIsoLayoutEffect` only re-runs when its `[store, key, value]` deps change, not whenever
   * `store.state[key]` happens to change from some other source. Without the `untrack`, reading
   * `this.state[key]` here for the comparison makes it a tracked dependency too: if another
   * writer (e.g. a different `syncValue` call, or a plain `store.set`) legitimately owns the same
   * key and writes a different value, that write would re-trigger this computation, which would
   * then reassert its own (unchanged) `value()` — and the other writer's computation would react
   * to that in turn. Two such writers racing over one key is an infinite loop (caught in dev by
   * Solid's "Potential Infinite Loop Detected" guard, hit while wiring the popup store's
   * `FloatingRootStore` sync into `useFloating`'s own `referenceElement` sync).
   */
  syncValue<Key extends keyof State>(key: Key, value: Accessor<State[Key]>) {
    createComputed(() => {
      const next = value();
      untrack(() => {
        if (this.state[key] !== next) {
          this.set(key, next);
        }
      });
    });
  }

  /**
   * Like {@link syncValue}, and resets the key to `undefined` when the owning
   * scope is disposed.
   */
  syncValueWithCleanup<Key extends KeysAllowingUndefined<State>>(
    key: Key,
    value: Accessor<State[Key]>,
  ) {
    this.syncValue(key, value);
    onCleanup(() => {
      this.set(key, undefined as State[Key]);
    });
  }
}

type SelectorArgs<State, F> = F extends (state: State, ...args: infer A) => any ? A : never;
