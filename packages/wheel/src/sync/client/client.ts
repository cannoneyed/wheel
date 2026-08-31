/**
 * SyncClient: the browser-side (and World-side) engine.
 *
 * State model: WheelMaterializer owns confirmed query rows, pending command
 * replay, and the published view. SyncClient owns transport, persistence, and
 * command lifecycle. Confirm, reject, and rollback change commands through the
 * materializer; SyncClient keeps no second row or query-order store.
 *
 * ── THE RECONNECT FUNNEL (client side) ─────────────────────────────────────
 *
 * The transport owns "is the wire up" (one connection loop — see
 * websocket-transport.ts). The client owns "what to do when it comes up", and every
 * trigger routes through exactly TWO entry points, never ad-hoc calls:
 *
 *   trigger                                  entry point
 *   ───────────────────────────────────────  ─────────────────────────────
 *   transport reports status 'connected'  →  connectionRestored()
 *   client's own connect() resolves       →  connectionRestored() (after
 *                                            the one-time outbox replay)
 *   transport re-opened a dropped socket  →  rebootstrap()  (coalesced)
 *
 *   connectionRestored():   release queued offline mutations (in order) +
 *                           re-open wire subscriptions still serving
 *                           hydrated (stale) data. Idempotent; safe to fire
 *                           on every "the wire looks healthy" signal.
 *   rebootstrap():          full resync — refetch EVERY subscription's
 *                           snapshot, swap confirmed truth, and replay pending
 *                           commands on top. The heavyweight path,
 *                           needed because a dropped WebSocket loses deltas
 *                           irrecoverably (there is no replay protocol).
 *                           COALESCED: a storm of reconnects runs at most
 *                           one bootstrap plus one queued follow-up.
 *
 * Ordering note (narrated at each site): on a socket reconnect the transport
 * fires status 'connected' BEFORE onReconnect, so queued mutations start
 * flushing while rebootstrap refetches. That interleaving is safe by
 * construction: a snapshot that predates a queued write is corrected by the
 * write's own delta, and a confirmed entry keeps replaying optimistically
 * until the current connection checkpoints its confirmedSeq.
 *
 * ── TEARDOWN ───────────────────────────────────────────────────────────────
 *
 * One signal: `lifecycle`. close() aborts it, and every background loop
 * (queue flush, outbox replay, stale-wire retry, rebootstrap, persistence)
 * checks it at its next boundary. No scattered `stopped`/`closed` booleans —
 * the remaining boolean fields (`connected`, `flushing`, `replaying`) are
 * state-machine latches, not teardown flags, and say so where they live.
 */
import {
  validateCollectionKey,
  type MutationCall,
  type MutationDecl,
  type MutationRejection,
  type PresenceDecl,
  type QueryDecl,
  type CollectionDecl
} from '../declarations';
import { canonicalParams } from '../../core/params';
import {
  JsonValueError,
  RowValidationError,
  validateJsonValue,
  validateRow,
  type RowValidationIssue
} from '../schema';
import { systemDefer, type Defer } from '../../core/runtime-defaults';
import { logger } from '../../core/logger';
import type { Clock, IdGen, RandomBytes } from '../ids';
import { createIdGen } from '../ids';
import type {
  MutationError,
  QueryStatusEvent,
  RowDelta,
  ServerEvent,
  Snapshot,
  SyncQueryStatus
} from '../protocol';
import { freezeRow, type Row } from './cache';
import { collectClientDeclarations, type ClientDeclarationRegistry } from './declaration-registry';
import { ProvenanceLog, type ProvenanceEntry, type WriteCause } from './provenance';
import type { LocalCache, PersistedSubscription } from './local-cache';
import { WheelMaterializer } from './materializer';
import type { SyncConnectionStatus } from './transport';
import { TransientSyncError } from './transport';
import type { SyncTransport } from './transport';

/**
 * The lifecycle of a mutation: pending -> confirmed | rejected | failed |
 * orphaned (never limbo). `queued` = the TRANSPORT failed (couldn't reach
 * the server); the entry keeps its optimistic state and retries when the
 * connection returns — offline work is DEFERRED, never lost. `failed` = the
 * mutation is BROKEN — invalid args (caught locally OR server-side), a handler
 * that threw, or an id-stream mismatch — terminal, rolled back, never retried:
 * retrying a poison mutation would break identically forever and block every
 * mutation queued behind it.
 *
 * `pending` and `queued` are IN-FLIGHT; `settled` resolves to one of the FOUR
 * terminal outcomes (the one error channel, see `mutate()`):
 *
 *   | outcome (state) | when                                                  | rolled back?         | retried? |
 *   |-----------------|-------------------------------------------------------|----------------------|----------|
 *   | confirmed       | the server committed the write (`{ok:true}`)          | no — it is now truth | —        |
 *   | rejected        | a business rule said no (`rejection()` in the handler)| yes, cleanly         | never    |
 *   | failed          | the mutation is BROKEN — invalid args, a handler that | yes                  | never    |
 *   |                 | threw, an id-stream mismatch. Terminal: a bug.        |                      |          |
 *   | orphaned        | the row it edits vanished before replay (a peer       | yes, cleanly         | never    |
 *   |                 | deleted it) — legitimate, not a bug.                  |                      |          |
 */
export type MutationState = 'pending' | 'queued' | 'confirmed' | 'rejected' | 'orphaned' | 'failed';

/** The audit record of one mutation attempt, including its rejection/error if any. */
export interface MutationInfo {
  readonly mutationId: string;
  readonly mutations: readonly string[];
  readonly state: MutationState;
  readonly rejection?: MutationRejection;
  /** Present on `failed`: the typed "this mutation is broken" verdict — the server's crash, or invalid args caught locally (`code: 'invalid_args'`). */
  readonly error?: MutationError;
}

/** What mutate() returns: the mutation id plus a promise for its settled outcome. */
export interface MutationHandle {
  readonly mutationId: string;
  /**
   * Resolves with the terminal outcome — `confirmed | rejected | failed |
   * orphaned` (see the table on `mutate()`). NEVER rejects: mutate() has ONE
   * error channel, so even invalid args arrive here as `failed`, never as a
   * throw. Stays unresolved only while the mutation is `queued` (offline).
   */
  readonly settled: Promise<MutationInfo>;
}

interface OptimisticCall {
  readonly decl: MutationDecl;
  readonly args: Record<string, unknown>;
  readonly ids: readonly string[];
}

interface OptimisticEntry {
  readonly mutationId: string;
  readonly calls: readonly OptimisticCall[];
  state: MutationState;
  confirmedSeq?: number;
  confirmedGeneration?: number;
  /** Seq whose server delta first made this in-flight command fail with orphan(). */
  replayOrphanedAtSeq?: number;
  rollbackUndoBookkeeping?: () => void;
  /** Settles the caller's MutationHandle.settled promise. */
  resolveSettled?: (info: MutationInfo) => void;
}

interface ClientSubscription {
  readonly key: string;
  readonly query: QueryDecl;
  readonly params: Record<string, unknown>;
  subscriptionId: string;
  /** Highest delta seq applied — stale (reordered) deltas are refused. */
  lastDeltaSeq: number;
  /** Highest query-status seq applied. Status may share a seq with its delta. */
  lastStatusSeq: number;
  refs: number;
  /** True while serving hydrated (persisted, possibly outdated) rows — no wire subscription yet. */
  stale: boolean;
}

/** A live subscription handle: current rows (server order + optimistic projection) and release(). */
export interface QueryHandle<RowT extends Row = Row> {
  readonly query: string;
  readonly subscriptionId: string;
  /** Current effective rows: server membership/order + optimistic projection. */
  rows(): readonly RowT[];
  /** Current server-owned query lifecycle. */
  status(): SyncQueryStatus;
  /** True while rows are hydrated but unconfirmed, or the server reports that its last valid rows are stale. */
  stale(): boolean;
  release(): void;
}

/** What explain() answers: the current value plus the full provenance chain of causes. */
export interface ExplainResult<RowT extends Row = Row> {
  readonly value: RowT | undefined;
  readonly cause: WriteCause | undefined;
  readonly history: readonly ProvenanceEntry[];
}

/**
 * One peer whose presence payload the reader's declaration REJECTED — surfaced,
 * never silently dropped. A peer running an older schema shows up here so the
 * caller (and the debug panel) can see "this peer's presence didn't validate"
 * instead of an unexplained absence.
 */
export interface PeerPresenceFailure {
  readonly clientId: string;
  /** Actor authenticated by the server for this peer's connection. */
  readonly actor: string;
  /** The raw payload as it arrived on the wire (the older-schema peer's shape). */
  readonly state: Record<string, unknown>;
  /** Why it failed the reader's declaration — the offending fields. */
  readonly issues: readonly RowValidationIssue[];
}

/**
 * What `peers(decl)` answers: `valid` peers keyed by clientId, plus the
 * `failures` whose payload the declaration rejected. Splitting them means a bad
 * peer is a THING THE CALLER CAN SEE — the whole point of 4.4 — rather than a
 * vanished entry.
 */
