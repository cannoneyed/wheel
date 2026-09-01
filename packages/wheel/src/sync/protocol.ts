/**
 * The wire contract: the exact shapes the client and server send each other.
 * Both sides speak this vocabulary, and neither side owns it — the browser
 * client and the node engine both import these types so that a message one
 * writes is a message the other can read. It lives in `core` (the shared
 * bottom layer) rather than in the server precisely so the browser client can
 * name these types WITHOUT importing the node-only server module.
 *
 * These are TYPES ONLY: no runtime code, no behavior. `DbRow` (the JSON row
 * shape that crosses the wire — `Record<string, unknown>`) is defined HERE, in
 * the shared `sync` layer, so both the browser client and the node engine
 * import it downward. It used to live in `server/db.ts`, which forced this
 * shared wire contract to reach UP into the server — the one type-only
 * core→server edge the package split resolved by giving `DbRow` a sync home.
 */
import type { MutationRejection } from './declarations';

/** The JSON row shape that crosses the wire. Both client and engine speak it. */
export type DbRow = Record<string, unknown>;

/** The wire unit of change: whole-row puts + id deletes + the full ordered id list (idempotent by construction). */
export interface RowDelta {
  readonly subscriptionId: string;
  readonly query: string;
  readonly seq: number;
  readonly puts: readonly DbRow[];
  readonly deletes: readonly string[];
  /** The full ordered id list of the query result — order comes from the SQL, ids only. */
  readonly order: readonly string[];
}

/** Safe query failure detail that may cross the wire. Full errors stay in server logs. */
export interface SyncQueryError {
  readonly code: string;
  readonly message: string;
}

/** Server-owned lifecycle for one query scope. */
export type SyncQueryStatus =
  | { readonly kind: 'live' }
  | { readonly kind: 'stale'; readonly error?: SyncQueryError }
  | { readonly kind: 'error'; readonly error: SyncQueryError };

/** A query lifecycle transition after its initial snapshot. */
export interface QueryStatusEvent {
  readonly subscriptionId: string;
  readonly query: string;
  readonly seq: number;
  readonly status: SyncQueryStatus;
}

/** Events that the server pushes through a connection. */
export type ServerEvent =
  | { readonly type: 'hello'; readonly clientId: string }
  | { readonly type: 'delta'; readonly delta: RowDelta }
  | { readonly type: 'query_status'; readonly status: QueryStatusEvent }
  | { readonly type: 'checkpoint'; readonly seq: number }
  | {
      readonly type: 'presence';
      readonly clientId: string;
      /** Authenticated actor that owns this ephemeral connection. */
      readonly actor: string;
      readonly state: Record<string, unknown> | null;
    };

/** One ordered member of an atomic mutation command. */
export interface MutateCallRequest {
  readonly name: string;
  readonly args: unknown;
  /** This member's client-generated deterministic id stream. */
  readonly ids: readonly string[];
}

/** An atomic mutation command crossing the wire; actor identity comes from the authenticated connection. */
export interface MutateGroupRequest {
  readonly clientId: string;
  readonly mutationId: string;
  readonly calls: readonly MutateCallRequest[];
}

/**
 * The server RAN (or definitively refused) this mutation and it broke — a
 * bug, not a business rule and not a network problem. Terminal: retrying the
 * identical mutation would break identically, so clients must FAIL it loudly
 * instead of queueing it (a queued poison mutation blocks every mutation
 * behind it, forever, silently).
 */
export interface MutationError {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
}

/**
 * A mutation's typed outcome. THE DOCTRINE: anything the engine
 * COMPUTES — success, a business rejection, or "this mutation crashed me" —
 * travels as a value in this envelope. A thrown exception is reserved for
 * the one thing that is genuinely transient: failure to communicate or a
 * recovering engine — and ONLY those may be retried as "offline".
 */
export type MutateResult =
  | { readonly ok: true; readonly seq: number }
  | { readonly ok: false; readonly rejection: MutationRejection }
  | { readonly ok: false; readonly error: MutationError };

/** A subscription's bootstrap payload: full rows at a known seq. */
export interface Snapshot {
  readonly subscriptionId: string;
  readonly query: string;
  readonly seq: number;
  readonly rows: readonly DbRow[];
  readonly status: SyncQueryStatus;
}
