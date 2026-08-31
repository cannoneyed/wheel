/**
 * wheel's service kernel on Solid signals.
 *
 * Solid's signals ARE the renderer's reactivity system, so no adapter
 * machinery sits between state and render (no global mutation tick, no
 * read-tick collection, no external-store subscription glue): an atom is a
 * signal, a computed is a disposable memo, and components track exactly what
 * they read.
 *
 * Invalidation channels:
 * - Atom writes notify through their own signals (fine-grained).
 * - Client data (deltas, subscription arrivals) bumps one context-level
 *   revision signal that liveQuery views read. Atom writes never touch it.
 *
 * This module is the `core` kernel: it depends on nothing from `sync`. The
 * data-backed half — `SyncService`, `liveQuery`, `mutate` — lives in
 * `sync/sync-service.ts` and narrows the kernel's `ContextClient` seam to the
 * full sync client at one documented boundary.
 */

import {
  batch,
  createMemo,
  createRoot,
  createSignal,
  getOwner,
  runWithOwner,
  type Accessor,
  type Owner,
  type Setter
} from 'solid-js';

import { enableMapSet, freeze, produce, type Draft } from 'immer';
import {
  createActor,
  type Actor,
  type ActorOptions,
  type AnyStateMachine,
  type EventFromLogic,
  type InputFrom,
  type SnapshotFrom
} from 'xstate';

import { canonicalParams } from './params';
import { captureDeclSite } from './decl-site';
import { DebugRegistry, type DebugMeta } from './debug-registry';
import {
  systemClock,
  systemDefer,
  type Clock,
  type Defer
} from './runtime-defaults';

// Draft-able Set/Map support for atom.update. Immer also installs
// mutation-throwing methods when those collections cross the atom boundary.
enableMapSet();

/** Writable reactive cell. Reads are tracked by whatever computation reads them. */
export interface Atom<T> {
  get(): T;
  /** Replace the whole value. For nested changes prefer `update`. */
  set(value: T): void;
  /**
   * Update through an immer draft: write "mutations" against the draft, get a
   * new immutable value with structural sharing (untouched branches keep
   * identity, so downstream memos don't invalidate spuriously).
   */
  update(recipe: (draft: Draft<T>) => void): void;
  readonly __debugMeta: DebugMeta;
}

/** Mutable cell with debug history and no reactive or immutable-state behavior. */
export interface Field<T> {
  /** Read the current value without creating a Solid dependency. */
  get(): T;
  /** Replace the current value and append one debug-history entry. */
  set(value: T): void;
  readonly __debugMeta: DebugMeta;
}

/**
 * A KEYED derived value: callable with arguments, one memoized node per
 * canonical argument tuple. Unlike `computed` (a plain zero-arg derivation),
 * this retains one live memo per distinct key until the service disposes —
 * there is NO LRU and NO eviction, so a memo a mounted component is observing
 * can never be silently dropped out from under it. Returned by `computedFor`.
 */
export type ComputedFor<Args extends readonly unknown[], T> = ((...args: Args) => T) & {
  readonly __debugMeta: DebugMeta;
  /** Dispose one canonical argument tuple. A later read recreates it. */
  release(...args: Args): boolean;
  /** Dispose every currently materialized tuple. */
  clear(): void;
  /** Number of currently materialized tuples. */
  size(): number;
};

/** A plain zero-arg derivation carrying debug provenance. Returned by `computed`. */
export type ComputedAccessor<T> = Accessor<T> & { readonly __debugMeta: DebugMeta };

/** Typed event builders exposed as named Service actions by `machine()`. */
export type MachineTransitionCreators<TMachine extends AnyStateMachine> = Readonly<
  Record<string, (...args: any[]) => EventFromLogic<TMachine>>
>;

/** Named, typed actions that send events to one Service-owned machine actor. */
export type MachineTransitionActions<
  TCreators extends Readonly<Record<string, (...args: any[]) => unknown>>
> = {
  readonly [K in keyof TCreators]: (...args: Parameters<TCreators[K]>) => void;
};

type MachineInputOption<TMachine extends AnyStateMachine> =
  undefined extends InputFrom<TMachine>
    ? { readonly input?: InputFrom<TMachine> }
    : { readonly input: InputFrom<TMachine> };

/** Options for `Service.machine()`: actor input plus its public transition actions. */
export type ServiceMachineOptions<
  TMachine extends AnyStateMachine,
  TCreators extends MachineTransitionCreators<TMachine>
> = MachineInputOption<TMachine> & {
  readonly transitions: TCreators;
};

/** Reactive XState snapshot read carried by a Service-owned machine. */
export type MachineStateAccessor<TMachine extends AnyStateMachine> =
  Accessor<SnapshotFrom<TMachine>> & { readonly __debugMeta: DebugMeta };