export interface PeersResult<State extends Record<string, unknown>> {
  readonly valid: ReadonlyMap<string, State>;
  readonly failures: ReadonlyMap<string, PeerPresenceFailure>;
  /** Authenticated actor for every peer, keyed by connection id. */
  readonly actors: ReadonlyMap<string, string>;
}

/** Transport, declarations, identity, time, randomness, and storage for one client. */
export interface SyncClientOptions {
  transport: SyncTransport;
  clientId: string;
  actor: string;
  clock: Clock;
  randomBytes: RandomBytes;
  /** Shared client/server declaration modules. Required for durable command replay after reload. */
  syncModules: readonly object[];
  /** One-shot timer seam (presence coalescing). Defaults to real timers; tests inject a manual Defer or use fake timers. */
  defer?: Defer;
  provenanceCapacity?: number;
  /**
   * Durable local persistence — REQUIRED, because local-first is not an opt-in
   * mode: `IndexedDbCache` in browsers, `MemoryCache` in tests and SSR (pass it
   * explicitly — choosing the cache is the point; there is no silent
   * not-local-first path). Enables the local-first behaviors: subscriptions
   * hydrate from cache on boot (instant, marked stale until the wire confirms)
   * and pending mutations survive reloads through the outbox (replayed on
   * connect; exactly-once — the server dedupes by mutationId). `MemoryCache`
   * simply forgets between constructions, which is exactly what tests and SSR
   * want.
   */
  localCache: LocalCache;
}

/** The client engine: transport and command lifecycle around one Wheel materializer. */
export class SyncClient {
  private readonly materializer: WheelMaterializer;
  private readonly declarations: ClientDeclarationRegistry;
  private readonly subscriptions = new Map<string, ClientSubscription>();
  /** Calls requesting each canonical subscription, including hydration/wire still in flight. */
  private readonly subscriptionDemands = new Map<string, number>();
  private readonly inflightSubscribes = new Map<string, Promise<void>>();
  // The cache-hydration phase of a first subscribe (loading persisted rows)
  // runs BEFORE the wire subscription registers in `inflightSubscribes`. Track
  // it too, so "is the wire quiet?" (settle) spans the whole subscribe, not
  // just its wire tail — otherwise settle can return in the gap between
  // hydrate-start and wire-register and read an empty subscription.
  private readonly inflightHydrations = new Set<Promise<unknown>>();
  /** Outbox commit + first send attempt; World settles these without waiting for offline queues forever. */
  private readonly inflightMutationStarts = new Set<Promise<void>>();
  private readonly subscriptionsById = new Map<string, ClientSubscription>();
  private readonly pending: OptimisticEntry[] = [];
  private readonly mutationLog = new Map<string, MutationInfo[]>();
  private readonly provenance: ProvenanceLog;
  private readonly listeners = new Set<(changedCollections?: ReadonlySet<string>) => void>();
  /**
   * Collections whose effective rows moved since the last notify. Marked where
   * rows change (deltas, bootstraps, optimistic writes, rollbacks, drops)
   * and flushed to listeners, so a consumer can invalidate per collection
   * instead of re-deriving the world on every change. `changedAll` is the
   * conservative flag for changes with unknown scope (reconnect bootstrap).
   */
  private readonly changedCollections = new Set<string>();
  private changedAll = false;
  private readonly idGen: IdGen;
  private lastSeq = 0;
  /** Server connection epoch. Checkpoints only settle acknowledgements from this epoch. */
  private connectionGeneration = 0;
  /** Highest authoritative checkpoint in the current connection generation. */
  private checkpointSeq = 0;
  /**
   * The ONE teardown signal (see the module doc): close() aborts it, and every
   * background loop observes it at its next boundary. Nothing else in this
   * class means "we are shutting down".
   */
  private readonly lifecycle = new AbortController();
  /** Connection STATE (has transport.connect resolved), not a teardown flag — close() resets it so a client is never "connected and closed". */
  private connected = false;
  /** In-flight dedup latch for connect(); null when no connect is running. */
  private connecting: Promise<void> | null = null;
  private version = 0;
  private undoStack: Array<readonly MutationCall<any>[]> = [];
  private redoStack: Array<readonly MutationCall<any>[]> = [];
  private replaying: 'undo' | 'redo' | null = null;
  private readonly peerPresence = new Map<string, Record<string, unknown>>();
  private readonly peerPresenceActors = new Map<string, string>();
  private readonly stopIncompatibleServerListener: (() => void) | undefined;
  private readonly outboxRestore: Promise<void>;

  constructor(private readonly options: SyncClientOptions) {
    this.idGen = createIdGen({ clock: options.clock, randomBytes: options.randomBytes });
    this.declarations = collectClientDeclarations(options.syncModules);
    this.materializer = new WheelMaterializer({
      actor: options.actor,
      now: () => options.clock.now(),
      retainReplayFailures: true
    });
    this.materializer.onPublish(({ changedCollections }) => {
      for (const collection of changedCollections) this.markChanged(collection);
    });
    this.provenance = new ProvenanceLog(options.provenanceCapacity);
    this.outboxRestore = this.restoreOutbox();
    this.stopIncompatibleServerListener = options.transport.onIncompatibleServer?.((message) => {
      this.failForOldServer(message);
    });
  }

  private failForOldServer(message: string): void {
    for (const entry of [...this.pending]) {
      entry.state = 'failed';
      const info: MutationInfo = {
        mutationId: entry.mutationId,
        mutations: entry.calls.map((call) => call.decl.name),
        state: 'failed',
        error: { kind: 'error', code: 'server_too_old', message }
      };
      this.dropEntry(entry, 'rollback');
      this.logMutation(info);
      entry.resolveSettled?.(info);
      void this.options.localCache.removeOutbox(entry.mutationId).catch(() => {});
    }
    this.notify();
  }

  /** The same injected wall clock used by ids, mutations, and provenance. */
  now(): number {
    return this.options.clock.now();
  }

  /** Schedule through the client's injected one-shot timer seam. */
  schedule(ms: number, fn: () => void): () => void {
    return this.defer.schedule(ms, fn);
  }

  /** This client's stable identity on the wire. */
  get clientId(): string {
    return this.options.clientId;
  }

  private connectionStatusValue: SyncConnectionStatus = 'connecting';

  /**
   * The transport-level connection status — what the "sync offline" UI reads.
   * While disconnected the cache keeps serving last-known server truth (base
   * collections are only replaced by a successful re-bootstrap), so consumers can
   * honestly render stale data with a warning instead of empty lists.
   */
  connectionStatus(): SyncConnectionStatus {
    return this.connectionStatusValue;
  }

  /** Transport wiring reports connection lifecycle here; notifies subscribers on change. */
  setConnectionStatus(status: SyncConnectionStatus): void {
    if (status === this.connectionStatusValue) {
      return;
    }
    this.connectionStatusValue = status;
    if (status === 'connected') {
      // FUNNEL (module doc): a healthy-wire signal has exactly one reaction.
      this.connectionRestored();
    }
    this.notify();
  }

  /**
   * FUNNEL entry point: the wire is (newly) healthy. Release queued offline
   * mutations in enqueue order and re-open wire subscriptions still serving
   * hydrated (stale) data. Idempotent — flushQueued dedups via its `flushing`
   * latch and retryStaleWires via `inflightSubscribes` — so every "connection
   * looks good" trigger may call it without coordination. Full resync
   * (rebootstrap) is deliberately NOT here: only the transport knows a stream
   * actually DROPPED (and therefore deltas were lost); a mere status blip must
   * not pay the refetch-everything cost.
   */
  private connectionRestored(): void {
    if (this.lifecycle.signal.aborted) {
      return; // closed: teardown wins over any late trigger
    }
    this.flushQueued();
    this.retryStaleWires();
    // Wake parked cold subscribes LAST: their retry rides the same healthy
    // wire the two calls above just used.
    for (const wake of this.connectionWaiters.splice(0)) {
      wake();
    }
  }

  /** Parked work waiting for the next healthy-wire signal (or teardown). */
  private readonly connectionWaiters: Array<() => void> = [];

