/**
 * The data-backed half of the service kernel: `SyncService` and its
 * `liveQuery` / `liveQueryFor` / `mutate` members.
 *
 * This lives in `sync` (not `core`) because it is the one place the plain
 * kernel's narrow `ContextClient` seam is widened back to the full sync
 * `SyncClient` — the single documented core↔sync boundary. Everything a
 * `SyncService` subclass needs (subscribe, mutate) rides that client; the
 * kernel itself never names it.
 */

import { canonicalParams } from '../core/params';
import { captureDeclSite } from '../core/decl-site';
import type { DebugMeta } from '../core/debug-registry';
import { Service, INHERIT_SCOPE, type ComputedAccessor, type ComputedFor } from '../core/services';
import type { MutationDecl, QueryDecl } from './declarations';
import type { SyncClient, MutationHandle, QueryHandle } from './client/client';

/** Query subscription lifecycle, surfaced as a value. Errors are sticky. */
export type QueryStatus =
  | { kind: 'loading' }
  | { kind: 'live' }
  | { kind: 'error'; error: unknown };

/** Live rows + status for one (query, params) subscription. */
export interface LiveQueryView<RowT> {
  readonly status: QueryStatus;
  readonly rows: readonly RowT[];
}

/** A keyed live-query family with explicit, caller-controlled entry lifetime. */
export type LiveQueryFor<Key extends string, RowT> = ((key: Key) => LiveQueryView<RowT>) & {
  /** Release one key immediately. A later read subscribes again. */
  release(key: Key): boolean;
  /** Release every key materialized through this family. */
  clear(): void;
  /** Number of keys currently materialized through this family. */
  size(): number;
};

interface QuerySlot {
  readonly view: LiveQueryView<Record<string, unknown>>;
  readonly release: () => void;
}

/**
 * Service with access to synced data: liveQuery subscriptions and mutations.
 */
export abstract class SyncService extends Service {
  /**
   * The scope-inheritance marker the kernel reads in `shouldInherit`. Setting it
   * here (and only here) is how `inheritServices: 'live'` recognizes sync
   * services without core ever naming this class. Subclasses inherit it via the
   * static chain.
   */
  static [INHERIT_SCOPE] = true;

  private readonly querySlots = new Map<string, QuerySlot>();

  /**
   * The sync client — SyncService always has one (the provider guarantees it).
   *
   * THE single documented core↔sync boundary: the kernel hands back the narrow
   * `ContextClient` it holds; SyncService — the only thing that needs
   * subscribe/mutate — narrows it to the full `SyncClient` here. This is the one
   * place sync knowledge re-enters, by design.
   */
  protected get client(): SyncClient {
    return this.context.requireClient() as SyncClient;
  }

  /**
   * Subscribe to a query. Views are cached per (query, canonical params) and
   * retained until service destroy. Subscribe errors are sticky — identical
   * retries can't fix a refused subscription.
   */
  protected liveQuery<Params extends Record<string, unknown>, RowT extends Record<string, unknown>>(
    query: QueryDecl<Params, RowT>,
    params: Params
  ): LiveQueryView<RowT> {
    const key = `${query.name}|${canonicalParams(params)}`;
    const existing = this.querySlots.get(key);
    if (existing) return existing.view as LiveQueryView<RowT>;

    const context = this.context;
    const registry = context.registry;
    const meta: DebugMeta = {
      id: registry.nextId('liveQuery'),
      name: key,
      kind: 'liveQuery',
      declaredAt: captureDeclSite()
    };

    let handle: QueryHandle<RowT> | null = null;
    let error: unknown = null;
    // WHY `released`: unmount can outrun the subscribe round-trip — if cleanup
    // ran while subscribe was in flight, release the late handle immediately
    // instead of leaking the server subscription and bumping a disposed root.
    let released = false;
    this.client
      .subscribe(query, params)
      .then((h) => {
        if (released) {
          h.release();
          return;
        }
        handle = h;
        // Arrival is client-data invalidation for THIS query's table: bump
        // its channel (and the coarse one for status readers).
        context.bumpTables(new Set([query.into.name]));
      })
      .catch((e) => {
        if (released) return;
        error = e;
        context.bumpTables(new Set([query.into.name]));
      });

    // IDENTITY-STABLE ROWS. The getter tracks only this query's TABLE
    // channel, and rebuilds the array only when that channel moved. Two
    // consequences, both load-bearing: a write to another table re-derives
    // nothing (the old shape re-ran every mounted rows consumer on every
    // change anywhere), and between changes every read returns the SAME
    // array, so a memo's `===` cut actually holds.
    let cachedRows: readonly RowT[] | null = null;
    let cachedVersion = -1;
    const view: LiveQueryView<RowT> = {
      get status(): QueryStatus {
        context.trackVersion();
        if (error !== null) return { kind: 'error', error };
        return handle ? { kind: 'live' } : { kind: 'loading' };
      },
      get rows(): readonly RowT[] {
        const version = context.trackTable(query.into.name);
        if (cachedRows === null || cachedVersion !== version) {
          cachedRows = handle ? handle.rows() : [];
          cachedVersion = version;
        }
        return cachedRows;
      }
    };
    // Non-enumerable so it never shows up in the connect shape or a spread, but
    // view() can read it to record the component → liveQuery dependency edge.
    Object.defineProperty(view, '__debugMeta', { value: meta, enumerable: false });
    // The debug read is the WHOLE view — status + rows — so the state tree
    // expands into the actual synced data, not an opaque row count.
    registry.registerPrimitive(meta, () => ({ status: view.status, rows: view.rows }));
    const release = (): void => {
      const current = this.querySlots.get(key);
      if (!current || current.view !== view) return;
      released = true;
      handle?.release();
      handle = null;
      this.querySlots.delete(key);
      registry.removePrimitive(meta.id);
      context.bump();
    };
    this.querySlots.set(key, {
      view: view as LiveQueryView<Record<string, unknown>>,
      release
    });
    this.addCleanup(release);
    return view;
  }