/** One Service-owned XState actor with reactive state and named transition actions. */
export interface ServiceMachine<
  TMachine extends AnyStateMachine,
  TCreators extends MachineTransitionCreators<TMachine>
> {
  readonly state: MachineStateAccessor<TMachine>;
  readonly transitions: MachineTransitionActions<TCreators>;
}

interface MachineHistoryEntry {
  readonly at: number;
  readonly event: string;
  readonly state: unknown;
}

const MACHINE_HISTORY_LIMIT = 50;

interface FieldHistoryEntry {
  readonly at: number;
  readonly previous: unknown;
  readonly current: unknown;
}

const FIELD_HISTORY_LIMIT = 50;
const FIELD_DEBUG_DEPTH = 4;
const FIELD_DEBUG_KEYS = 50;

/** Bounded, getter-free projection for live handles and mutable field history. */
function fieldDebugValue(value: unknown, depth = FIELD_DEBUG_DEPTH, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'bigint') return `${String(value)}n`;
  if (type === 'function') return `<function ${(value as { name?: string }).name || 'anonymous'}>`;
  if (type !== 'object') return String(value);

  const object = value as object;
  if (seen.has(object)) return '<circular>';
  const constructorName = (object as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
  if (depth <= 0) return `<${constructorName}>`;
  seen.add(object);
  try {
    if (Array.isArray(object)) {
      const projected = object.slice(0, FIELD_DEBUG_KEYS).map((item) => fieldDebugValue(item, depth - 1, seen));
      if (object.length > FIELD_DEBUG_KEYS) projected.push(`…+${object.length - FIELD_DEBUG_KEYS} more`);
      return projected;
    }
    if (object instanceof Set) {
      return fieldDebugValue([...object].slice(0, FIELD_DEBUG_KEYS), depth - 1, seen);
    }
    if (object instanceof Map) {
      return Object.fromEntries(
        [...object.entries()].slice(0, FIELD_DEBUG_KEYS).map(([key, entry]) => [
          String(key),
          fieldDebugValue(entry, depth - 1, seen)
        ])
      );
    }
    const prototype = Object.getPrototypeOf(object) as object | null;
    if (prototype !== Object.prototype && prototype !== null) return `<${constructorName}>`;

    const projected: Record<string, unknown> = {};
    const keys = Object.keys(object);
    for (const key of keys.slice(0, FIELD_DEBUG_KEYS)) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      projected[key] = descriptor?.get
        ? `<accessor ${key}>`
        : fieldDebugValue(descriptor?.value, depth - 1, seen);
    }
    if (keys.length > FIELD_DEBUG_KEYS) projected['…'] = `+${keys.length - FIELD_DEBUG_KEYS} more`;
    return projected;
  } catch (error) {
    return `<unavailable: ${error instanceof Error ? error.message : String(error)}>`;
  } finally {
    seen.delete(object);
  }
}

/**
 * Latest-call-wins token for one service async chain. Opening a new task on
 * the same service aborts this token and makes every pending `wait` reject.
 */
export interface LatestAsyncTask {
  /** Pass this signal to APIs such as `fetch` so they can stop in-flight work. */
  readonly signal: AbortSignal;
  /** Wait for one step and reject with `AbortError` if this task is superseded. */
  wait<T>(task: PromiseLike<T>): Promise<T>;
}

/**
 * Constructor shape every service must have — one ServiceContext argument, so
 * the container can build any service the same way (and tests can too).
 */
export type ServiceClass<S extends Service = Service> = new (context: ServiceContext) => S;

/**
 * The minimum the kernel needs from a client: a change-subscription seam.
 *
 * The core `ServiceContext` holds only this — it subscribes once and bumps its
 * revision signal whenever the client reports a data change. It never
 * subscribes queries or fires mutations; those live on the full sync client
 * (`SyncClient`), which `SyncService` narrows to at one documented boundary.
 * Keeping the kernel's dependency this narrow is what lets core compile with no
 * knowledge of the sync layer.
 */
export interface ContextClient {
  /**
   * Subscribe to every client-data change; returns an unsubscribe.
   *
   * `changedCollections` names the collections whose EFFECTIVE rows moved in this
   * change: an empty set is a data-free change (connection status, mutation
   * lifecycle, presence), and `undefined` means "assume everything" (a
   * reconnect bootstrap, or a client that does not track collections). The
   * context uses it to bump per-collection version signals, so a live query over
   * one collection stops re-deriving when a write lands in another.
   */
  onChange(cb: (changedCollections?: ReadonlySet<string>) => void): () => void;
  /** Optional injected wall-clock read shared with client-backed services. */
  now?(): number;
  /** Optional injected one-shot scheduler shared with client-backed services. */
  schedule?(ms: number, fn: () => void): () => void;
}

