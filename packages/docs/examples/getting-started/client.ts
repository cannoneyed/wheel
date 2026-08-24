import {
  IndexedDbCache,
  SyncClient,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes
} from 'wheel/sync';

function stable(
  storage: Storage,
  key: string,
  create: () => string
): string {
  const existing = storage.getItem(key);
  if (existing) {
    return existing;
  }
  const value = create();
  storage.setItem(key, value);
  return value;
}

// Shared by this browser. Reloads and new tabs reopen the same IndexedDB cache.
const storeScope = stable(
  localStorage,
  'todos.storeScope',
  () => crypto.randomUUID()
);

const APPLICATION_VERSION = 1;

// Fresh on every page load, and NEVER persisted. The server allows one socket
// per wire id (a same-id connect supersedes the old socket), so two
// live pages must never share one. sessionStorage looks tempting for
// per-tab identity, but browsers CLONE it into duplicated tabs — and two
// tabs with one wire id then kick each other off the stream in a loop.
const wireId = `web_${crypto.randomUUID().slice(0, 8)}`;

export let client: SyncClient;
const transport = createWebSocketTransport({
  baseUrl: '',
  applicationVersion: APPLICATION_VERSION,
  params: {
    demoActor: `user:${wireId}`,
    demoSession: wireId
  },
  onReconnect: () => void client.rebootstrap(),
  onStatus: (status) => client.setConnectionStatus(status),
  onVersionMismatch: ({ reason }) => {
    if (reason === 'server_updating') return;
    // wheel-raw-location: incompatible client code requires a full asset reload.
    location.reload();
  }
});

client = new SyncClient({
  transport,
  clientId: wireId,
  actor: `user:${wireId}`,
  clock: systemClock,
  randomBytes: systemRandomBytes,
  // Two scopes on purpose: snapshots are row-shaped (retire them when your
  // schema changes — put a fingerprint in the scope); the outbox holds
  // pending mutations, which a schema change must NOT abandon. `retires`
  // names your app's dead scopes; their rows are deleted at open.
  localCache: new IndexedDbCache('todos', {
    snapshots: `${storeScope}|snapshots:v${APPLICATION_VERSION}`,
    outbox: `${storeScope}|outbox`,
    retires: (scope) =>
      scope.startsWith(`${storeScope}|`) &&
      scope !== `${storeScope}|snapshots:v${APPLICATION_VERSION}` &&
      scope !== `${storeScope}|outbox`
  })
});
