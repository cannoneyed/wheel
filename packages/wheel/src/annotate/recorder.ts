/**
 * The recorder: a capped, time-ordered log of what the app actually did.
 *
 * It listens in four places and merges them into one stream:
 *
 *   - the kernel tap (`core/recorder-tap.ts`) — every named action and every
 *     atom transition, which is the semantic half nothing else can give;
 *   - the document — real clicks, keys, pointers, focus and scroll, each
 *     mapped to the component that owns the element it hit;
 *   - `fetch` — method, url, status, round-trip time;
 *   - the address bar — `popstate` / `hashchange`, so navigation shows up
 *     even in an app that does not use wheel's router.
 *
 * Two more streams are NOT tapped, because the app already records them: sync
 * writes live in the client's provenance log and errors live in the error
 * buffer. Both are timestamped, so a clip harvests its slice of each at save
 * time instead of duplicating them here (`harvest`).
 *
 * ## Why it does not blow up
 *
 * Two dangers, both handled at write time rather than at save time:
 *
 * 1. **Big values.** Atoms hold whole tables. Storing before-and-after for
 *    every write would produce megabyte clips, so an object-to-object change
 *    is stored as the top-level keys that DIFFER, and everything else goes
 *    through `serializeValue`'s bounds.
 * 2. **Hot atoms.** A pointer-drag can drive an atom once per frame. Writes to
 *    the same atom inside {@link COALESCE_MS} collapse into ONE entry that
 *    keeps the first `from`, the latest `to`, and a count — so a 400-frame
 *    drag is one line saying "×400", not 400 lines.
 *
 * Nothing raw is retained: every value is projected the moment it arrives, so
 * the buffer can never hold a DOM node or a live service alive.
 */
import type { DebugRegistry } from '../core/debug-registry';
import { setWheelTap, type TappedAction, type TappedState } from '../core/recorder-tap';
import { serializeValue } from '../core/serialize';

import { describeElement } from './anchor';
import type { RecordedEvent, RecordedState } from './types';

/** Writes to one atom closer together than this collapse into a single entry. */
const COALESCE_MS = 80;

/** How many recent entries a coalesce check looks back through. */
const COALESCE_SCAN = 32;

/** How many recent entries an action may be reordered past to sit before its own effects. */
const ORDER_SCAN = 64;

/** Scroll on one target reports at most this often. */
const SCROLL_THROTTLE_MS = 250;

/** Hard cap on buffered events, clip or no clip — the backstop against an unbounded session. */
const HARD_CAPACITY = 20_000;

/** How far back the always-on retro buffer reaches when no clip is running. */
const RETRO_WINDOW_MS = 60_000;

/** How many events the retro buffer keeps when no clip is running. */
const RETRO_CAPACITY = 2_000;

/**
 * How many logically-dropped entries accumulate before the buffer is compacted.
 *
 * Dropping one entry per write by re-slicing the array is O(n) PER WRITE, and
 * at capacity that is the single most expensive thing a recording does — it
 * measured 17µs per action once the buffer filled. Advancing a head pointer
 * instead keeps pruning exact and makes compaction amortized O(1).
 */
const COMPACT_BATCH = 512;

/** Depth used for action arguments and atom values — shallower than a bridge read, on purpose. */
const VALUE_DEPTH = 4;

/** The DOM events worth recording. Anything not here is noise for this purpose. */
const INPUT_EVENTS = ['pointerdown', 'click', 'dblclick', 'keydown', 'focusin', 'change', 'scroll'] as const;

/** Runtime seams the recorder needs, so tests can drive it without a browser or a real clock. */
export interface RecorderOptions {
  /** The injected clock — the same one the services use, so timestamps line up. */
  readonly now: () => number;
  /** The component registry, for mapping an event target to the component that owns it. */
  readonly registry: DebugRegistry;
  /** Event target the input listeners attach to. Defaults to `document`. */
  readonly root?: Document;
  /** The window whose `fetch` and navigation are tapped. Defaults to `globalThis`. */
  readonly host?: typeof globalThis;
}

/** Which optional streams a recording captures. Both default ON (the 021 ruling: maximal capture). */
export interface RecorderStreams {
  /** Wrap `fetch` and log method / url / status / duration. */
  readonly network: boolean;
  /** Record real DOM input events. */
  readonly input: boolean;
}

/**
 * A projected before/after pair, or the changed keys when the values were
 * objects (see the module doc).
 */