/**
 * Marker a service class sets to opt into scope inheritance under
 * `inheritServices: 'live'`. Core defines the symbol and reads it in
 * `shouldInherit`; `SyncService` sets it to `true`. This is the seam that lets
 * the kernel decide "should this class inherit through the parent scope?"
 * WITHOUT naming the sync `SyncService` class (the layering violation the
 * previous `instanceof SyncService` check baked in). Static fields are
 * inherited down the constructor chain, so every `SyncService` subclass carries
 * the marker automatically; plain `Service` subclasses never do.
 */
export const INHERIT_SCOPE = Symbol('wheel.inheritScope');

/**
 * Deep-freeze a value so mutation outside the happy path throws (in strict
 * mode) instead of silently corrupting state. Applied to every atom write —
 * the framework depends on data being immutable, so this is on always, not
 * just in dev. Immer's deep freeze replaces Set/Map mutators with throwing
 * functions while preserving draft updates. Date is rejected because its
 * internal timestamp remains mutable even when the object is frozen; store a
 * number instead.
 */
export function freezeDeep<T>(value: T): T {
  rejectDates(value, new WeakSet<object>());
  return freeze(value, true);
}

function rejectDates(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  if (value instanceof Date) {
    throw new TypeError('Atom values cannot contain Date objects; store an epoch-millisecond number instead');
  }
  seen.add(value);
  if (value instanceof Map) {
    for (const [key, entry] of value) {
      rejectDates(key, seen);
      rejectDates(entry, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const entry of value) rejectDates(entry, seen);
    return;
  }
  for (const key of Object.keys(value)) {
    rejectDates((value as Record<string, unknown>)[key], seen);
  }
}

/**
 * Construction options for a ServiceContext — the client it syncs through,
 * the parent scope it inherits from, and how much of the parent it inherits.
 */
export interface ServiceContextOptions {
  client?: ContextClient;
  parent?: ServiceContext;
  scopeId?: string;
  /** Fixed/stepping clock for clientless contexts; client-backed roots use the client's clock. */
  clock?: Clock;
  /** Controlled one-shot scheduler for clientless contexts; client-backed roots use the client's scheduler. */
  defer?: Defer;
  /**
   * Which services resolve through the parent: `true` = all, `false` = none,
   * `'live'` = only SyncService subclasses (local UI state isolates, shared
   * data singletons and the client inherit).
   */
  inheritServices?: boolean | 'live';
}

/** Explicit cleanup ownership for a service override. */
export type ServiceOverrideOptions =
  | { ownership: 'caller' }
  | { ownership: 'context' };

interface ServiceOverride {
  readonly instance: Service;
  readonly ownership: ServiceOverrideOptions['ownership'];
}

/**
 * Hierarchical DI container owning every service singleton, the Solid
 * ownership root all service primitives live under, and the debug registry.
 */
export class ServiceContext {
  /** Debug graph for this tree — shared with the parent so the panel sees one graph. */
  readonly registry: DebugRegistry;
  /** Human-readable scope path (`root/child/...`) used in error messages. */
  readonly scopeId: string;

  private readonly instances = new Map<ServiceClass, Service>();
  private readonly overrides = new Map<ServiceClass, ServiceOverride>();
  private readonly constructing: ServiceClass[] = [];
  private readonly parent: ServiceContext | undefined;
  private readonly inheritServices: boolean | 'live';
  private readonly clientRef: ContextClient | undefined;
  private readonly nowRef: () => number;
  private readonly scheduleRef: (ms: number, fn: () => void) => () => void;
  private readonly children = new Set<ServiceContext>();

  private owner: Owner | null = null;
  private disposeRoot: (() => void) | null = null;
  private readonly version: Accessor<number>;
  private readonly bumpVersion: () => void;
  /** Per-collection data revisions, minted lazily by `trackCollection`. */
  private readonly collectionVersions = new Map<string, { version: Accessor<number>; bump: () => void }>();
  private readonly debugVersion: Accessor<number>;
  private releaseClient: (() => void) | null = null;
  private disposed = false;

  constructor(options: ServiceContextOptions = {}) {
    this.parent = options.parent;
    this.clientRef = options.client ?? options.parent?.clientRef;
    this.nowRef =
      options.clock?.now.bind(options.clock) ??
      options.parent?.nowRef ??
      this.clientRef?.now?.bind(this.clientRef) ??
      systemClock.now;
    this.scheduleRef =
      options.defer?.schedule.bind(options.defer) ??
      options.parent?.scheduleRef ??
      this.clientRef?.schedule?.bind(this.clientRef) ??
      systemDefer.schedule;
    this.inheritServices = options.inheritServices ?? true;
    this.scopeId = options.scopeId ?? (options.parent ? `${options.parent.scopeId}/child` : 'root');
    this.registry = options.parent ? options.parent.registry : new DebugRegistry();
    createRoot((dispose) => {
      this.disposeRoot = dispose;
      this.owner = getOwner();
    });
    const [version, setVersion] = createSignal(0);
    this.version = version;
    this.bumpVersion = () => setVersion((v) => v + 1);
    const [debugVersion, setDebugVersion] = createSignal(0);
    this.debugVersion = debugVersion;
    if (!options.parent) {
      // Root context owns the registry. Registry-only changes get their OWN
      // signal (trackDebug) — they must NOT ride the client-data revision
      // channel: every liveQuery read tracks that channel, so bumping it per
      // mount makes row components re-derive their vms on mount, which
      // remounts rows, which bumps again — a feedback loop that starves
      // long lists. Channel doctrine: data invalidation and debug-surface
      // invalidation never share a wire.
      this.registry.onChange = () => setDebugVersion((v) => v + 1);
    }
    if (this.clientRef) {
      // One client listener per context that owns a client reference; child
      // contexts sharing the parent's client get their own cheap listener so
      // dispose stays local.
      this.releaseClient = this.clientRef.onChange((changedCollections) => this.bumpCollections(changedCollections));
    }
    options.parent?.children.add(this);
  }

  /**
   * The context's client, or throw for clientless (pure local-state) contexts.
   * Returns the narrow `ContextClient` the kernel holds; `SyncService` narrows
   * the result to the full `SyncClient` at its single documented boundary.
   */
  requireClient(): ContextClient {
    if (!this.clientRef) {
      throw new Error(
        `ServiceContext '${this.scopeId}' has no SyncClient — SyncService requires a client-backed provider`
      );
    }
    return this.clientRef;
  }

  /** Whether this context (or an ancestor) carries a sync client. */
  hasClient(): boolean {
    return this.clientRef !== undefined;
  }

  /** Deterministic epoch-millisecond read; no ticking signal or global clock service. */
  now(): number {
    return this.nowRef();
  }

  /** Deterministic one-shot scheduling seam; returns cancellation. */
  schedule(ms: number, fn: () => void): () => void {
    return this.scheduleRef(ms, fn);
  }

  /** Tracked read of the client-data revision. liveQuery views call this. */
  trackVersion(): number {
    return this.version();
  }

  /**
   * Tracked read of ONE collection's data revision. This is the narrow channel
   * `liveQuery.rows` rides: it moves only when that collection's effective rows
   * moved, so a write to another collection re-derives nothing. The signal is
   * minted lazily on first track; a collection nobody tracks costs nothing.
   */
  trackCollection(name: string): number {
    let signal = this.collectionVersions.get(name);
    if (!signal) {
      const [version, setVersion] = createSignal(0);
      signal = { version, bump: () => setVersion((v) => v + 1) };
      this.collectionVersions.set(name, signal);
    }
    return signal.version();
  }

  /**
   * @internal Invalidate the revision channels for one client change. The
   * COARSE channel (`trackVersion`) always bumps — status, presence and
   * mutation-lifecycle readers ride it. The per-collection channels bump only for
   * the collections named; `undefined` (unknown scope) bumps them all.
   */
  bumpCollections(changedCollections?: ReadonlySet<string>): void {
    batch(() => {
      this.bumpVersion();
      if (changedCollections === undefined) {
        for (const signal of this.collectionVersions.values()) {
          signal.bump();
        }
        return;
      }
      for (const name of changedCollections) {
        this.collectionVersions.get(name)?.bump();
      }
    });
  }

  /**
   * Tracked read of the debug revision. Instance changes, visibility reports,
   * and field writes bump it. Application data must never track this signal.
   */
  trackDebug(): number {
    return this.debugVersion();
  }

  /**
   * @internal Non-client invalidation of the revision channels (subscription
   * arrival/error, test-driven fakes). No scope information, so it bumps the
   * coarse channel AND every per-collection channel — the conservative read of
   * "something changed".
   */
  bump(): void {
    this.bumpCollections(undefined);
  }

  /** Resolve (or lazily construct) the singleton for a service class. */
  get<S extends Service>(ServiceType: ServiceClass<S>): S {
    const override = this.overrides.get(ServiceType);
    if (override) return override.instance as S;
    const existing = this.instances.get(ServiceType);
    if (existing) return existing as S;
    if (this.parent && this.shouldInherit(ServiceType)) {
      return this.parent.get(ServiceType);
    }
    if (this.constructing.includes(ServiceType)) {
      const chain = [...this.constructing.map((c) => c.name), ServiceType.name].join(' → ');
      throw new Error(`Circular service dependency: ${chain}`);
    }
    this.constructing.push(ServiceType);
    try {
      const instance = runWithOwner(this.owner, () => new ServiceType(this))!;
      this.instances.set(ServiceType, instance);
      instance.__registerPrimitives();
      return instance;
    } finally {
      this.constructing.pop();
    }
  }

  /**
   * Inject a replacement before first resolution.
   *
   * Ownership is mandatory: caller-owned replacements are reusable and never
   * touched by this context; context-owned replacements receive `__destroy()`
   * when the scope disposes.
   */
  override<S extends Service>(
    ServiceType: ServiceClass<S>,
    instance: S,
    options: ServiceOverrideOptions
  ): void {
    if (this.instances.has(ServiceType)) {
      throw new Error(`Cannot override ${ServiceType.name}: already instantiated in '${this.scopeId}'`);
    }
    if (this.overrides.has(ServiceType)) {
      throw new Error(`Cannot override ${ServiceType.name}: override already registered in '${this.scopeId}'`);
    }
    this.overrides.set(ServiceType, { instance, ownership: options.ownership });
  }

  /** Create a child scope (own singletons, inherited per `inheritServices`). */
  child(options: Omit<ServiceContextOptions, 'parent' | 'client'> = {}): ServiceContext {
    if (this.disposed) {
      throw new Error(`Cannot create a child of disposed ServiceContext '${this.scopeId}'`);
    }
    return new ServiceContext({ ...options, parent: this });
  }

  private shouldInherit(ServiceType: ServiceClass): boolean {
    if (this.overrides.has(ServiceType)) return false;
    if (this.inheritServices === true) return true;
    if (this.inheritServices === false) return false;
    // Read the core-defined marker, NOT `instanceof SyncService` — the kernel
    // must not name the sync class. SyncService sets INHERIT_SCOPE; static
    // fields are inherited, so every subclass carries it.
    return (ServiceType as { [INHERIT_SCOPE]?: boolean })[INHERIT_SCOPE] === true;
  }

  /** Dispose all owned services, primitives, and the client listener. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const failures: unknown[] = [];
    for (const child of this.children) {
      try {
        child.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    this.children.clear();
    for (const instance of this.instances.values()) {
      try {
        instance.__destroy();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const override of this.overrides.values()) {
      if (override.ownership !== 'context') continue;
      try {
        override.instance.__destroy();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      this.releaseClient?.();
    } catch (error) {
      failures.push(error);
    }
    this.releaseClient = null;
    try {
      this.disposeRoot?.();
    } catch (error) {
      failures.push(error);
    }
    this.disposeRoot = null;
    this.parent?.children.delete(this);
    if (!this.parent) this.registry.clear();
    if (failures.length > 0) {
      throw new AggregateError(failures, `ServiceContext '${this.scopeId}' disposal failed`);
    }
  }

  /** @internal Test-only retained-child seam for lifecycle stress coverage. */
  __debugChildCount(): number {
    return this.children.size;
  }

  /** Runs a factory under this context's Solid owner (primitives outlive renders). */
  ownedRoot<T>(fn: (dispose: () => void) => T): T {
    return runWithOwner(this.owner, () => createRoot((dispose) => fn(dispose)))!;
  }
}

interface ComputedCacheEntry<T> {
  read: Accessor<T>;
  dispose: () => void;
}

/** One standard cancellation error for supersession and service teardown. */
function latestAsyncTaskCancellationError(): Error {
  const error = new Error('Latest async task cancelled');
  error.name = 'AbortError';
  return error;
}

/** Preserve an Error abort reason, or normalize a non-Error reason. */
function latestAsyncTaskAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : latestAsyncTaskCancellationError();
}

