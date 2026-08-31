import {
  IndexedDbCache,
  SyncClient,
  createCacheScopes,
  createRowSchemaReloadGuard,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes
} from 'wheel/sync';
import { logger } from 'wheel/core';
import { ROW_SCHEMA_FINGERPRINT } from './row-schema.generated';

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
const rowSchemaReload = createRowSchemaReloadGuard(sessionStorage, 'todos.rowSchemaReload');
const transport = createWebSocketTransport({
  baseUrl: '',
  applicationVersion: APPLICATION_VERSION,
  rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
  params: {
    demoActor: `user:${wireId}`,
    demoSession: wireId
  },
  onReconnect: () => void client.rebootstrap(),
  onStatus: (status) => {
    if (status === 'connected') rowSchemaReload.clear();
    client.setConnectionStatus(status);
  },
  onVersionMismatch: (mismatch) => {
    const { reason } = mismatch;
    if (reason === 'server_updating') return;
    if (
      reason === 'row_schema_mismatch' &&
      !rowSchemaReload.shouldReload(mismatch.serverRowSchemaFingerprint)
    ) {
      logger.error('Browser assets and sync server have different row contracts.', mismatch);
      return;
    }
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
  // Two scopes on purpose: snapshots carry the generated row fingerprint,
  // while the outbox keeps only the stable store identity. A declaration
  // change retires old rows without abandoning pending mutations.
  localCache: new IndexedDbCache(
    'todos',
    createCacheScopes({ storeScope, rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT })
  )
});