  /**
   * A KEYED family of liveQuery views — the ergonomic form of "subscribe per
   * team/issue/user, lazily, on first read":
   *
   *   private readonly issuesByTeamView = this.liveQueryFor(issuesByTeam, (teamId: string) => ({ teamId }));
   *   // ...
   *   this.issuesByTeamView(teamId).rows   // typed rows; subscribes on first call
   *
   * This is sugar, not machinery: `liveQuery` already caches one view per
   * (query, canonical params) and retains it until service destroy, so the
   * hand-rolled `Map<key, view>` + getter pattern this replaces (which also
   * erased the row type through `LiveQueryView<Record<string, unknown>>`)
   * was duplicating the kernel's own dedupe — and app services copy-paste
   * that pattern endlessly when the sugar is missing.
   */
  protected liveQueryFor<
    Key extends string,
    Params extends Record<string, unknown>,
    RowT extends Record<string, unknown>
  >(query: QueryDecl<Params, RowT>, toParams: (key: Key) => Params): LiveQueryFor<Key, RowT> {
    const familyKeys = new Map<Key, string>();
    const callable = (key: Key): LiveQueryView<RowT> => {
      const params = toParams(key);
      familyKeys.set(key, `${query.name}|${canonicalParams(params)}`);
      return this.liveQuery(query, params);
    };
    const release = (key: Key): boolean => {
      const slotKey = familyKeys.get(key);
      if (!slotKey) return false;
      familyKeys.delete(key);
      const slot = this.querySlots.get(slotKey);
      if (!slot) return false;
      slot.release();
      return true;
    };
    const clear = (): void => {
      for (const key of [...familyKeys.keys()]) release(key);
    };
    this.addCleanup(() => familyKeys.clear());
    return Object.assign(callable, {
      release,
      clear,
      size: () => familyKeys.size
    });
  }

  /**
   * A derivation over a NON-reactive client value that must still refresh on
   * the client's change channel.
   *
   * Client-side bookkeeping — connection status, queued/pending mutation
   * counts, undo/redo availability — are plain numbers and booleans the client
   * updates imperatively, NOT signals. A plain `computed` over them would
   * memoize the first value and never see a change. `clientRead` reads the
   * context revision (bumped on every client `onChange`) first, so the memo is
   * subscribed to that channel and re-derives whenever the client reports any
   * change:
   *
   *   readonly status  = this.clientRead(() => this.client.connectionStatus());
   *   readonly canUndo = this.clientRead(() => this.client.canUndo());
   *
   * This replaces the `tracked()` helper apps copy-pasted with its explanatory
   * comment; the primitive is named in the debug panel like any other computed.
   */
  protected clientRead<T>(read: () => T, name?: string): ComputedAccessor<T> {
    return this.computed(() => {
      this.context.trackVersion();
      return read();
    }, name);
  }

  /**
   * The keyed form of `clientRead`: one memo per key, each riding the client
   * change channel. For per-entity client reads (peers on a block, a row's
   * provenance receipt) that are plain client calls, not reactive data:
   *
   *   readonly peersOn = this.clientReadFor((blockId: string) => this.client.peers(...));
   */
  protected clientReadFor<Args extends readonly unknown[], T>(
    read: (...args: Args) => T,
    name?: string
  ): ComputedFor<Args, T> {
    return this.computedFor((...args: Args) => {
      this.context.trackVersion();
      return read(...args);
    }, name);
  }

  /** Fire a mutation (optimistic apply + server confirm). */
  protected mutate<Args extends Record<string, unknown>>(
    mutation: MutationDecl<Args>,
    args: Args
  ): MutationHandle {
    return this.client.mutate(mutation, args);
  }
}