/** Build the token around one controller signal. */
function createLatestAsyncTask(signal: AbortSignal): LatestAsyncTask {
  return {
    signal,
    wait<T>(task: PromiseLike<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const cancel = (): void => {
          reject(latestAsyncTaskAbortError(signal));
        };
        if (signal.aborted) {
          cancel();
          return;
        }
        signal.addEventListener('abort', cancel, { once: true });
        Promise.resolve(task).then(
          (value) => {
            signal.removeEventListener('abort', cancel);
            if (signal.aborted) {
              cancel();
              return;
            }
            resolve(value);
          },
          (error: unknown) => {
            signal.removeEventListener('abort', cancel);
            reject(error);
          }
        );
      });
    }
  };
}

/**
 * Framework-neutral DI singleton holding reactive state. Subclasses declare
 * fields with the protected factories; components reach them only through
 * connect().
 */
export abstract class Service {
  /**
   * The debug panel's state-tree GROUP for this class — override per class:
   *
   *   static override group = 'framework';
   *
   * `'app'` (the default) renders open at the top; `'framework'` (wheel's
   * kit/router internals) renders as a collapsed group; `'debug'` (wheel's
   * own debug services) is hidden from the panel entirely (the bridge still
   * reports it). Any other string makes a custom group. Static inheritance
   * applies — subclasses keep their base's group unless they override.
   */
  static group = 'app';

