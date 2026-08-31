/**
 * Durable local persistence for the sync client. Without it, every "offline
 * hiccup" costs real work:
 *
 * - Without a persistent base cache, a tab reload drops all synced data and
 *   forces a full serial re-bootstrap of every subscription.
 * - Without a durable outbox, a reload or crash with unconfirmed mutations in
 *   flight silently loses that work.
 *
 * Design: persistence sits UNDER the existing base + pending[] → rebase()
 * overlay model, which is kept unchanged. The store is written asynchronously
 * after applies (debounced for base tables, immediately for outbox entries).
 * The optimistic preview appears first, but no wire send starts until the
 * outbox commits; storage failure removes the preview and settles the mutation
 * failed, so undurable state never masquerades as saved. On boot the client hydrates base tables from
 * the store instantly (status 'stale'), replays the outbox through the normal
 * mutate path (deterministic: the pre-generated id stream and mutationId are
 * persisted with each entry), then re-bootstraps in the background and swaps.
 *
 * Everything is keyed by (storeName, clientId) so multiple apps/tabs coexist.
 */

import type { Row } from './cache';
import { validateRowSchemaFingerprint } from '../row-schema';

/** A persisted snapshot of one subscription's server truth. */
export interface PersistedSubscription {
  readonly key: string;
  readonly subscriptionId: string;
  readonly seq: number;
  readonly rows: readonly Row[];
  readonly order: readonly string[];
}

/** A persisted pending mutation, replayable byte-for-byte. */
export interface PersistedOutboxEntry {
  readonly mutationId: string;
  readonly calls: readonly {
    readonly mutation: string;
    readonly args: Record<string, unknown>;
    /** This member's pre-generated id stream. */
    readonly ids: readonly string[];
  }[];
  readonly enqueuedAt: number;
}

/**
 * Storage contract. Implementations: IndexedDbCache (browser),
 * MemoryCache (tests/SSR). All methods are async and must never throw for
 * missing keys — absence is `undefined`/`[]`.
 */
export interface LocalCache {
  loadSubscriptions(): Promise<readonly PersistedSubscription[]>;
  saveSubscription(sub: PersistedSubscription): Promise<void>;

  loadOutbox(): Promise<readonly PersistedOutboxEntry[]>;
  /** Must be durably committed before the caller proceeds (crash safety). */
  appendOutbox(entry: PersistedOutboxEntry): Promise<void>;
  removeOutbox(mutationId: string): Promise<void>;
}

/** In-memory cache: tests, SSR, and environments without IndexedDB. */
export class MemoryCache implements LocalCache {
  private readonly subscriptions = new Map<string, PersistedSubscription>();
  private readonly outbox = new Map<string, PersistedOutboxEntry>();

