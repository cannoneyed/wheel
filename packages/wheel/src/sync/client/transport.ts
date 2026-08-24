/**
 * The client's view of the wire. Two implementations: in-process (World,
 * wraps a SyncServer directly, with a scriptable network in between) and
 * WebSocket (the browser). The client cannot tell them apart — that is
 * what makes World tests honest.
 */
import type { MutateRequest, MutateResult, ServerEvent, Snapshot } from '../protocol';

/** Connection lifecycle shared by network and in-browser transports. */
export type SyncConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

/** Local identity used by in-process transports; WebSockets authenticate during the HTTP upgrade. */
export interface ClientIdentity {
  readonly actor: string;
}

/**
 * A wire failure that a healthy connection would not produce: the connection
 * is not open, the engine is recovering, or the network dropped the socket.
 * The client RETRIES work that fails this way
 * when the connection returns — a subscribe that raced a server restart used
 * to die sticky for the life of the tab (2026-08-10). A server VERDICT
 * (unknown query, invalid params) is never transient: identical retries
 * cannot fix it, and it throws as a plain Error.
 */
export class TransientSyncError extends Error {
  /** Stable marker name — survives minification where instanceof may not. */
  override readonly name = 'TransientSyncError';
}

/** The client's view of the wire: in-process for World, WebSocket for browsers. */
export interface SyncTransport {
  connect(clientId: string, onEvent: (event: ServerEvent) => void, identity: ClientIdentity): Promise<void>;
  subscribe(clientId: string, queryName: string, params: unknown): Promise<Snapshot>;
  /** Immediately release one server subscription; local cache retention is separate. */
  unsubscribe(clientId: string, subscriptionId: string): Promise<void>;
  mutate(request: MutateRequest): Promise<MutateResult>;
  /** Ephemeral presence update — fire-and-forget, no seq, dies with the connection. */
  setPresence(clientId: string, state: Record<string, unknown> | null): Promise<void>;
  close(clientId: string): void;
}
