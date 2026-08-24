/* eslint-disable wheel/require-export-jsdoc, wheel/require-member-jsdoc -- The port keeps public guidance on rendered parts; duplicate comments on aliases and structural types hide that guidance. */
import { createStore, reconcile, unwrap, type SetStoreFunction } from 'solid-js/store';

type Listener<T> = (value: T) => void;

/**
 * Solid port of upstream's `Store`: a value container with an observer
 * pattern. Backed by a solid-js store, so `state` property reads are
 * fine-grained reactive when performed inside tracked scopes (memos, effects,
 * JSX), while remaining plain synchronous reads elsewhere — mirroring how the
 * upstream store's `state` is read imperatively and `useStore` subscribes.
 */
export class Store<State extends object> {
  /**
   * Reactive state proxy. Reads are tracked in reactive scopes and always
   * reflect the latest value immediately after a write.
   */
  public state: State;

  protected writeState: SetStoreFunction<State>;

  private listeners = new Set<Listener<State>>();

  constructor(initialState: State) {
    const [state, setState] = createStore(initialState);
    this.state = state as State;
    this.writeState = setState;
  }

  /**
   * Subscribes imperatively to state changes (any write). Prefer reading
   * `store.state.x` inside a reactive scope; this exists for parity with
   * upstream's observer API.
   */
  subscribe = (fn: Listener<State>) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): State => {
    return this.state;
  };

  private notify() {
    for (const listener of Array.from(this.listeners)) {
      listener(this.state);
    }
  }

  /**
   * Replaces the state wholesale.
   */
  setState(newState: State) {
    this.writeState(reconcile(newState, { merge: true }) as any);
    this.notify();
  }

  /**
   * Merges a partial state object into the current state.
   */
  update(changes: Partial<State>) {
    let changed = false;
    const current = unwrap(this.state) as Record<string, unknown>;
    for (const key in changes) {
      if (!Object.is(current[key], (changes as Record<string, unknown>)[key])) {
        changed = true;
        break;
      }
    }
    if (changed) {
      this.writeState(changes as any);
      this.notify();
    }
  }

  /**
   * Sets a single key if it changed.
   */
  set<Key extends keyof State>(key: Key, value: State[Key]) {
    if (!Object.is(unwrap(this.state)[key], value)) {
      this.writeState(key as any, value as any);
      this.notify();
    }
  }

  /**
   * Applies partial changes unconditionally (parity with upstream `apply`).
   */
  apply(changes: Partial<State>) {
    this.writeState(changes as any);
    this.notify();
  }
}

export type ReadonlyStore<State extends object> = Pick<
  Store<State>,
  'getSnapshot' | 'subscribe' | 'state'
>;
