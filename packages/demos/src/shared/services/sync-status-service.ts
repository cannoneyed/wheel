/**
 * Connection state as a service, so components read it through connect()
 * like everything else (no component touches the client directly).
 */
import { SyncService } from 'wheel/sync';

/** Exposes connection status and outbox counts from the demo's SyncClient. */
export class SyncStatusService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SyncStatusService';

  // These are plain client-side counters, not signals — `clientRead` rides the
  // client's onChange → revision channel so each refreshes whenever the client
  // notifies (status flips, queue drains, deltas).
  /** Transport status: connected | connecting | reconnecting | offline. */
  readonly status = this.clientRead(() => this.client.connectionStatus());
  /** Mutations parked offline, awaiting the connection's return. */
  readonly queued = this.clientRead(() => this.client.queuedMutations());
  /** Mutations sent and awaiting server confirmation. */
  readonly pending = this.clientRead(() => this.client.pendingMutations());
  /** Highest server seq this client has observed. */
  readonly seq = this.clientRead(() => this.client.seq());
}