  private readonly cleanups: Array<() => void> = [];
  private __debugServiceId = '';
  private activeLatestAsyncTask: AbortController | null = null;

  constructor(protected readonly context: ServiceContext) {
    this.cleanups.push(() => {
      this.activeLatestAsyncTask?.abort(latestAsyncTaskCancellationError());
      this.activeLatestAsyncTask = null;
    });
  }

  /** Cross-service dependency. */
  protected service<S extends Service>(ServiceType: ServiceClass<S>): S {
    return this.context.get(ServiceType);
  }

  /** Read the context's injected clock without creating a ticking reactive value. */
  protected now(): number {
    return this.context.now();
  }

  /** Schedule one controlled, cancelable callback through the context runtime seam. */
  protected defer(ms: number, fn: () => void): () => void {
    return this.context.schedule(ms, fn);
  }

  /**
   * Open a latest-call-wins async scope. The new token aborts the prior token
   * from this service; wrap each await with `token.wait(...)`.
   */
  protected latestAsyncTask(): LatestAsyncTask {
    this.activeLatestAsyncTask?.abort(latestAsyncTaskCancellationError());
    const controller = new AbortController();
    this.activeLatestAsyncTask = controller;
    return createLatestAsyncTask(controller.signal);
  }

  /** Mutable tracked cell with no Solid signal and no deep freeze. */
  protected field<T>(initial: T, name?: string): Field<T> {
    const registry = this.context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('field'),
      name: name ?? 'field',
      kind: 'field',
      declaredAt: captureDeclSite()
    };
    let value = initial;
    let history: readonly FieldHistoryEntry[] = [];
    const field: Field<T> = {
      get: () => value,
      set: (next: T) => {
        const entry: FieldHistoryEntry = {
          at: this.now(),
          previous: fieldDebugValue(value),
          current: fieldDebugValue(next)
        };
        value = next;
        const entries = [...history, entry];
        history = entries.length > FIELD_HISTORY_LIMIT
          ? entries.slice(entries.length - FIELD_HISTORY_LIMIT)
          : entries;
        registry.notifyDebug();
      },
      __debugMeta: meta
    };
    registry.registerPrimitive(meta, () => ({
      current: fieldDebugValue(value),
      history
    }));
    return field;
  }

  /** Writable signal-backed cell. `set` no-ops on `Object.is`-equal values. */
  protected atom<T>(initial: T, name?: string): Atom<T> {
    const registry = this.context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('atom'),
      name: name ?? 'atom',
      kind: 'atom',
      declaredAt: captureDeclSite()
    };
    const [get, set] = createSignal(freezeDeep(initial));
    const atom: Atom<T> = {
      get,
      set: (value: T) => {
        set(() => freezeDeep(value));
      },
      update: (recipe) => {
        // Uses the setter's prev-value form (no tracked read); produce()
        // auto-freezes its output, freezeDeep is a no-op backstop.
        set((prev) => freezeDeep(produce(prev, recipe)));
      },
      __debugMeta: meta
    };
    registry.registerPrimitive(meta, get);
    return atom;
  }

  /**
   * Plain derivation: ONE memoized calculation, no arguments, no key, no cache,
   * no eviction. This is the ~90% case (a filtered list, a remaining count, a
   * mirror of an atom). It is a single Solid `createMemo` under the service's
   * owner — it lives as long as the service and disposes with it.
   *
   * Returns an `Accessor<T>`: read it as `this.remaining()`, and it drops
   * straight into a connect `view({ remaining: svc.remaining })` shape (an
   * accessor is exactly what `view` wants), so no mirror wrapper is needed.
   *
   * For a value that depends on a key (per-team, per-issue, …), use
   * `computedFor` — never smuggle a key into `computed` by closing over mutable
   * state.
   */
  protected computed<T>(fn: () => T, name?: string): ComputedAccessor<T> {
    const registry = this.context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('computed'),
      name: name ?? 'computed',
      kind: 'computed',
      declaredAt: captureDeclSite()
    };
    const read = createMemo(() => fn());
    const accessor = Object.assign(read, { __debugMeta: meta }) as ComputedAccessor<T>;
    registry.registerPrimitive(meta, () => read());
    return accessor;
  }

  /**
   * KEYED derivation: one memoized calculation PER distinct key, each a live
   * Solid memo. Call it as `this.issueVm(id)` — same call syntax as a plain
   * function — and get the derived value back directly.
   *
   *   readonly issueVm = this.computedFor((issueId: string) => this.buildVm(issueId));
   *   // usage:   this.issueVm(issueId)
   *   // connect: view({ vm: () => svc.issueVm(props.issueId) })
   *
   * THE LIFETIME RULE (this is the bug fix): per-key memos live until the
   * SERVICE disposes. There is NO LRU and NO eviction. The old design put every
   * derived value behind a 256-entry LRU keyed by canonical args, so a list of
   * more than 256 rows would evict memos that mounted components were still
   * observing — rows silently froze on screen. Here memory grows only with the
   * count of DISTINCT keys ever read (bounded, at wheel's scale, by what the UI
   * actually displayed), and correct-but-unbounded beats bounded-but-wrong.
   *
   * The debug panel shows one entry per key (not the old `<N cached tuples>`
   * opacity).
   */
  protected computedFor<Args extends readonly unknown[], T>(
    fn: (...args: Args) => T,
    name?: string
  ): ComputedFor<Args, T> {
    const registry = this.context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('computed'),
      name: name ?? 'computed',
      kind: 'computed',
      declaredAt: captureDeclSite()
    };
    const cache = new Map<string, ComputedCacheEntry<T>>();
    const context = this.context;
    const callable = (...args: Args): T => {
      const key = canonicalParams(args as unknown as unknown[]);
      let entry = cache.get(key);
      if (!entry) {
        // One disposable memo per key, owned by a nested root so it can be
        // disposed individually on service teardown. No eviction ever.
        entry = context.ownedRoot((dispose) => ({
          read: createMemo(() => fn(...args)),
          dispose
        }));
        cache.set(key, entry);
      }
      return entry.read();
    };
    const release = (...args: Args): boolean => {
      const key = canonicalParams(args as unknown as unknown[]);
      const entry = cache.get(key);
      if (!entry) return false;
      entry.dispose();
      cache.delete(key);
      return true;
    };
    const clear = (): void => {
      for (const entry of cache.values()) entry.dispose();
      cache.clear();
    };
    const computed = Object.assign(callable, {
      __debugMeta: meta,
      release,
      clear,
      size: () => cache.size
    }) as ComputedFor<Args, T>;
    this.cleanups.push(() => {
      clear();
    });
    // Per-key values (fixes the old `<N cached tuples>` opacity): show each
    // live key's current value keyed by its canonical tuple.
    registry.registerPrimitive(meta, () => {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of cache) out[key] = entry.read();
      return out;
    });
    return computed;
  }

  /** Groups its writes into one Solid batch (single downstream flush). */
  protected action<F extends (...args: never[]) => unknown>(fn: F, name?: string): F {
    const registry = this.context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('action'),
      name: name ?? fn.name ?? 'action',
      kind: 'action',
      declaredAt: captureDeclSite()
    };
    const wrapped = ((...args: never[]) => batch(() => fn(...args))) as unknown as F;
    // The callable rides along so the bridge can invoke actions by
    // service+name — actions are the ONLY sanctioned external write door.
    registry.registerPrimitive(meta, () => `<action ${meta.name}>`, wrapped as unknown as (...args: unknown[]) => unknown);
    return Object.assign(wrapped, { __debugMeta: meta });
  }

  /** Own an XState actor with reactive state and named, typed transition actions. */
  protected machine<
    TMachine extends AnyStateMachine,
    TCreators extends MachineTransitionCreators<TMachine>
  >(
    logic: TMachine,
    options: ServiceMachineOptions<TMachine, TCreators>,
    name?: string
  ): ServiceMachine<TMachine, TCreators> {
    const registry = this.context.registry;
    const declaredAt = captureDeclSite();
    const meta: DebugMeta = {
      id: registry.nextId('machine'),
      name: name ?? 'machine',
      kind: 'machine',
      declaredAt
    };
    const timers = new Map<number, () => void>();
    let nextTimerId = 0;
    const clock: NonNullable<ActorOptions<TMachine>['clock']> = {
      setTimeout: (fn, timeout) => {
        const id = ++nextTimerId;
        const cancel = this.defer(timeout, () => {
          timers.delete(id);
          fn();
        });
        timers.set(id, cancel);
        return id;
      },
      clearTimeout: (handle) => {
        const id = Number(handle);
        timers.get(id)?.();
        timers.delete(id);
      }
    };
    const clearTimers = (): void => {
      for (const cancel of timers.values()) cancel();
      timers.clear();
    };

    let actor: Actor<TMachine>;
    let setState!: Setter<SnapshotFrom<TMachine>>;
    let history: readonly MachineHistoryEntry[] = [];
    actor = createActor(logic, {
      clock,
      input: options.input,
      inspect: (event) => {
        if (event.type !== '@xstate.snapshot' || event.actorRef !== actor) return;
        const snapshot = event.snapshot as SnapshotFrom<TMachine>;
        const display = snapshot as unknown as { readonly value: unknown };
        const next = [
          ...history,
          { at: this.now(), event: event.event.type, state: display.value }
        ];
        history = next.length > MACHINE_HISTORY_LIMIT
          ? next.slice(next.length - MACHINE_HISTORY_LIMIT)
          : next;
        setState(() => snapshot);
      }
    } as ActorOptions<TMachine> & { input: InputFrom<TMachine> });

    const [readState, writeState] = createSignal<SnapshotFrom<TMachine>>(actor.getSnapshot(), { equals: false });
    setState = writeState;
    const state = Object.assign(readState, { __debugMeta: meta }) as MachineStateAccessor<TMachine>;

    const transitionMetas: DebugMeta[] = [];
    const transitions: Record<string, (...args: any[]) => void> = {};
    for (const key of Object.keys(options.transitions)) {
      const createEvent = options.transitions[key] as (...args: any[]) => EventFromLogic<TMachine>;
      const transitionMeta: DebugMeta = {
        id: registry.nextId('action'),
        name: key,
        kind: 'action',
        declaredAt
      };
      const transition = (...args: any[]): void => {
        batch(() => actor.send(createEvent(...args)));
      };
      transitions[key] = Object.assign(transition, { __debugMeta: transitionMeta });
      transitionMetas.push(transitionMeta);
      registry.registerPrimitive(
        transitionMeta,
        () => `<action ${transitionMeta.name}>`,
        transition
      );
    }

    registry.registerPrimitive(meta, () => {
      const snapshot = state();
      const display = snapshot as unknown as {
        readonly value: unknown;
        readonly status: unknown;
      };
      return {
        current: display.value,
        status: display.status,
        transitions: Object.keys(options.transitions),
        history
      };
    });

    this.addCleanup(() => {
      actor.stop();
      clearTimers();
    });
    actor.start();

    const serviceMachine = {
      state,
      transitions: transitions as MachineTransitionActions<TCreators>
    } as ServiceMachine<TMachine, TCreators>;
    Object.defineProperties(serviceMachine, {
      __debugMeta: { value: meta },
      __debugTransitionMetas: { value: transitionMetas }
    });
    return serviceMachine;
  }

  /** Registered teardown, runs at context dispose. */
  protected addCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  /** Override for teardown. */
  protected onDestroy(): void {}

  /** @internal Walks own fields, stamps service ownership on primitives. */
  __registerPrimitives(): void {
    const serviceName = this.constructor.name;
    const primitiveIds: string[] = [];
    const primitiveMetas: DebugMeta[] = [];
    for (const key of Object.getOwnPropertyNames(this)) {
      if (key.startsWith('__')) continue;
      const value = (this as Record<string, unknown>)[key];
      const meta = (value as { __debugMeta?: DebugMeta } | null)?.__debugMeta;
      if (meta && typeof meta === 'object') {
        meta.serviceName = serviceName;
        // A primitive built without an explicit name (its name defaulted to
        // its kind) inherits its class-field name here; debug surfaces rely
        // on this to label unnamed atoms/computeds by field.
        (meta as { name: string }).name = meta.name === meta.kind ? key : meta.name;
        primitiveIds.push(meta.id);
        primitiveMetas.push(meta);
        const transitionMetas =
          (value as { __debugTransitionMetas?: readonly DebugMeta[] }).__debugTransitionMetas ?? [];
        for (const transitionMeta of transitionMetas) {
          transitionMeta.serviceName = serviceName;
          (transitionMeta as { name: string }).name = `${meta.name}.${transitionMeta.name}`;
          primitiveIds.push(transitionMeta.id);
          primitiveMetas.push(transitionMeta);
        }
      }
    }
    this.__debugServiceId = this.context.registry.registerService(
      this.constructor,
      this.context,
      this.context.scopeId,
      primitiveIds
    );
    for (const meta of primitiveMetas) meta.serviceId = this.__debugServiceId;
    this.cleanups.push(() => {
      this.context.registry.removeService(this.__debugServiceId);
      for (const id of primitiveIds) this.context.registry.removePrimitive(id);
    });
  }

  /** @internal Stable constructor-and-scope identity for debug edges. */
  __debugIdentity(): string {
    return this.__debugServiceId;
  }

  /** @internal */
  __destroy(): void {
    this.onDestroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }
}
