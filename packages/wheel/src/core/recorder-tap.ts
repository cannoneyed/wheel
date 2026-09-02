/**
 * The kernel's recording seam — two hooks, off by default.
 *
 * Wheel already funnels every write through two places: `Service.action`
 * (the only sanctioned way to change anything) and `Atom.set` / `Atom.update`
 * (the only way an atom moves). That makes a complete, SEMANTIC record of what
 * an app did a matter of one branch in each of those two functions:
 *
 *   click → `BoardService.toggleCell(cellId="3-7")` → `BoardService.selection ["3-6"] → ["3-7"]`
 *
 * A DOM-mutation recorder (rrweb and friends) can only see the pixels move.
 * Wheel can name the action and the atom, because it owns both doors.
 *
 * The seam lives in `core` — and stays a seam — so the kernel never imports
 * the annotation layer that consumes it. `wheel/annotate` installs a tap when
 * it starts recording and removes it when it stops; nothing else ever should.
 *
 * COST WHEN OFF: one module-level null check per action call and per atom
 * write. Nothing is timed, cloned, or serialized until a tap exists.
 *
 * Values arrive RAW. A tap must project them (`core/serialize.ts`) before it
 * stores them — holding a raw reference in a buffer would retain whatever the
 * app put in the atom, DOM nodes included.
 */

/** One `Service.action` invocation, as the kernel saw it. */
export interface TappedAction {
  /** Injected-clock timestamp taken when the call started. */
  readonly at: number;
  /** Owning service's class name; empty before the service finishes registering. */
  readonly service: string;
  /** Owning service's registry id, so a tap can look up its group. */
  readonly serviceId: string;
  /** The action's declared name. */
  readonly action: string;
  /** Raw call arguments — project before storing. */
  readonly args: readonly unknown[];
  /** Wall time the action body took, in milliseconds. */
  readonly durationMs: number;
}

/** One atom write that actually changed the value (`Object.is`-equal writes never reach a tap). */
export interface TappedState {
  /** Injected-clock timestamp of the write. */
  readonly at: number;
  /** Owning service's class name; empty before the service finishes registering. */
  readonly service: string;
  /** Owning service's registry id, so a tap can look up its group. */
  readonly serviceId: string;
  /** The atom's declared name. */
  readonly atom: string;
  /** Raw value before the write — project before storing. */
  readonly previous: unknown;
  /** Raw value after the write — project before storing. */
  readonly next: unknown;
}

/** What an installed recorder receives. Both methods must be cheap and must never throw. */
export interface WheelTap {
  /** An action ran to completion (or threw — `durationMs` still reflects the attempt). */
  action(call: TappedAction): void;
  /** An atom moved to a genuinely different value. */
  state(change: TappedState): void;
}

let installed: WheelTap | null = null;

/**
 * Install (or, with `null`, remove) the process-wide recording tap.
 *
 * There is exactly one. Two wheel apps on the same page (a docs embed page)
 * share it, which is why every entry carries its service name.
 */
export function setWheelTap(tap: WheelTap | null): void {
  installed = tap;
}

/** The installed tap, or null. Called on every action and every atom write — keep it trivial. */
export function wheelTap(): WheelTap | null {
  return installed;
}
