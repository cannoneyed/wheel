/**
 * The Axle SyncClient: local-first wiring (IndexedDB cache, retry-forever
 * transport) with the two-identity split — cache scope per browser
 * (localStorage), wire id minted fresh per page load (in-memory, NEVER
 * sessionStorage: browsers clone sessionStorage into duplicated tabs, and
 * two tabs sharing a wire id fight over the server's one-stream-per-client
 * slot in a zero-delay takeover loop — see demo-client.ts's WIRE ID doc for
 * the full story). The ACTOR (current user) IS per-tab sessionStorage:
 * it's the multi-client demo mechanism, and duplicated tabs sharing an
 * actor is fine — actors are many-tabs-per-user by design.
 */
import {
  IndexedDbCache,
  SyncClient,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes
} from 'wheel/sync';

import { TRACKER_APPLICATION_VERSION } from '../../sync-version';

let client: SyncClient | null = null;

function stable(key: string, storage: Storage, make: () => string): string {
  let value = storage.getItem(key);
  if (!value) {
    value = make();
    storage.setItem(key, value);
  }
  return value;
}

/** The per-tab actor's userId (the user switcher writes this). '' outside a browser. */
export function currentActorId(): string {
  if (typeof sessionStorage === 'undefined') return '';
  return sessionStorage.getItem('axle.actorId') ?? '';
}

/** Switch the tab's actor. Reloads so every per-user query re-subscribes cleanly. */
export function switchActor(userId: string): void {
  sessionStorage.setItem('axle.actorId', userId);
  // wheel-raw-location: switching actors must tear the whole client down —
  // a full reload is the point, not a navigation the router should absorb.
  location.reload();
}

/** Get (or boot) the tab's client. */
export function trackerClient(): SyncClient {
  if (client) return client;
  // Fresh wire id per page load — never persisted (module doc).
  const wireId = `web_${crypto.randomUUID().slice(0, 8)}`;
  const storeScope = stable('axle.storeId', localStorage, () => crypto.randomUUID().slice(0, 8));
  const transport = createWebSocketTransport({
    baseUrl: '',
    applicationVersion: TRACKER_APPLICATION_VERSION,
    params: () => ({
      demoUser: currentActorId() || 'anonymous',
      demoSession: wireId
    }),
    onReconnect: () => void client!.rebootstrap(),
    onStatus: (status) => client!.setConnectionStatus(status),
    onVersionMismatch: ({ reason }) => {
      if (reason === 'server_updating') return;
      // wheel-raw-location: incompatible client code requires a full asset reload.
      location.reload();
    }
  });
  client = new SyncClient({
    transport,
    clientId: wireId,
    actor: `user:${currentActorId() || 'anonymous'}`,
    clock: systemClock,
    randomBytes: systemRandomBytes,
    localCache: new IndexedDbCache('axle', {
      snapshots: `${storeScope}|snapshots:v${TRACKER_APPLICATION_VERSION}`,
      outbox: `${storeScope}|outbox`,
      retires: (scope) =>
        scope.startsWith(`${storeScope}|`) &&
        scope !== `${storeScope}|snapshots:v${TRACKER_APPLICATION_VERSION}` &&
        scope !== `${storeScope}|outbox`
    })
  });
  return client;
}
