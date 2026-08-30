/**
 * The postMessage wire between the main-thread WorkerSyncTransport and the
 * in-browser sync worker. Everything crossing this boundary is protocol data
 * (the same JSON-safe shapes that cross WebSockets in production), so structured
 * clone carries it without translation.
 */
import type { MutateGroupRequest, ServerEvent } from 'wheel/sync/server';

/** Request from the main thread; every op but the fire-and-forget `close` gets one reply keyed by `id`. */
export type WorkerRequest =
  | { id: number; op: 'connect'; demo: string; clientId: string; actor: string }
  | { id: number; op: 'subscribe'; demo: string; clientId: string; queryName: string; params: unknown }
  | { id: number; op: 'unsubscribe'; demo: string; clientId: string; subscriptionId: string }
  | { id: number; op: 'mutateGroup'; demo: string; request: MutateGroupRequest }
  | { id: number; op: 'presence'; demo: string; clientId: string; state: Record<string, unknown> | null }
  | { id: number; op: 'close'; demo: string; clientId: string };

/** Omit that distributes over a union (plain Omit collapses a union to its common keys). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A request minus its RPC id — what transport code builds; the id is stamped at send time. */
export type WorkerRequestBody = DistributiveOmit<WorkerRequest, 'id'>;

/** Worker to main: the boot handshake, RPC replies, and each client's event stream. */
export type WorkerResponse =
  | { kind: 'ready' }
  | { kind: 'boot-error'; message: string }
  | { kind: 'result'; id: number; result: unknown }
  | { kind: 'error'; id: number; message: string }
  | { kind: 'event'; demo: string; clientId: string; event: ServerEvent };