function diffValues(previous: unknown, next: unknown): Pick<RecordedState, 'from' | 'to' | 'changed'> {
  const bothPlainObjects =
    typeof previous === 'object' &&
    previous !== null &&
    !Array.isArray(previous) &&
    typeof next === 'object' &&
    next !== null &&
    !Array.isArray(next);
  if (!bothPlainObjects) {
    return { from: serializeValue(previous, VALUE_DEPTH), to: serializeValue(next, VALUE_DEPTH) };
  }
  const before = previous as Record<string, unknown>;
  const after = next as Record<string, unknown>;
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!Object.is(before[key], after[key])) {
      changed[key] = {
        from: serializeValue(before[key], VALUE_DEPTH),
        to: serializeValue(after[key], VALUE_DEPTH)
      };
    }
  }
  // An object whose identity changed but whose keys all match still deserves a
  // line — fall back to whole values so the entry is never empty.
  if (Object.keys(changed).length === 0) {
    return { from: serializeValue(previous, VALUE_DEPTH), to: serializeValue(next, VALUE_DEPTH) };
  }
  return { changed };
}

/** Structural equality over already-projected values. */
function sameValue(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge a newer state entry into the one it coalesces with: keep the oldest
 * `from`, take the newest `to`. Returns null when merging would ERASE the
 * change.
 *
 * The null case matters. A value that goes `null → id → null` inside the
 * coalesce window merges to `null → null`, which reads as "nothing happened"
 * — the exact opposite of the truth. Refusing the merge keeps the churn
 * visible as two entries.
 */
function mergeState(existing: RecordedState, incoming: RecordedState): RecordedState | null {
  const count = (existing.count ?? 1) + (incoming.count ?? 1);
  if (existing.changed && incoming.changed) {
    const changed = { ...existing.changed };
    for (const [key, value] of Object.entries(incoming.changed)) {
      changed[key] = { from: changed[key]?.from ?? value.from, to: value.to };
    }
    if (Object.values(changed).every((entry) => sameValue(entry.from, entry.to))) return null;
    return { ...existing, at: incoming.at, changed, count };
  }
  if (existing.changed || incoming.changed) {
    // Shapes disagree (an object became a primitive, or the reverse). The
    // newer entry is the honest one; keep it and carry the count.
    return { ...incoming, count };
  }
  if (sameValue(existing.from, incoming.to)) return null;
  return { ...existing, at: incoming.at, to: incoming.to, count };
}

/**
 * The event buffer plus its taps. One per app; `AnnotateService` owns it.
 *
 * Always-on in dev (the retro buffer), explicitly bounded when a clip is
 * running. `install()` / `uninstall()` are the only things that touch global
 * state, and both are idempotent.
 */
export class Recorder {
  private readonly options: RecorderOptions;
  private events: RecordedEvent[] = [];
  /** Entries before this index are dropped; the array is compacted in batches. */
  private head = 0;
  private streams: RecorderStreams = { network: true, input: true };
  private clipStart: number | null = null;
  private running = false;
  private lastScrollAt = 0;
  private lastUrl = '';
  private originalFetch: typeof globalThis.fetch | null = null;
  private detach: Array<() => void> = [];

  constructor(options: RecorderOptions) {
    this.options = options;
  }

  /** Whether the taps are currently installed. */
  active(): boolean {
    return this.running;
  }

  /** The current buffer, oldest first. */
  timeline(): readonly RecordedEvent[] {
    return this.head === 0 ? this.events : this.events.slice(this.head);
  }

  /**
   * Install every tap. Idempotent, so arming annotation mode twice is safe.
   *
   * `streams` decides only the optional taps; the kernel tap is what makes a
   * recording a recording and is always installed.
   */
  install(streams: Partial<RecorderStreams> = {}): void {
    if (this.running) return;
    this.streams = { ...this.streams, ...streams };
    this.running = true;
    this.lastUrl = this.currentUrl();
    setWheelTap({
      action: (call) => this.onAction(call),
      state: (change) => this.onState(change)
    });
    if (this.streams.input) this.installInput();
    if (this.streams.network) this.installNetwork();
    this.installNavigation();
  }

  /** Remove every tap and restore `fetch`. Keeps the buffer — stopping is not forgetting. */
  uninstall(): void {
    if (!this.running) return;
    this.running = false;
    setWheelTap(null);
    for (const off of this.detach.splice(0)) off();
    const host = this.options.host ?? globalThis;
    if (this.originalFetch) {
      host.fetch = this.originalFetch;
      this.originalFetch = null;
    }
  }

  /** Drop everything buffered. */
  clear(): void {
    this.events = [];
    this.head = 0;
  }

  /**
   * Begin an explicit clip at `at` (defaults to now): from here on, age-based
   * pruning stops so a long recording keeps its whole history.
   */
  startClip(at = this.options.now()): void {
    this.clipStart = at;
  }

  /** End the explicit clip; the buffer goes back to behaving as a retro window. */
  endClip(): void {
    this.clipStart = null;
  }

  /** When the current clip started, or null when only the retro buffer is running. */
  clipStartedAt(): number | null {
    return this.clipStart;
  }

  /**
   * The slice of the buffer between two timestamps, oldest first, merged with
   * the two streams the app already records for itself.
   *
   * `extra` comes from the caller because sync writes and errors live behind
   * the sync client and the error buffer, which the recorder does not own.
   */
  harvest(from: number, to: number, extra: readonly RecordedEvent[] = []): RecordedEvent[] {
    return [...this.timeline(), ...extra]
      .filter((event) => event.at >= from && event.at <= to)
      .sort((a, b) => a.at - b.at);
  }

  /** Append one event, coalescing and ordering as it goes. */
  private push(event: RecordedEvent): void {
    if (event.kind === 'state' && this.coalesceState(event)) return;
    if (event.kind === 'action') this.insertAction(event);
    else this.events.push(event);
    this.prune();
  }

  /**
   * Fold a state change into a recent entry for the same atom, if there is one.
   *
   * It scans BACK rather than only checking the last event, because the writes
   * a drag produces are not adjacent: every frame is `action, state, action,
   * state…`, so a check of the immediate predecessor would never fire and a
   * 400-frame drag would fill the buffer.
   */
  private coalesceState(event: RecordedState): boolean {
    for (let index = this.events.length - 1; index >= this.head; index -= 1) {
      if (this.events.length - index > COALESCE_SCAN) break;
      const candidate = this.events[index]!;
      if (event.at - candidate.at > COALESCE_MS) break;
      if (candidate.kind === 'state' && candidate.service === event.service && candidate.atom === event.atom) {
        const merged = mergeState(candidate, event);
        if (!merged) return false;
        this.events[index] = merged;
        return true;
      }
    }
    return false;
  }

  /**
   * Put an action where it belongs: after its CAUSE, before its EFFECTS.
   *
   * The kernel taps an action when it RETURNS (that is the only place its
   * duration is known), so by then its own state changes are already buffered.
   * Appending would print every effect above its cause — the one thing a
   * timeline must never do.
   *
   * The move stops at anything that is itself a cause: an input at the same
   * millisecond is the click that RAN this action, and an action at the same
   * millisecond is the outer call that invoked it. Only writes, state changes
   * and requests get stepped over.
   */
  private insertAction(event: RecordedEvent): void {
    let index = this.events.length;
    while (index > this.head && this.events.length - index < ORDER_SCAN) {
      const candidate = this.events[index - 1]!;
      if (candidate.at < event.at) break;
      if (candidate.at === event.at && (candidate.kind === 'action' || candidate.kind === 'input')) break;
      index -= 1;
    }
    this.events.splice(index, 0, event);
  }

  /**
   * Keep the buffer bounded. While a clip runs, only the hard cap applies —
   * a five-minute recording is allowed to be five minutes long. With no clip,
   * the buffer is a rolling 60-second window.
   */
  private prune(): void {
    const live = this.events.length - this.head;
    if (live > HARD_CAPACITY) this.head += live - HARD_CAPACITY;
    if (this.clipStart === null) {
      const cutoff = this.options.now() - RETRO_WINDOW_MS;
      while (this.head < this.events.length && this.events[this.head]!.at < cutoff) this.head += 1;
      const overflow = this.events.length - this.head - RETRO_CAPACITY;
      if (overflow > 0) this.head += overflow;
    }
    // Reclaim only once enough entries are dead, so the copy is amortized.
    if (this.head >= COMPACT_BATCH) {
      this.events = this.events.slice(this.head);
      this.head = 0;
    }
  }

  /**
   * Wheel's own debug services (the annotator, the inspector, the snapshot
   * tool) write atoms like anything else. Recording them would fill a clip
   * with the act of recording — so the same `group: 'debug'` rule that hides
   * them from the state tree hides them from the timeline.
   */
  private isOwnChrome(serviceId: string): boolean {
    return this.options.registry.serviceGroup(serviceId) === 'debug';
  }

  private onAction(call: TappedAction): void {
    if (this.isOwnChrome(call.serviceId)) return;
    this.push({
      at: call.at,
      kind: 'action',
      service: call.service,
      action: call.action,
      args: call.args.map((arg) => serializeValue(arg, VALUE_DEPTH)),
      durationMs: call.durationMs
    });
  }

  private onState(change: TappedState): void {
    if (this.isOwnChrome(change.serviceId)) return;
    this.push({
      at: change.at,
      kind: 'state',
      service: change.service,
      atom: change.atom,
      ...diffValues(change.previous, change.next)
    });
  }

  private installInput(): void {
    const root = this.options.root ?? (typeof document === 'undefined' ? null : document);
    // Headless hosts (node tests, SSR) have no document to listen to; the
    // kernel tap still records everything the app DID there.
    if (!root) return;
    for (const type of INPUT_EVENTS) {
      const handler = (event: Event): void => this.onInput(type, event);
      // listener boundary: the recorder observes real input in the capture
      // phase so an app handler that stops propagation cannot hide it.
      root.addEventListener(type, handler, { capture: true, passive: true });
      this.detach.push(() => root.removeEventListener(type, handler, { capture: true }));
    }
  }

  private onInput(type: string, event: Event): void {
    const at = this.options.now();
    if (type === 'scroll') {
      if (at - this.lastScrollAt < SCROLL_THROTTLE_MS) return;
      this.lastScrollAt = at;
    }
    const target = event.target instanceof Element ? event.target : null;
    const record = target ? this.options.registry.instanceAt(target) : undefined;
    this.push({
      at,
      kind: 'input',
      type,
      instanceId: record?.instanceId ?? null,
      target: target ? describeElement(target) : 'document',
      detail: inputDetail(event)
    });
    this.checkUrl(at);
  }

  private installNetwork(): void {
    const host = this.options.host ?? globalThis;
    const original = host.fetch;
    if (typeof original !== 'function') return;
    this.originalFetch = original;
    // The wrapper stands in for `fetch` itself; the cast is because the DOM
    // type carries extras (`preconnect`) a plain function cannot declare.
    const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const at = this.options.now();
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      const url = input instanceof Request ? input.url : String(input);
      try {
        const response = await original(input, init);
        this.push({
          at,
          kind: 'network',
          method,
          url,
          status: response.status,
          durationMs: this.options.now() - at
        });
        return response;
      } catch (error) {
        this.push({ at, kind: 'network', method, url, status: null, durationMs: this.options.now() - at });
        throw error;
      }
    };
    host.fetch = wrapped as unknown as typeof globalThis.fetch;
  }

  private installNavigation(): void {
    const host = this.options.host ?? globalThis;
    if (typeof host.addEventListener !== 'function') return;
    for (const type of ['popstate', 'hashchange']) {
      const handler = (): void => this.checkUrl(this.options.now());
      // listener boundary: navigation is a timeline event; the recorder only
      // reads the address bar, it never writes it.
      host.addEventListener(type, handler);
      this.detach.push(() => host.removeEventListener(type, handler));
    }
  }

  /** Emit a route event when the address bar has moved since the last check. */
  private checkUrl(at: number): void {
    const url = this.currentUrl();
    if (url === this.lastUrl) return;
    this.lastUrl = url;
    this.push({ at, kind: 'route', url });
  }

  private currentUrl(): string {
    // wheel-raw-location: the annotator RECORDS the address bar as the user
    // saw it and never navigates. Reading the router's atom instead would miss
    // every app that does not use wheel's router — and headless hosts have no
    // address bar at all, which is not an error.
    const host = this.options.host ?? globalThis;
    return (host as { location?: { href?: string } }).location?.href ?? '';
  }
}