  /** {@link LocalCache.loadSubscriptions} — every snapshot held in the map. */
  async loadSubscriptions(): Promise<readonly PersistedSubscription[]> {
    return [...this.subscriptions.values()];
  }
  /** {@link LocalCache.saveSubscription} — upsert keyed by subscription key. */
  async saveSubscription(sub: PersistedSubscription): Promise<void> {
    this.subscriptions.set(sub.key, sub);
  }
  /** {@link LocalCache.loadOutbox} — entries in enqueue order (replay order). */
  async loadOutbox(): Promise<readonly PersistedOutboxEntry[]> {
    return [...this.outbox.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }
  /** {@link LocalCache.appendOutbox} — a Map write is already "durable" here. */
  async appendOutbox(entry: PersistedOutboxEntry): Promise<void> {
    this.outbox.set(entry.mutationId, entry);
  }
  /** {@link LocalCache.removeOutbox} — missing ids are a no-op. */
  async removeOutbox(mutationId: string): Promise<void> {
    this.outbox.delete(mutationId);
  }
}

const DB_VERSION = 2;
const SUBS = 'subscriptions';
const OUTBOX = 'outbox';

/**
 * The two persistence scopes, split on purpose. Snapshots are row-shaped, so
 * their scope carries the app's row-schema fingerprint: a schema change
 * retires them and the client re-bootstraps — that is the designed
 * invalidation. The outbox holds mutations (name + args, replayed and deduped
 * by the server), which no schema fingerprint invalidates: scoping them by
 * the fingerprint silently abandoned every pending write that straddled a
 * schema change (found 2026-08-10). `retires` names the snapshot scopes this
 * app owns and no longer serves; the cache deletes their rows at open, because
 * a scope nothing will ever read again otherwise grows the store — and the
 * boot-time getAll over it — forever. It must answer false for every scope a
 * DIFFERENT app in the same store still serves.
 */
export interface CacheScopes {
  /** Scope for subscription snapshots — carries the schema fingerprint. */
  readonly snapshots: string;
  /** Scope for the durable outbox — carries the store identity only. */
  readonly outbox: string;
  /** True for a dead snapshot scope this app owns; its rows are deleted at open. */
  readonly retires: (scope: string) => boolean;
}

/** Build the standard split scopes for cached rows and durable pending commands. */
export function createCacheScopes(options: {
  readonly storeScope: string;
  readonly rowSchemaFingerprint: string;
}): CacheScopes {
  if (options.storeScope === '') {
    throw new TypeError('storeScope must be non-empty.');
  }
  const fingerprint = validateRowSchemaFingerprint(options.rowSchemaFingerprint);
  const prefix = `${options.storeScope}|`;
  const snapshotPrefix = `${prefix}snapshots:`;
  const snapshots = `${snapshotPrefix}${fingerprint}`;
  const outbox = `${prefix}outbox`;
  return Object.freeze({
    snapshots,
    outbox,
    retires: (scope: string) => scope.startsWith(snapshotPrefix) && scope !== snapshots
  });
}

/** IndexedDB-backed store for browsers. One database per storeName. */
export class IndexedDbCache implements LocalCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly storeName: string,
    private readonly scopes: CacheScopes
  ) {}

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`wheel:${this.storeName}`, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SUBS)) {
            db.createObjectStore(SUBS, { keyPath: 'storageKey' });
          }
          // Version 2 replaces the obsolete single-mutation outbox shape.
          // The protocol has no safe member-wise fallback, so stale version-1
          // entries cannot be replayed under the atomic command contract.
          if (event.oldVersion > 0 && event.oldVersion < 2 && db.objectStoreNames.contains(OUTBOX)) {
            db.deleteObjectStore(OUTBOX);
          }
          if (!db.objectStoreNames.contains(OUTBOX)) {
            const store = db.createObjectStore(OUTBOX, { keyPath: 'storageKey' });
            store.createIndex('scope', 'scope', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
      }).then(async (db) => {
        // Retire dead generations before anything reads. Every load is a
        // getAll over the WHOLE store, so each stranded scope taxes every
        // boot; deleting here keeps the store at one live generation. A GC
        // failure must not take the cache down with it — worst case the
        // dead rows survive one more session.
        await Promise.all([this.retireDeadScopes(db, SUBS), this.retireDeadScopes(db, OUTBOX)]).catch(
          () => {}
        );
        return db;
      });
    }
    return this.dbPromise;
  }

  /** Delete every row whose scope the app has retired (never a live scope). */
  private retireDeadScopes(db: IDBDatabase, store: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      const cursorRequest = transaction.objectStore(store).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const scope = (cursor.value as { scope?: string }).scope;
        const live = scope === this.scopes.snapshots || scope === this.scopes.outbox;
        if (typeof scope === 'string' && !live && this.scopes.retires(scope)) {
          cursor.delete();
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('scope GC aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('scope GC failed'));
    });
  }

  private async tx<T>(
    store: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode, { durability: 'strict' });
      const request = run(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
      transaction.onerror = () => reject(transaction.error ?? new Error('transaction failed'));
    });
  }

  /** {@link LocalCache.loadSubscriptions} — this client's rows, filtered by the snapshot scope. */
  async loadSubscriptions(): Promise<readonly PersistedSubscription[]> {
    const all = await this.tx<unknown[]>(SUBS, 'readonly', (s) => s.getAll());
    return (all as Array<PersistedSubscription & { scope: string }>).filter(
      (row) => row.scope === this.scopes.snapshots
    );
  }

  /** {@link LocalCache.saveSubscription} — upsert under the snapshot-scoped storage key. */
  async saveSubscription(sub: PersistedSubscription): Promise<void> {
    await this.tx(SUBS, 'readwrite', (s) =>
      s.put({ ...sub, scope: this.scopes.snapshots, storageKey: `${this.scopes.snapshots}|${sub.key}` })
    );
  }

  /** {@link LocalCache.loadOutbox} — this client's entries in enqueue (replay) order. */
  async loadOutbox(): Promise<readonly PersistedOutboxEntry[]> {
    const all = await this.tx<unknown[]>(OUTBOX, 'readonly', (s) => s.getAll());
    return (all as Array<PersistedOutboxEntry & { scope: string }>)
      .filter((row) => row.scope === this.scopes.outbox)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  /** {@link LocalCache.appendOutbox} — strict-durability transaction; resolves only after commit. */
  async appendOutbox(entry: PersistedOutboxEntry): Promise<void> {
    await this.tx(OUTBOX, 'readwrite', (s) =>
      s.put({ ...entry, scope: this.scopes.outbox, storageKey: `${this.scopes.outbox}|${entry.mutationId}` })
    );
  }

  /** {@link LocalCache.removeOutbox} — missing ids are a no-op. */
  async removeOutbox(mutationId: string): Promise<void> {
    await this.tx(OUTBOX, 'readwrite', (s) => s.delete(`${this.scopes.outbox}|${mutationId}`));
  }
}