  /**
   * Resolves at the next `connectionRestored()` — or immediately once the
   * client is closed, so a parked loop can observe the abort and exit
   * instead of waiting forever on a connection that will never return.
   */
  private connectionReturn(): Promise<void> {
    if (this.lifecycle.signal.aborted) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.connectionWaiters.push(resolve);
    });
  }

  /** Open the transport connection (deduped: concurrent callers share one connect). */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    // In-flight dedup: concurrent first subscribes (a board mounting three
    // columns) must open exactly ONE connection.
    if (!this.connecting) {
      this.connecting = this.options.transport
        .connect(
          this.options.clientId,
          (event) => this.applyEvent(event),
          { actor: this.options.actor }
        )
        .then(async () => {
          if (this.lifecycle.signal.aborted) {
            return; // close() raced the connect; do not resurrect the client
          }
          this.connected = true;
          // Boot order matters: restored work precedes this session's queued
          // work, then the healthy wire flushes it in command order.
          await this.outboxRestore;
          this.connectionRestored();
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    await this.connecting;
  }

  /** The last server seq this client has observed. */
  seq(): number {
    return this.lastSeq;
  }

  /** Mint a prefixed UUIDv7 from the client's (injectable, test-deterministic) id source — for args-borne ids like block inserts. */
  newId(prefix: string): string {
    return this.idGen.newId(prefix);
  }

  /** Unconfirmed local mutations still in flight. */
  pendingMutations(): number {
    return this.pending.filter((entry) => entry.state === 'pending').length;
  }

  /** Mutations parked by a dead connection, awaiting retry — the "N unsaved changes" banner count. */
  queuedMutations(): number {
    return this.pending.filter((entry) => entry.state === 'queued').length;
  }

  /**
   * Subscribe to every state change (deltas, optimistic writes, presence).
   * The listener receives the collections whose effective rows moved: an empty
   * set for data-free changes (status, mutation lifecycle, presence),
   * `undefined` when the scope is unknown (assume everything).
   */
  onChange(listener: (changedCollections?: ReadonlySet<string>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── queries ────────────────────────────────────────────────────────────

  /**
   * Subscribe to a live query; deduped by canonical (query, params) key.
   *
   * Local-first path: with a store configured, a persisted snapshot hydrates
   * the subscription INSTANTLY (marked stale) and the wire subscription
   * refreshes it whenever the connection lands — so an offline boot serves
   * last-known data instead of hanging. Without cached data the call awaits
   * the wire (loading until online), same as a client with no store.
   */
  async subscribe<Params extends Record<string, unknown>, RowT extends Row>(
    query: QueryDecl<Params, RowT>,
    params: NoInfer<Params>
  ): Promise<QueryHandle<RowT>> {
    const parsedParams = query.params.safeParse(params);
    if (!parsedParams.success) {
      throw new Error(
        `Params for query "${query.name}" are invalid: ${parsedParams.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`
      );
    }
    const queryParams = parsedParams.data as Params;
    validateJsonValue(`Params for query "${query.name}"`, queryParams);
    const key = `${query.name}|${canonicalParams(queryParams)}`;
    this.subscriptionDemands.set(key, (this.subscriptionDemands.get(key) ?? 0) + 1);
    try {
    let subscription = this.subscriptions.get(key);
    // Kick the wire FIRST, synchronously: `ensureWireSubscription` registers
    // its in-flight promise before any await, so (a) two concurrent first
    // subscribes to the same key dedup onto ONE wire call instead of racing
    // through the hydrate gap below, and (b) settle() sees the work the instant
    // subscribe() is called. The wire's own body reads the subscription only
    // after connect + snapshot resolve — by then the hydrate below has created
    // the stale placeholder, so the wire correctly UPGRADES it rather than
    // creating a duplicate.
    const wire = this.ensureWireSubscription(query as QueryDecl, queryParams, key);
    if (!subscription) {
      // Hydrate for instant stale rows (offline boot) — tracked as in-flight
      // (see `inflightHydrations`) so settle() waits for it. On an empty cache
      // this creates nothing and we fall through to awaiting the wire.
      const hydration = this.hydrateSubscription(query as QueryDecl, queryParams, key);
      this.inflightHydrations.add(hydration);
      try {
        subscription = await hydration;
      } finally {
        this.inflightHydrations.delete(hydration);
      }
    }
    if (!subscription && !this.subscriptions.has(key)) {
      await wire;
    } else {
      // Hydrated (or already live): the wire refresh completes in the
      // background whenever the connection allows.
      void wire.catch(() => {});
    }
    await this.outboxRestore;
    const live = this.subscriptions.get(key)!;
    live.refs += 1;
    const self = this;
    let released = false;
    return {
      query: query.name,
      subscriptionId: live.subscriptionId,
      rows(): readonly RowT[] {
        return self.materializer.queryRows(query, queryParams);
      },
      status(): SyncQueryStatus {
        const status = self.materializer.queryStatus(query, queryParams);
        return !status || status.kind === 'loading' ? { kind: 'stale' } : status;
      },
      stale(): boolean {
        const subscription = self.subscriptions.get(key);
        return subscription?.stale === true || self.materializer.queryStatus(query, queryParams)?.kind === 'stale';
      },
      release(): void {
        if (released) return;
        released = true;
        const current = self.subscriptions.get(key);
        if (current) {
          current.refs -= 1;
        }
        const demands = (self.subscriptionDemands.get(key) ?? 1) - 1;
        if (demands > 0) {
          self.subscriptionDemands.set(key, demands);
          return;
        }
        self.subscriptionDemands.delete(key);
        if (!current) return;

        // Live membership dies now. Persisted snapshots remain in LocalCache
        // as a separate stale-start optimization for a later re-subscribe.
        self.subscriptions.delete(key);
        self.subscriptionsById.delete(current.subscriptionId);
        self.materializer.releaseQuery(current.query, current.params);
        self.notify();
        if (!current.stale && !current.subscriptionId.startsWith('hydrated:')) {
          void self.options.transport
            .unsubscribe(self.options.clientId, current.subscriptionId)
            .catch(() => {
              // A dead connection already drops every subscription; reconnect
              // only bootstraps entries still present in this client's map.
            });
        }
      }
    };
    } catch (error) {
      const demands = (this.subscriptionDemands.get(key) ?? 1) - 1;
      if (demands > 0) {
        this.subscriptionDemands.set(key, demands);
      } else {
        this.subscriptionDemands.delete(key);
      }
      throw error;
    }
  }

  /** Persisted snapshots for hydration, loaded once per client. */
  private persistedSubs: Promise<Map<string, PersistedSubscription>> | null = null;

  private loadPersisted(): Promise<Map<string, PersistedSubscription>> {
    if (!this.persistedSubs) {
      this.persistedSubs = this.options.localCache
        .loadSubscriptions()
        .then((subs) => new Map(subs.map((sub) => [sub.key, sub])))
        .catch(() => new Map());
    }
    return this.persistedSubs;
  }

  /** Apply a persisted snapshot as a stale subscription (instant offline boot). */
  private async hydrateSubscription(
    query: QueryDecl,
    params: Record<string, unknown>,
    key: string
  ): Promise<ClientSubscription | undefined> {
    const persisted = (await this.loadPersisted()).get(key);
    if (!persisted || this.subscriptions.has(key)) {
      return this.subscriptions.get(key);
    }
    const subscription: ClientSubscription = {
      key,
      query,
      params,
      subscriptionId: `hydrated:${key}`,
      lastDeltaSeq: persisted.seq,
      lastStatusSeq: persisted.seq,
      refs: 0,
      stale: true
    };
    this.materializer.applyServerBatch({
      queries: [{ query, params, puts: persisted.rows, order: persisted.order, status: { kind: 'stale' } }]
    });
    for (const row of this.materializer.confirmedQueryRows(query, params)) {
      const id = query.into.key(row);
      this.provenance.record({
        at: this.options.clock.now(),
        collection: query.into.name,
        rowId: id,
        value: row,
        cause: { kind: 'hydrate', seq: persisted.seq }
      });
    }
    this.subscriptions.set(key, subscription);
    this.lastSeq = Math.max(this.lastSeq, persisted.seq);
    this.notify();
    return subscription;
  }

  /**
   * Resolves when every currently in-flight subscribe has settled (fulfilled
   * OR failed — failures are the caller's concern, this only answers "is the
   * wire quiet"). World.settle() awaits this so a lazily-subscribing service
   * read (`service.issuesFor(teamId)` starting a subscription mid-test)
   * settles like every other in-flight work — without it, tests would need
   * a poll-until-rows dance.
   *
   * Why BOTH sets are registered synchronously inside subscribe() (audited):
   * the wire promise lands in `inflightSubscribes` before subscribe()'s first
   * await, and the hydration lands in `inflightHydrations` the line after it
   * starts — so a settle() issued any time after subscribe() was CALLED sees
   * the work. Known, harmless ordering nuance: this promise can resolve one
   * microtask before subscribe()'s own continuation increments `refs` (both
   * chain on the same promises; ours may be scheduled first). `refs` only
   * feeds the React binding's dedup accounting, and World.settle()'s
   * multi-round drain absorbs the microtask — no observable state depends on
   * the gap.
   */
  subscribesSettled(): Promise<void> {
    const inflight = [
      ...this.inflightSubscribes.values(),
      ...this.inflightHydrations,
      ...this.inflightMutationStarts
    ];
    if (inflight.length === 0) {
      return Promise.resolve();
    }
    return Promise.allSettled(inflight).then(() => {});
  }

  /** Whether any first-subscribe hydrate or wire call is still in flight (settle's quiet check). */
  hasInflightSubscribes(): boolean {
    return (
      this.inflightSubscribes.size > 0 ||
      this.inflightHydrations.size > 0 ||
      this.inflightMutationStarts.size > 0
    );
  }

  /** Open (or refresh) the wire subscription for a key; deduped in-flight. */
  private ensureWireSubscription(
    query: QueryDecl,
    params: Record<string, unknown>,
    key: string
  ): Promise<void> {
    const existing = this.subscriptions.get(key);
    if (existing && !existing.stale) {
      return Promise.resolve();
    }
    let inflight = this.inflightSubscribes.get(key);
    if (!inflight) {
      inflight = (async () => {
        await this.connect();
        // A transient wire failure (409 across a restart, network drop, 5xx)
        // parks this subscribe until the connection returns, then retries —
        // the promise stays PENDING for the cold caller, and its view stays
        // honestly 'loading'. Before this loop a cold subscribe that raced a
        // restart rejected once and died sticky for the life of the tab; the
        // empty-forever view it left behind armed the 2026-08-10 mark-read
        // storm. Only a server VERDICT rejects (sticky is then correct).
        let snapshot: Snapshot;
        for (;;) {
          try {
            snapshot = await this.options.transport.subscribe(this.options.clientId, query.name, params);
            break;
          } catch (error) {
            if (!(error instanceof TransientSyncError) || this.lifecycle.signal.aborted) {
              throw error;
            }
            if ((this.subscriptionDemands.get(key) ?? 0) === 0) {
              return; // released while failing — nobody is waiting
            }
            await this.connectionReturn();
            if (this.lifecycle.signal.aborted) {
              // Reject rather than resolve-empty: a cold caller past this
              // await reads the subscription map, and close() created none.
              throw new Error('sync client closed while a subscribe was parked');
            }
          }
        }
        if ((this.subscriptionDemands.get(key) ?? 0) === 0) {
          await this.options.transport
            .unsubscribe(this.options.clientId, snapshot.subscriptionId)
            .catch(() => {});
          return;
        }
        let subscription = this.subscriptions.get(key);
        if (subscription) {
          this.subscriptionsById.delete(subscription.subscriptionId);
          subscription.subscriptionId = snapshot.subscriptionId;
          subscription.stale = false;
          // A hydrated seq may come from an older server epoch (db reset);
          // the wire snapshot is the authority from here on. Mirrors the
          // reset in rebootstrap() — keep both in sync.
          subscription.lastDeltaSeq = 0;
          subscription.lastStatusSeq = 0;
        } else {
          subscription = {
            key,
            query,
            params,
            subscriptionId: snapshot.subscriptionId,
            lastDeltaSeq: snapshot.seq,
            lastStatusSeq: snapshot.seq,
            refs: 0,
            stale: false
          };
          this.subscriptions.set(key, subscription);
        }
        this.subscriptionsById.set(snapshot.subscriptionId, subscription);
        this.applySnapshot(subscription, snapshot);
      })().finally(() => {
        this.inflightSubscribes.delete(key);
      });
      this.inflightSubscribes.set(key, inflight);
    }
    return inflight;
  }

  /**
   * Re-open the wire for every subscription still serving hydrated data. If a
   * failed attempt is still in flight for a key, the retry is chained behind
   * its settlement — one retry per connection-return, no loops.
   */
  private retryStaleWires(): void {
    for (const subscription of [...this.subscriptions.values()]) {
      if (!subscription.stale) continue;
      const key = subscription.key;
      const kick = () => {
        if (this.lifecycle.signal.aborted) {
          return; // closed while the chained retry waited — nothing to refresh
        }
        const sub = this.subscriptions.get(key);
        if (sub?.stale && !this.inflightSubscribes.has(key)) {
          void this.ensureWireSubscription(sub.query, sub.params, key).catch(() => {});
        }
      };
      const existing = this.inflightSubscribes.get(key);
      if (existing) {
        void existing.catch(() => {}).then(kick);
      } else {
        kick();
      }
    }
  }

  /** One row from the effective view (server truth + optimistic overlay). */
  get<RowT extends Row>(collection: CollectionDecl<RowT>, id: string): RowT | undefined {
    return this.materializer.get(collection, id);
  }

  /** All pooled rows of a collection from the effective view. */
  rows<RowT extends Row>(collection: CollectionDecl<RowT>): readonly RowT[] {
    return this.materializer.rows(collection);
  }

  // ── mutations ──────────────────────────────────────────────────────────

  /**
   * The one write path: validate, capture inverse, apply optimistically, send.
   *
   * ONE ERROR CHANNEL (4.2): every outcome of a mutation resolves through
   * `handle.settled` — including invalid args, caught right here before
   * anything is applied or sent. `mutate()` NEVER throws. The FOUR terminal
   * outcomes `settled` can resolve to:
   *
   *   | outcome (state) | when                                                  | rolled back?         | retried? |
   *   |-----------------|-------------------------------------------------------|----------------------|----------|
   *   | confirmed       | the server committed the write (`{ok:true}`)          | no — it is now truth | —        |
   *   | rejected        | a business rule said no (`rejection()` in the handler)| yes, cleanly         | never    |
   *   | failed          | the mutation is BROKEN — invalid args (caught locally | yes                  | never    |
   *   |                 | OR server-side), an optimistic/server handler that    |                      |          |
   *   |                 | threw, an id-stream mismatch. Terminal: a bug.        |                      |          |
   *   | orphaned        | the row it edits vanished before replay (a peer       | yes, cleanly         | never    |
   *   |                 | deleted it) — legitimate, not a bug.                  |                      |          |
   *
   * A transport failure is NOT a fifth outcome: it leaves the mutation
   * UNSETTLED, parked `queued`, and retried in order when the connection
   * returns (the offline promise). Only failure-to-communicate is retryable;
   * every computed verdict is terminal.
   */
  mutate<Args extends Record<string, unknown>>(decl: MutationDecl<Args>, args: NoInfer<Args>): MutationHandle {
    return this.mutateCommand([{ mutation: decl, args }], false);
  }

  /** Apply several existing mutations as one optimistic, durable, and server-side transaction. */
  mutateGroup(calls: ReadonlyArray<MutationCall<any>>): MutationHandle {
    return this.mutateCommand(calls, true);
  }

  private mutateCommand(calls: ReadonlyArray<MutationCall<any>>, requireUndo: boolean): MutationHandle {
    const mutationId = this.idGen.newId('m');
    const mutations = Object.freeze(calls.map((call) => call.mutation.name));
    const terminal = (
      state: 'confirmed' | 'failed' | 'orphaned',
      error?: MutationError
    ): MutationHandle => {
      const info: MutationInfo = { mutationId, mutations, state, error };
      if (calls.length > 0) this.logMutation(info);
      return { mutationId, settled: Promise.resolve(info) };
    };

    if (calls.length === 0) return terminal('confirmed');
    if (calls.length > 128) {
      return terminal('failed', {
        kind: 'error',
        code: 'group_too_large',
        message: 'A mutation group may contain at most 128 members.'
      });
    }

    const prepared: Array<{ decl: MutationDecl; args: Record<string, unknown>; ids: string[] }> = [];
    for (const call of calls) {
      const parsed = call.mutation.args.safeParse(call.args);
      if (!parsed.success) {
        return terminal('failed', {
          kind: 'error',
          code: 'invalid_args',
          message: `Args for mutation "${call.mutation.name}" are invalid: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('; ')}`
        });
      }
      try {
        validateJsonValue(`Args for mutation "${call.mutation.name}"`, parsed.data);
      } catch (error) {
        if (!(error instanceof JsonValueError)) throw error;
        return terminal('failed', {
          kind: 'error',
          code: 'invalid_args',
          message: error.message
        });
      }
      prepared.push({ decl: call.mutation as MutationDecl, args: parsed.data, ids: [] });
    }

    const result = this.materializer.enqueue({
      mutationId,
      calls: prepared.map((call) => ({ mutation: call.decl, args: call.args, ids: call.ids })),
      requireUndo,
      newId: (prefix) => this.idGen.newId(prefix)
    });
    if (result.state === 'orphaned') return terminal('orphaned');
    if (result.state === 'failed') {
      return terminal('failed', {
        kind: 'error',
        code: result.message?.includes('not invertible') ? 'non_invertible_group' : 'optimistic_handler_error',
        message: result.message ?? 'Optimistic mutation failed.'
      });
    }

    const materializedCalls = this.materializer.commandCalls(mutationId);
    const inverses = this.materializer
      .commandInverses(mutationId)
      .map((inverse) => ({ mutation: inverse.mutation, args: inverse.args }));
    const writes = this.materializer.commandWrites(mutationId);

    let rollbackUndoBookkeeping = (): void => {};
    if (inverses.length === prepared.length) {
      const inverseGroup = Object.freeze(inverses);
      if (this.replaying === 'undo') {
        this.redoStack.push(inverseGroup);
        rollbackUndoBookkeeping = () => {
          const index = this.redoStack.lastIndexOf(inverseGroup);
          if (index >= 0) this.redoStack.splice(index, 1);
        };
      } else {
        this.undoStack.push(inverseGroup);
        const previousRedo = this.replaying === null ? this.redoStack : null;
        if (this.replaying === null) this.redoStack = [];
        rollbackUndoBookkeeping = () => {
          const index = this.undoStack.lastIndexOf(inverseGroup);
          if (index >= 0) this.undoStack.splice(index, 1);
          if (previousRedo) this.redoStack = previousRedo;
        };
      }
    }

    const entry: OptimisticEntry = {
      mutationId,
      calls: materializedCalls.map((call) => ({
        decl: call.mutation,
        args: call.args,
        ids: call.ids
      })),
      state: 'pending',
      rollbackUndoBookkeeping
    };
    const settled = new Promise<MutationInfo>((resolve) => {
      entry.resolveSettled = resolve;
    });
    this.pending.push(entry);
    for (const write of writes) {
      this.provenance.record({
        at: this.options.clock.now(),
        collection: write.collection,
        rowId: write.rowId,
        value: write.value,
        cause: { kind: 'optimistic', mutationId, mutations }
      });
    }
    this.notify();

    const persistAndSend = (async () => {
      try {
        await this.options.localCache.appendOutbox({
          mutationId,
          calls: entry.calls.map((call) => ({
            mutation: call.decl.name,
            args: call.args,
            ids: call.ids
          })),
          preview: writes.map((write) => ({
            collection: write.collection,
            rowId: write.rowId,
            value: write.value ?? null
          })),
          enqueuedAt: this.options.clock.now()
        });
      } catch {
        entry.state = 'failed';
        const info: MutationInfo = {
          mutationId,
          mutations,
          state: 'failed',
          error: {
            kind: 'error',
            code: 'local_persistence_failed',
            message: `Could not save mutation group [${mutations.join(', ')}] to the local outbox.`
          }
        };
        this.dropEntry(entry, 'rollback');
        this.logMutation(info);
        entry.resolveSettled?.(info);
        this.notify();
        return;
      }
      await this.attemptSend(entry);
    })();
    this.inflightMutationStarts.add(persistAndSend);
    void persistAndSend.then(
      () => this.inflightMutationStarts.delete(persistAndSend),
      () => this.inflightMutationStarts.delete(persistAndSend)
    );
    return { mutationId, settled };
  }

  /**
   * One wire attempt. Confirmation settles the caller but keeps the outbox
   * record until a checkpoint. Rejection and failure clear it immediately. A
   * transport failure parks the entry as `queued`; optimistic state stays
   * visible, and flushQueued() retries it when the connection returns.
   */
  private async attemptSend(entry: OptimisticEntry): Promise<void> {
    let info: MutationInfo;
    let removeOutbox = false;
    const mutations = entry.calls.map((call) => call.decl.name);
    const generation = this.connectionGeneration;
    try {
      const result = await this.options.transport.mutateGroup({
        clientId: this.options.clientId,
        mutationId: entry.mutationId,
        calls: entry.calls.map((call) => ({ name: call.decl.name, args: call.args, ids: call.ids }))
      });
      if (generation !== this.connectionGeneration) {
        entry.state = 'queued';
        this.notify();
        return;
      }
      if (
        result.ok &&
        entry.replayOrphanedAtSeq !== undefined &&
        entry.replayOrphanedAtSeq !== result.seq
      ) {
        // A peer's earlier change removed this command's target. The server
        // may still accept a no-op handler, but the client's optimistic
        // contract is terminally orphaned and must not become confirmed.
        entry.state = 'orphaned';
        info = { mutationId: entry.mutationId, mutations, state: 'orphaned' };
        this.dropEntry(entry, 'orphaned');
        removeOutbox = true;
      } else if (result.ok) {
        // Confirmed is NOT durable yet: the entry stays in pending[] and keeps
        // replaying optimistically until this connection checkpoints the seq.
        // Dropping it here could lose an acknowledgement during reconnect.
        entry.state = 'confirmed';
        entry.confirmedSeq = result.seq;
        entry.confirmedGeneration = generation;
        this.lastSeq = Math.max(this.lastSeq, result.seq);
        info = { mutationId: entry.mutationId, mutations, state: 'confirmed' };
        this.releaseSettledEntries();
      } else if ('rejection' in result) {
        entry.state = 'rejected';
        info = { mutationId: entry.mutationId, mutations, state: 'rejected', rejection: result.rejection };
        this.dropEntry(entry, 'rollback');
        removeOutbox = true;
      } else {
        // The server RAN this mutation and it broke (typed error verdict) —
        // terminal. Roll back and settle loudly; retrying poison would fail
        // identically forever and block the queue behind it.
        entry.state = 'failed';
        info = { mutationId: entry.mutationId, mutations, state: 'failed', error: result.error };
        this.dropEntry(entry, 'rollback');
        removeOutbox = true;
      }
    } catch {
      if (!this.pending.includes(entry)) return;
      // ONLY failure-to-communicate lands here (the transports' contract):
      // park and retry when the connection returns. Server verdicts —
      // including crashes — arrive as VALUES above, never as throws.
      entry.state = 'queued';
      this.notify();
      return; // unsettled — flushQueued() picks it back up
    }
    if (removeOutbox) void this.options.localCache.removeOutbox(entry.mutationId).catch(() => {});
    this.logMutation(info);
    entry.resolveSettled?.(info);
    this.notify();
  }

  /** Reentrancy LATCH (one flush loop at a time), not a teardown flag — teardown is `lifecycle`. */
  private flushing = false;

  /** Retry queued entries, oldest first, one at a time (order is meaning). */
  private flushQueued(): void {
    if (this.flushing) {
      return;
    }
    const generation = this.connectionGeneration;
    this.flushing = true;
    void (async () => {
      try {
        for (;;) {
          if (this.lifecycle.signal.aborted) {
            return; // closed mid-flush: entries stay queued in the outbox for the next session
          }
          const next = this.pending.find((entry) => entry.state === 'queued');
          if (!next) {
            return;
          }
          next.state = 'pending';
          this.notify();
          await this.attemptSend(next);
          if ((next.state as MutationState) === 'queued') {
            return; // still offline — stop; the next reconnect flushes again
          }
        }
      } finally {
        this.flushing = false;
        if (generation !== this.connectionGeneration) this.flushQueued();
      }
    })();
  }

  /** Restore durable previews and queue their registered handlers in enqueue order. */
  private async restoreOutbox(): Promise<void> {
    const entries = await this.options.localCache.loadOutbox().catch(() => []);
    for (const persisted of entries) {
      if (this.lifecycle.signal.aborted) {
        return; // closed mid-replay: the outbox keeps the rest for next boot
      }
      if (this.pending.some((entry) => entry.mutationId === persisted.mutationId)) {
        continue; // enqueued this session; the normal path owns it
      }
      const calls: OptimisticCall[] = [];
      let invalid: string | undefined;
      for (const call of persisted.calls) {
        const decl = this.declarations.mutations.get(call.mutation);
        if (!decl) {
          invalid = `No client mutation declaration is registered for "${call.mutation}".`;
          break;
        }
        calls.push({ decl, args: call.args, ids: call.ids });
      }
      const preview = [] as Array<{ collection: string; rowId: string; value: Row | undefined }>;
      if (!invalid) {
        for (const write of persisted.preview) {
          const collection = this.declarations.collections.get(write.collection);
          if (!collection) {
            invalid = `No client collection declaration is registered for "${write.collection}".`;
            break;
          }
          if (write.value === null) {
            preview.push({ collection: write.collection, rowId: write.rowId, value: undefined });
            continue;
          }
          try {
            const row = freezeRow({ ...validateRow(`outbox preview ${write.collection}`, collection.schema, write.value) });
            const rowId = validateCollectionKey(collection, row, `Outbox preview collection "${write.collection}"`);
            if (rowId !== write.rowId) throw new Error(`Outbox preview key changed from "${write.rowId}" to "${rowId}".`);
            preview.push({ collection: write.collection, rowId, value: row });
          } catch (error) {
            invalid = error instanceof Error ? error.message : String(error);
            break;
          }
        }
      }
      if (invalid) {
        logger.error(`wheel: discarded durable command ${persisted.mutationId}: ${invalid}`);
        void this.options.localCache.removeOutbox(persisted.mutationId).catch(() => {});
        continue;
      }
      const result = this.materializer.restoreCommand(
        {
          mutationId: persisted.mutationId,
          calls: calls.map((call) => ({ mutation: call.decl, args: call.args, ids: call.ids })),
          requireUndo: false
        },
        preview
      );
      if (result.state !== 'pending') {
        logger.error(`wheel: discarded durable command ${persisted.mutationId}: ${result.message ?? result.state}`);
        void this.options.localCache.removeOutbox(persisted.mutationId).catch(() => {});
        continue;
      }
      const entry: OptimisticEntry = {
        mutationId: persisted.mutationId,
        calls,
        state: 'queued'
      };
      this.pending.push(entry);
    }
    if (entries.length > 0) this.notify();
  }

  private logMutation(info: MutationInfo): void {
    for (const mutation of new Set(info.mutations)) {
      const log = this.mutationLog.get(mutation) ?? [];
      log.push(info);
      this.mutationLog.set(mutation, log);
    }
  }

  /** The audit trail of one mutation name: last outcome and all attempts. */
  mutationState<Args extends Record<string, unknown>>(decl: MutationDecl<Args> | string): { last?: MutationInfo; all: readonly MutationInfo[] } {
    const name = typeof decl === 'string' ? decl : decl.name;
    const settledLog = this.mutationLog.get(name) ?? [];
    const pendingInfos = this.pending
      .filter((entry) => entry.calls.some((call) => call.decl.name === name))
      .map((entry): MutationInfo => ({
        mutationId: entry.mutationId,
        mutations: entry.calls.map((call) => call.decl.name),
        state: entry.state
      }));
    const all = [...settledLog, ...pendingInfos];
    return { last: all[all.length - 1], all };
  }

  private dropEntry(entry: OptimisticEntry, cause: 'rollback' | 'orphaned'): void {
    entry.rollbackUndoBookkeeping?.();
    entry.rollbackUndoBookkeeping = undefined;
    const writes = this.materializer.commandWrites(entry.mutationId);
    const index = this.pending.indexOf(entry);
    if (index >= 0) {
      this.pending.splice(index, 1);
    }
    this.materializer.removeCommand(
      entry.mutationId,
      cause === 'orphaned' ? 'orphaned' : entry.state === 'failed' ? 'failed' : 'rejected'
    );
    for (const write of writes) {
      this.provenance.record({
        at: this.options.clock.now(),
        collection: write.collection,
        rowId: write.rowId,
        value: this.materializer.confirmedGet(write.collection, write.rowId),
        cause: { kind: cause, mutationId: entry.mutationId, mutations: entry.calls.map((call) => call.decl.name) }
      });
    }
  }

  /**
   * Confirmed entries whose seq the materializer has caught up with are done.
   * Until then the command keeps replaying over confirmed state; early release
   * would revert the row until the delta or checkpoint arrives.
   */
  private releaseSettledEntries(): void {
    const settled = this.pending.filter(
      (entry) =>
        entry.state === 'confirmed' &&
        entry.confirmedGeneration === this.connectionGeneration &&
        entry.confirmedSeq !== undefined &&
        this.checkpointSeq >= entry.confirmedSeq
    );
    if (settled.length === 0) return;
    this.materializer.applyServerBatch({
      queries: [],
      settledCommandIds: settled.map((entry) => entry.mutationId)
    });
    for (const entry of settled) {
      this.pending.splice(this.pending.indexOf(entry), 1);
      void this.options.localCache.removeOutbox(entry.mutationId).catch(() => {});
    }
    this.handleReplayFailures();
  }

  /** Settle replay failures after the server sequence identifies self-effects versus peer effects. */
  private handleReplayFailures(): void {
    for (const entry of [...this.pending]) {
      const failure = this.materializer.commandReplayFailure(entry.mutationId);
      if (!failure) continue;
      if (failure.state === 'orphaned') {
        if (this.materializer.commandUsesPreview(entry.mutationId)) continue;
        if (entry.state === 'pending' || entry.state === 'queued') {
          entry.replayOrphanedAtSeq ??= this.appliedSeq;
          continue;
        }
        if (entry.state === 'confirmed' && entry.confirmedSeq === this.appliedSeq) continue;
        entry.state = 'orphaned';
        const info: MutationInfo = {
          mutationId: entry.mutationId,
          mutations: entry.calls.map((call) => call.decl.name),
          state: 'orphaned'
        };
        this.logMutation(info);
        entry.resolveSettled?.(info);
        void this.options.localCache.removeOutbox(entry.mutationId).catch(() => {});
        this.dropEntry(entry, 'orphaned');
        continue;
      }
      logger.error(
        `wheel: optimistic mutation group [${entry.calls.map((call) => call.decl.name).join(', ')}] ` +
          `(${entry.mutationId}) threw during replay; the group was marked failed and rolled back.`,
        failure.message
      );
      entry.state = 'failed';
      const info: MutationInfo = {
        mutationId: entry.mutationId,
        mutations: entry.calls.map((call) => call.decl.name),
        state: 'failed',
        error: {
          kind: 'error',
          code: 'optimistic_handler_error',
          message: failure.message ?? 'Optimistic mutation replay failed.'
        }
      };
      this.logMutation(info);
      entry.resolveSettled?.(info);
      void this.options.localCache.removeOutbox(entry.mutationId).catch(() => {});
      this.dropEntry(entry, 'rollback');
    }
  }

  // ── server events ──────────────────────────────────────────────────────

  // Highest data seq applied in this connection. Replay-orphan classification
  // compares it with mutation results. Durable command release uses the
  // separate checkpointSeq because only a checkpoint proves reruns completed.
  private appliedSeq = 0;
  /** Non-null during rebootstrap: ordered data events awaiting the atomic snapshot swap. */
  private rebootstrapBuffer: ServerEvent[] | null = null;

  private applyEvent(event: ServerEvent): void {
    if (
      this.rebootstrapBuffer &&
      (event.type === 'delta' || event.type === 'query_status' || event.type === 'checkpoint')
    ) {
      this.rebootstrapBuffer.push(event);
      return;
    }
    if (event.type === 'hello') {
      // A hello starts a new server connection. The previous connection can
      // vanish during a deploy before it sends peer leave events.
      this.connectionGeneration += 1;
      this.lastSeq = 0;
      this.appliedSeq = 0;
      this.checkpointSeq = 0;
      for (const entry of this.pending) {
        if (entry.state !== 'confirmed') continue;
        entry.state = 'queued';
        entry.confirmedSeq = undefined;
        entry.confirmedGeneration = undefined;
      }
      const hadPeers = this.peerPresence.size > 0 || this.peerPresenceActors.size > 0;
      this.peerPresence.clear();
      this.peerPresenceActors.clear();
      if (hadPeers) this.notify();
    } else if (event.type === 'delta') {
      this.applyDelta(event.delta);
    } else if (event.type === 'query_status') {
      this.applyQueryStatus(event.status);
    } else if (event.type === 'checkpoint') {
      this.applyCheckpoint(event.seq);
    } else if (event.type === 'presence') {
      if (event.state === null) {
        this.peerPresence.delete(event.clientId);
        this.peerPresenceActors.delete(event.clientId);
      } else {
        this.peerPresence.set(event.clientId, event.state);
        this.peerPresenceActors.set(event.clientId, event.actor);
      }
      this.notify();
    }
  }

  // Coalescing state + the last-published state, which reconnects
  // republish (the server drops presence with the dead stream; without the
  // republish, peers see this client vanish until its next natural update).
  private lastPublishedPresence: Record<string, unknown> | null = null;
  private cancelPresenceWindow: (() => void) | undefined;
  private pendingPresence: Record<string, unknown> | null | undefined; // undefined = nothing pending
  private presenceCoalesceMs = 0;

  /**
   * Publish this client's ephemeral presence (cursor, focus, live-typing
   * preview…) — fire-and-forget, no history, dies with the connection.
   *
   * ONE TYPED CALLING CONVENTION (4.4): the presence declaration is always the
   * first argument and the state is validated against it HERE, loudly — a bad
   * shape is this app's bug, caught at the call site. There is no untyped form
   * to fall into (which used to be told apart by sniffing the argument for a
   * `kind` field).
   *
   * `coalesceMs`: the first call in a quiet period sends immediately;
   * later calls inside the window replace each other and the LATEST state
   * sends when it closes — a trailing send is guaranteed, so peers always
   * converge on the final state. Calls without the option send immediately
   * and cancel any pending coalesced send (the newer state supersedes it).
   */
  setPresence<State extends Record<string, unknown>>(
    decl: PresenceDecl<State>,
    state: State | null,
    options?: { coalesceMs?: number }
  ): void {
    if (state !== null) {
      validateRow(`presence "${decl.name}"`, decl.state, state);
    }
    const coalesceMs = options?.coalesceMs ?? 0;
    if (coalesceMs <= 0) {
      this.cancelPresenceTimer();
      this.publishPresence(state);
      return;
    }
    this.presenceCoalesceMs = coalesceMs;
    if (this.cancelPresenceWindow === undefined) {
      // Leading send: the window just opened — peers see the change with no
      // added latency; the timer only exists to gate the NEXT send.
      this.publishPresence(state);
      this.cancelPresenceWindow = this.defer.schedule(coalesceMs, this.flushPendingPresence);
    } else {
      this.pendingPresence = state;
    }
  }

  /** The injectable timer seam - no bare setTimeout in src/, so tests control time. */
  private get defer(): Defer {
    return this.options.defer ?? systemDefer;
  }

  /** Trailing edge of the coalescing window: send the latest pending state, keep the window rolling while calls keep coming. */
  private readonly flushPendingPresence = (): void => {
    this.cancelPresenceWindow = undefined;
    if (this.pendingPresence !== undefined) {
      const state = this.pendingPresence;
      this.pendingPresence = undefined;
      this.publishPresence(state);
      this.cancelPresenceWindow = this.defer.schedule(this.presenceCoalesceMs, this.flushPendingPresence);
    }
  };

  private cancelPresenceTimer(): void {
    this.cancelPresenceWindow?.();
    this.cancelPresenceWindow = undefined;
    this.pendingPresence = undefined;
  }

  private publishPresence(state: Record<string, unknown> | null): void {
    this.lastPublishedPresence = state;
    void this.options.transport.setPresence(this.options.clientId, state).catch(() => {
      // ephemeral by definition: a lost presence update is not an error
    });
  }

  /**
   * Every OTHER client's latest presence, validated against the declaration
   * and keyed by clientId (self excluded — you know where you are).
   *
   * ONE TYPED CALLING CONVENTION (4.4): the declaration is required. Each
   * peer's state is checked against it; the result SPLITS into `valid` (peers
   * that matched) and `failures` (peers whose payload the decl rejected — a
   * peer on an older schema). Crucially, an invalid peer is SURFACED in
   * `failures`, not silently dropped: a peer that stops appearing because its
   * schema drifted is now visible ("this peer's presence didn't validate")
   * instead of an unexplained absence. A bad peer still never crashes this
   * client.
   */
  peers<State extends Record<string, unknown>>(decl: PresenceDecl<State>): PeersResult<State> {
    const valid = new Map<string, State>();
    const failures = new Map<string, PeerPresenceFailure>();
    const actors = new Map(this.peerPresenceActors);
    for (const [clientId, state] of this.peerPresence) {
      try {
        valid.set(clientId, validateRow(`presence "${decl.name}"`, decl.state, state));
      } catch (error) {
        if (!(error instanceof RowValidationError)) throw error;
        failures.set(clientId, {
          clientId,
          actor: actors.get(clientId) ?? 'unknown',
          state,
          issues: error.issues
        });
      }
    }
    return { valid, failures, actors };
  }

  private applySnapshot(subscription: ClientSubscription, snapshot: Snapshot): void {
    const snapshotRows = this.prepareSnapshot(subscription, snapshot);
    this.materializer.applyServerBatch({
      queries: [
        {
          query: subscription.query,
          params: subscription.params,
          puts: snapshotRows.map(({ row }) => row),
          order: snapshotRows.map(({ id }) => id),
          status: snapshot.status
        }
      ]
    });
    this.recordSnapshot(subscription, snapshot, snapshotRows);
    this.releaseSettledEntries();
    this.handleReplayFailures();
    this.notify();
  }

  private prepareSnapshot(
    subscription: ClientSubscription,
    snapshot: Snapshot
  ): Array<{ id: string; row: Row }> {
    const collection = subscription.query.into;
    const snapshotRows = snapshot.rows.map((raw, index) => {
      const row = freezeRow({
        ...validateRow(`snapshot query ${subscription.query.name}`, collection.schema, raw)
      });
      const id = validateCollectionKey(collection, row, `Snapshot query "${subscription.query.name}" row ${index}`);
      return { id, row, index };
    });
    const firstIndexes = new Map<string, number>();
    for (const { id, index } of snapshotRows) {
      const firstIndex = firstIndexes.get(id);
      if (firstIndex !== undefined) {
        throw new Error(
          `Snapshot query "${subscription.query.name}" has duplicate key ${JSON.stringify(id)} for collection "${collection.name}" at rows ${firstIndex} and ${index}.`
        );
      }
      firstIndexes.set(id, index);
    }
    return snapshotRows;
  }

  private recordSnapshot(
    subscription: ClientSubscription,
    snapshot: Snapshot,
    snapshotRows: readonly { id: string; row: Row }[]
  ): void {
    const collection = subscription.query.into;
    for (const { id, row } of snapshotRows) {
      this.provenance.record({
        at: this.options.clock.now(),
        collection: collection.name,
        rowId: id,
        value: row,
        cause: { kind: 'bootstrap', seq: snapshot.seq, subscriptionId: snapshot.subscriptionId }
      });
    }
    subscription.lastDeltaSeq = Math.max(subscription.lastDeltaSeq ?? 0, snapshot.seq);
    subscription.lastStatusSeq = Math.max(subscription.lastStatusSeq ?? 0, snapshot.seq);
    this.lastSeq = Math.max(this.lastSeq, snapshot.seq);
    this.appliedSeq = Math.max(this.appliedSeq, snapshot.seq);
    if (snapshot.status.kind === 'live') this.schedulePersist(subscription);
  }

  private applyQueryStatus(event: QueryStatusEvent): void {
    const subscription = this.subscriptionsById.get(event.subscriptionId);
    if (!subscription) return;
    if (event.query !== subscription.query.name) {
      throw new Error(
        `Query status for subscription "${event.subscriptionId}" named "${event.query}" instead of "${subscription.query.name}".`
      );
    }
    if (event.seq < subscription.lastStatusSeq) return;
    subscription.lastStatusSeq = event.seq;
    this.materializer.applyServerBatch({
      queries: [
        {
          query: subscription.query,
          params: subscription.params,
          order: this.materializer.queryOrder(subscription.query, subscription.params),
          status: event.status
        }
      ]
    });
    this.lastSeq = Math.max(this.lastSeq, event.seq);
    if (event.status.kind === 'live') this.schedulePersist(subscription);
    this.notify();
  }

  private applyCheckpoint(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0) {
      throw new Error(`Sync checkpoint seq must be a non-negative safe integer; received ${JSON.stringify(seq)}.`);
    }
    this.lastSeq = Math.max(this.lastSeq, seq);
    this.appliedSeq = Math.max(this.appliedSeq, seq);
    this.checkpointSeq = Math.max(this.checkpointSeq, seq);
    this.releaseSettledEntries();
    this.notify();
  }

  /** Subscription keys with unpersisted changes, flushed together next microtask. */
  private readonly persistQueue = new Set<string>();

  /**
   * Persist a subscription's confirmed rows (base, never optimistic overlay)
   * for next boot's hydration. Coalesced per microtask; failures are ignored
   * — persistence is an accelerator, the wire is the truth.
   */
  private schedulePersist(subscription: ClientSubscription): void {
    if (this.persistQueue.size === 0) {
      queueMicrotask(() => {
        const keys = [...this.persistQueue];
        this.persistQueue.clear();
        if (this.lifecycle.signal.aborted) {
          return; // closed before the flush ran; the cache keeps its last good state
        }
        for (const key of keys) {
          const sub = this.subscriptions.get(key);
          const status = sub && this.materializer.queryStatus(sub.query, sub.params);
          if (!sub || sub.stale || status?.kind !== 'live') continue;
          void this.options.localCache
            .saveSubscription({
              key: sub.key,
              subscriptionId: sub.subscriptionId,
              seq: sub.lastDeltaSeq,
              rows: this.materializer.confirmedQueryRows(sub.query, sub.params),
              order: this.materializer.queryOrder(sub.query, sub.params)
            })
            .catch(() => {});
        }
      });
    }
    this.persistQueue.add(subscription.key);
  }

  private applyDelta(delta: RowDelta): void {
    const subscription = this.subscriptionsById.get(delta.subscriptionId);
    if (!subscription) {
      return;
    }
    if (delta.seq <= subscription.lastDeltaSeq) {
      return; // stale: a later delta already superseded this state (whole-row model)
    }
    const collection = subscription.query.into;
    const puts = delta.puts.map((raw, index) => {
      const row = freezeRow({
        ...validateRow(`delta query ${subscription.query.name}`, collection.schema, raw)
      });
      const id = validateCollectionKey(collection, row, `Delta query "${subscription.query.name}" put ${index}`);
      return { id, row, index };
    });
    const putIndexes = new Map<string, number>();
    for (const { id, index } of puts) {
      const firstIndex = putIndexes.get(id);
      if (firstIndex !== undefined) {
        throw new Error(
          `Delta query "${subscription.query.name}" has duplicate put key ${JSON.stringify(id)} for collection "${collection.name}" at rows ${firstIndex} and ${index}.`
        );
      }
      putIndexes.set(id, index);
    }
    const orderIds = new Set<string>();
    for (const [index, id] of delta.order.entries()) {
      if (typeof id !== 'string' || id.trim() === '') {
        throw new Error(`Delta query "${subscription.query.name}" order ${index} must be a non-empty string.`);
      }
      if (orderIds.has(id)) {
        throw new Error(
          `Delta query "${subscription.query.name}" has duplicate order key ${JSON.stringify(id)} for collection "${collection.name}".`
        );
      }
      orderIds.add(id);
    }
    subscription.lastDeltaSeq = delta.seq;
    this.materializer.applyServerBatch({
      queries: [
        {
          query: subscription.query,
          params: subscription.params,
          puts: puts.map(({ row }) => row),
          deletes: delta.deletes,
          order: delta.order,
          status: this.materializer.queryStatus(subscription.query, subscription.params) ?? { kind: 'live' }
        }
      ]
    });
    for (const { id, row } of puts) {
      this.provenance.record({
        at: this.options.clock.now(),
        collection: collection.name,
        rowId: id,
        value: row,
        cause: { kind: 'sync-apply', seq: delta.seq, subscriptionId: delta.subscriptionId }
      });
    }
    for (const id of delta.deletes) {
      this.provenance.record({
        at: this.options.clock.now(),
        collection: collection.name,
        rowId: id,
        value: undefined,
        cause: { kind: 'sync-apply', seq: delta.seq, subscriptionId: delta.subscriptionId }
      });
    }
    this.lastSeq = Math.max(this.lastSeq, delta.seq);
    this.appliedSeq = Math.max(this.appliedSeq, delta.seq);
    this.schedulePersist(subscription);
    this.releaseSettledEntries();
    this.handleReplayFailures();
    this.notify();
  }

  // ── local undo/redo (built on invertible mutations) ───────────────────

  /** Whether an invertible local mutation is available to undo. */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Whether an undone mutation is available to redo. */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Undo the most recent invertible LOCAL mutation by issuing its inverse as
   * a normal mutation (optimistic, synced, provenance-tagged). If the state
   * changed under it (someone else edited), the inverse can reject — the
   * entry is consumed either way, and the caller sees the rejection on the
   * returned handle.
   */
  undo(): MutationHandle | null {
    const inverseGroup = this.undoStack.pop();
    if (!inverseGroup) {
      return null;
    }
    this.replaying = 'undo';
    try {
      return this.mutateCommand(inverseGroup, false);
    } finally {
      this.replaying = null;
    }
  }

  /** Redo the most recently undone mutation (same rules as undo). */
  redo(): MutationHandle | null {
    const inverseGroup = this.redoStack.pop();
    if (!inverseGroup) {
      return null;
    }
    this.replaying = 'redo';
    try {
      return this.mutateCommand(inverseGroup, false);
    } finally {
      this.replaying = null;
    }
  }

  // ── audit surface ──────────────────────────────────────────────────────

  /**
   * A row's current value plus its full provenance chain.
   *
   * ONE TYPED CALLING CONVENTION (4.4): address the row by its collection
   * DECLARATION plus id — `explain(todos, todoId)`. The old stringly form
   * (`explain("todos.row(id).done")`) is gone: it silently ignored trailing
   * property suffixes, exactly the kind of quiet wrongness this pass removes.
   */
  explain<RowT extends Row>(collection: CollectionDecl<RowT>, id: string): ExplainResult<RowT> {
    const history = this.provenance.forRow(collection.name, id);
    return {
      value: this.materializer.get(collection, id),
      cause: history[history.length - 1]?.cause,
      history
    };
  }

  /** Every collection and its current effective rows — the debug panel's state tree. */
  collectionsDebug(): Array<{ collection: string; rows: readonly Row[] }> {
    return this.materializer.collectionsDebug();
  }

  /** The most recent provenance entries, newest last — the debug panel's change stream. */
  recentWrites(limit = 50): readonly ProvenanceEntry[] {
    const all = this.provenance.all();
    return all.slice(Math.max(0, all.length - limit));
  }

  /** Live subscription state for the debug surfaces. */
  subscriptionsDebug(): Array<{ key: string; subscriptionId: string; refs: number; rows: number }> {
    return [...this.subscriptions.values()].map((subscription) => ({
      key: subscription.key,
      subscriptionId: subscription.subscriptionId,
      refs: subscription.refs,
      rows: this.materializer.queryOrder(subscription.query, subscription.params).length
    }));
  }

  /** Record that one collection's effective rows moved; the next notify carries it. */
  private markChanged(collection: string): void {
    this.changedCollections.add(collection);
  }

  private notify(): void {
    this.version += 1;
    const changed = this.changedAll ? undefined : new Set(this.changedCollections);
    this.changedAll = false;
    this.changedCollections.clear();
    for (const listener of [...this.listeners]) {
      listener(changed);
    }
  }

  /** Monotonic change counter — the React binding's useSyncExternalStore snapshot. */
  getVersion(): number {
    return this.version;
  }

  // ── rebootstrap coalescing state ──────────────────────────────────────
  //
  // A flapping stream fires onReconnect once per re-open, and OVERLAPPING
  // full resyncs are actively dangerous: each run resets `rebootstrapBuffer`
  // and nulls it in its finally, so a second concurrent run would (a) discard
  // deltas the first run buffered and (b) crash iterating a buffer the first
  // run already nulled (found by reconnect.test.ts before this coalescer
  // existed). Invariant: at most ONE run in flight (`rebootstrapRun`) plus at
  // most ONE queued follow-up (`rebootstrapNext`) — a storm of N triggers
  // collapses to two runs, and the follow-up is REQUIRED, not an
  // optimization: a trigger that lands mid-run may reflect server state the
  // in-flight run's snapshots predate.
  private rebootstrapRun: Promise<void> | null = null;
  private rebootstrapNext: Promise<void> | null = null;

  /**
   * FUNNEL entry point: full resync after the transport re-opened a dropped
   * stream (the transport's onReconnect wiring calls this). Re-runs every
   * subscription's snapshot, swaps fresh server truth in, and replays pending
   * commands on top. Coalesced — see the invariant above. A rejected
   * run (connection died again mid-bootstrap) left NO partial state behind
   * (see doRebootstrap) and is retried by the next reconnect trigger, never
   * by a self-retry loop.
   */
  rebootstrap(): Promise<void> {
    if (this.rebootstrapRun) {
      if (!this.rebootstrapNext) {
        this.rebootstrapNext = this.rebootstrapRun
          .catch(() => {
            // The in-flight run's failure belongs to ITS callers; the
            // follow-up still runs (this trigger's evidence stands).
          })
          .then(() => {
            this.rebootstrapNext = null;
            return this.rebootstrap();
          });
      }
      return this.rebootstrapNext;
    }
    this.rebootstrapRun = this.doRebootstrap().finally(() => {
      this.rebootstrapRun = null;
    });
    return this.rebootstrapRun;
  }

  /**
   * One full resync pass. Ordering constraints, each load-bearing:
   *
   *  1. ALL snapshot fetches complete BEFORE the old base is dropped — the UI
   *     keeps rendering last-known data through the refetch, and a connection
   *     death mid-fetch rejects the whole run with NOTHING cleared (the stale
   *     cache survives for the next attempt).
   *  2. The swap itself (clear base → register ids → apply snapshots) is
   *     synchronous — no await sits between clearing and repopulating, so no
   *     event can ever observe the half-swapped state.
   *  3. Deltas, query statuses, and checkpoints arriving before the new ids
   *     register land in `rebootstrapBuffer` and replay after the swap.
   *  4. Presence republish comes last: the server dropped this client's
   *     presence with the dead stream, and without the republish peers see
   *     this client vanish until its next natural update.
   */
  private async doRebootstrap(): Promise<void> {
    const signal = this.lifecycle.signal;
    this.rebootstrapBuffer = [];
    try {
      // All snapshot fetches go out concurrently — reconnect cost is one
      // round trip of latency, not O(subscriptions) of them.
      const snapshots = await Promise.all(
        [...this.subscriptions.values()].map(async (subscription) => ({
          subscription,
          snapshot: await this.options.transport.subscribe(this.options.clientId, subscription.query.name, subscription.params)
        }))
      );
      if (signal.aborted) {
        return; // closed while fetching: leave the last-known state untouched
      }
      this.subscriptionsById.clear();
      const accepted: Array<{
        subscription: ClientSubscription;
        snapshot: Snapshot;
        rows: Array<{ id: string; row: Row }>;
      }> = [];
      for (const { subscription, snapshot } of snapshots) {
        if (this.subscriptions.get(subscription.key) !== subscription) {
          void this.options.transport.unsubscribe(this.options.clientId, snapshot.subscriptionId).catch(() => {});
          continue;
        }
        subscription.subscriptionId = snapshot.subscriptionId;
        this.subscriptionsById.set(snapshot.subscriptionId, subscription);
        // The reconnected server may be a fresh epoch (restart → seq resets);
        // the snapshot is the authority now. Without this reset, deltas from
        // the new epoch are silently refused until seq outgrows the old one.
        // Mirrors the reset in ensureWireSubscription() — keep both in sync.
        subscription.lastDeltaSeq = 0;
        subscription.lastStatusSeq = 0;
        // A wire snapshot IS the upgrade out of hydrated-cache mode: a
        // subscription that booted stale and reconnected before its first
        // ordinary wire upgrade goes live HERE. (Without this line it stayed
        // marked stale forever — pinned by reconnect.test.ts.)
        subscription.stale = false;
        accepted.push({ subscription, snapshot, rows: this.prepareSnapshot(subscription, snapshot) });
      }
      if (accepted.length > 0) {
        this.materializer.applyServerBatch({
          queries: accepted.map(({ subscription, snapshot, rows }) => ({
            query: subscription.query,
            params: subscription.params,
            puts: rows.map(({ row }) => row),
            order: rows.map(({ id }) => id),
            status: snapshot.status
          }))
        });
        for (const { subscription, snapshot, rows } of accepted) {
          this.recordSnapshot(subscription, snapshot, rows);
        }
        this.releaseSettledEntries();
        this.handleReplayFailures();
      }
      // Data events that raced the swap replay now in original wire order.
      const buffered = this.rebootstrapBuffer;
      this.rebootstrapBuffer = null;
      for (const event of buffered) {
        this.applyEvent(event);
      }
    } finally {
      this.rebootstrapBuffer = null;
    }
    // The server dropped this client's presence with the dead stream (and a
    // superseded stream drops it too) — republish the last state so peers
    // don't see this client vanish until its next natural update.
    if (this.lastPublishedPresence !== null) {
      this.publishPresence(this.lastPublishedPresence);
    }
    // A rebootstrap replaced whole subscriptions; the scope is every collection.
    this.changedAll = true;
    this.notify();
  }

  /**
   * Tear the client down: abort the lifecycle signal (every background loop —
   * queue flush, outbox replay, stale-wire retry, rebootstrap, persistence —
   * observes it at its next boundary), cancel the presence timer, and close
   * the transport. Durable state (outbox, subscription cache) is deliberately
   * left in place: the next session boots from it.
   */
  close(): void {
    this.lifecycle.abort();
    this.stopIncompatibleServerListener?.();
    this.cancelPresenceTimer();
    this.options.transport.close(this.options.clientId);
    this.connected = false;
    // Wake parked cold subscribes so their loops observe the abort and exit.
    for (const wake of this.connectionWaiters.splice(0)) {
      wake();
    }
  }
}