/** Event-specific extras worth keeping: where the pointer was, which key was pressed. */
function inputDetail(event: Event): Record<string, unknown> {
  if (event instanceof KeyboardEvent) {
    return {
      key: event.key,
      ...(event.metaKey ? { meta: true } : {}),
      ...(event.ctrlKey ? { ctrl: true } : {}),
      ...(event.shiftKey ? { shift: true } : {}),
      ...(event.altKey ? { alt: true } : {})
    };
  }
  if (event instanceof MouseEvent) {
    return { x: Math.round(event.clientX), y: Math.round(event.clientY), button: event.button };
  }
  return {};
}

/**
 * Every service's atoms and computed values right now, keyed by service name.
 *
 * A clip stores this as its START STATE — a timeline of actions is only
 * re-runnable against a known starting point, which is what makes replay
 * reachable later.
 */
export function stateTreeSnapshot(registry: DebugRegistry): Record<string, Record<string, unknown>> {
  const snapshot = registry.snapshot();
  const serviceNames = new Map(snapshot.services.map((service) => [service.id, service.name] as const));
  const tree: Record<string, Record<string, unknown>> = {};
  for (const { meta, value } of snapshot.primitives) {
    if (meta.kind === 'action') continue;
    const service = meta.serviceName ?? serviceNames.get(meta.serviceId ?? '') ?? 'unowned';
    const bucket = tree[service] ?? (tree[service] = {});
    bucket[meta.name] = serializeValue(value, VALUE_DEPTH);
  }
  return tree;
}
