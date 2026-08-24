/**
 * view() — writes the connect-shape getters for you.
 *
 * The getter pattern is load-bearing (a shape field must DEFER its read into
 * the component's render so Solid tracks it there; eager reads are frozen
 * snapshots). view() keeps that contract while collapsing the ceremony:
 *
 *   return view(
 *     { rows: todoService.rows, filter: todoService.priorityFilter },
 *     { add: todoService.add }
 *   );
 *   // state.rows is a tracked VALUE read; state.add is the bound function.
 *
 * Four read forms, all deferred:
 *  - a zero-arg accessor (`svc.remaining`, `() => svc.issueVm(props.id)`) —
 *    the value is the call result;
 *  - a SELECTOR — a read that declares parameters (`isOn: (id) => …`) — the
 *    shape field IS that function. The component calls it during render, so
 *    the read still tracks there. Wrapping it in a getter instead called it
 *    with no argument and put the RESULT on the shape, so `state.isOn(id)`
 *    threw "is not a function" — the type already said selector, only the
 *    runtime disagreed;
 *  - an Atom, passed DIRECTLY (`svc.priorityFilter`) — the value is `.get()`,
 *    read lazily so the component tracks it (no mirror computed needed);
 *  - any other object (a liveQuery view) passed DIRECTLY — it goes through
 *    as-is; its own getters (`.rows`, `.status`) stay live, so
 *    `state.todos.rows` tracks in the component that reads it.
 *
 * Reads and actions stay visibly separate; the produced shape is identical
 * to hand-written getters, so stubOf/StubProvider and every lint rule apply
 * unchanged. Hand-written getters remain legal for derived/props-dependent
 * reads.
 *
 * Two extra jobs view() does while building the shape:
 *  - RECORDS each read that carries debug provenance (an atom, a computed
 *    accessor, a liveQuery view) as a dependency of the component currently
 *    connecting, so the debug panel's component → value edges are populated
 *    (the registry's `noteDependency` had no caller before this).
 *  - CATCHES the called-accessor mistake: passing `svc.count()` (an
 *    already-read number/array) instead of `svc.count` (the accessor) or
 *    `() => svc.count()` (a deferred thunk). An eager call produces a frozen
 *    snapshot that never updates; view() throws loudly instead of silently
 *    connecting dead state. (The `no-called-view-read` lint rule catches the
 *    object-returning form this runtime check can't distinguish from a view.)
 */

import { noteActiveRead } from './debug-registry';
import type { DebugMeta } from './debug-registry';

/** An Atom (or anything with a zero-arg `.get()`): connected directly, read as its value. */
export interface ReadableLike {
  get(): unknown;
}

/**
 * A read: a zero-arg accessor (computed, `() => …` thunk), a selector that
 * takes arguments, an Atom connected directly, or a live view object passed
 * through with its getters intact.
 */
export type ViewRead = ((...args: any[]) => unknown) | ReadableLike | object;
/** The reads half of a view() declaration: one named ViewRead per shape field. */
export type ViewReads = Record<string, ViewRead>;
/**
 * Actions pass through untouched.
 *
 * The parameter type is `any[]`, not the tighter `never[]`. A GENERIC action —
 * `router.navigate<N extends RouteName>(name, …)` is the motivating case —
 * cannot be instantiated against `never[]`, so its parameters collapsed to
 * `never` and every call site failed with "not assignable to parameter of type
 * never". This constraint's only real job is "these are functions"; being
 * clever about the parameter type cost more than it bought.
 */
export type ViewActions = Record<string, (...args: any[]) => unknown>;

/**
 * What a read form produces on the shape: call result, atom value, or the
 * value itself.
 *
 * A SELECTOR lands in the last branch on its own: `(id: string) => boolean`
 * is not assignable to `() => unknown` (a target that supplies no argument
 * cannot satisfy a source that requires one), so the conditional falls
 * through and the shape field keeps the function type. The runtime matches.
 */
export type ViewReadValue<R> = R extends () => infer T
  ? T
  : R extends { get(): infer T }
    ? T
    : R;

/** The resulting shape: reads become value properties, actions stay functions. */
export type View<Reads extends ViewReads, Actions extends ViewActions> = {
  readonly [K in keyof Reads]: ViewReadValue<Reads[K]>;
} & {
  readonly [K in keyof Actions]: Actions[K];
};

function isReadable(value: object): value is ReadableLike {
  return typeof (value as { get?: unknown }).get === 'function';
}

/** Record a read that carries debug provenance as the connecting component's dependency. */
function recordRead(read: ViewRead): void {
  const meta = (read as { __debugMeta?: DebugMeta }).__debugMeta;
  if (meta && typeof meta === 'object') noteActiveRead(meta);
}

/** Human name for a mis-passed read value, for the called-accessor error. */
function describeBadRead(read: unknown): string {
  if (read === null) return 'null';
  if (Array.isArray(read)) return 'an array (a query result, already read)';
  return `a ${typeof read} (a value, already read)`;
}

/**
 * Build a connect shape from read accessors + bound actions (see module doc).
 *
 * The `Actions` default is `Record<never, never>`, NOT `Record<string, never>`.
 * The latter made TypeScript resolve `Actions` to the default instead of
 * inferring it whenever the actions object held a generic function — every
 * action in the shape silently became `never` and uncallable. Both defaults
 * mean "no actions"; only this one leaves inference alone.
 */
export function view<Reads extends ViewReads, Actions extends ViewActions = Record<never, never>>(
  reads: Reads,
  actions?: Actions
): View<Reads, Actions> {
  const shape = {} as Record<string, unknown>;
  for (const key of Object.keys(reads)) {
    const read = reads[key];
    if (typeof read === 'function') {
      recordRead(read);
      if (read.length > 0) {
        // A SELECTOR: the read needs an argument the shape cannot supply, so
        // the function itself is the field. The component calls it inside its
        // own render, which is where the read has to track anyway.
        shape[key] = read;
        continue;
      }
      Object.defineProperty(shape, key, {
        enumerable: true,
        get: () => (read as () => unknown)()
      });
    } else if (read !== null && typeof read === 'object' && isReadable(read)) {
      // Atom connected directly: defer `.get()` into the component's render.
      recordRead(read);
      Object.defineProperty(shape, key, {
        enumerable: true,
        get: () => read.get()
      });
    } else if (read !== null && typeof read === 'object' && !Array.isArray(read)) {
      // Live view object (liveQuery view): pass through — its own getters
      // defer the reads, so `state.<key>.rows` tracks where it is read.
      recordRead(read);
      shape[key] = read;
    } else {
      // Called-accessor / raw-value mistake: a primitive, null, or an array
      // reached here, which means an accessor was CALLED (`svc.rows()`) instead
      // of passed (`svc.rows`) or deferred (`() => svc.rows()`). That value is a
      // frozen snapshot — it would connect dead state that never updates. Fail
      // loudly at declaration time rather than ship a component wired to a
      // corpse.
      throw new Error(
        `view() read "${key}" is ${describeBadRead(read)}, not a read. ` +
          `Pass the accessor itself (\`${key}: svc.${key}\`) or defer the call ` +
          `(\`${key}: () => svc.${key}(id)\`) — never call it here (\`svc.${key}()\`).`
      );
    }
  }
  for (const [key, action] of Object.entries(actions ?? {})) {
    shape[key] = action;
  }
  return shape as View<Reads, Actions>;
}
