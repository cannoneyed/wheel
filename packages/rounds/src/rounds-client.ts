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

import { ROW_SCHEMA_FINGERPRINT, ROUNDS_SYNC_MODULES } from './rounds-contract';

let client: SyncClient | null = null;

function stableStoreId(): string {
  let value = localStorage.getItem('rounds.storeId');
  if (!value) {
    value = crypto.randomUUID().slice(0, 8);
    localStorage.setItem('rounds.storeId', value);
  }
  return value;
}

/** Get or boot this tab's local-first Rounds client. */
export function roundsClient(): SyncClient {
  if (client) return client;
  const wireId = `rounds_${crypto.randomUUID().slice(0, 8)}`;
  const reloadGuard = createRowSchemaReloadGuard(sessionStorage, 'rounds.rowSchemaReload');
  const transport = createWebSocketTransport({
    baseUrl: '',
    applicationVersion: 1,
    rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
    params: () => ({ demoActor: 'inspector', demoSession: wireId }),
    onReconnect: () => void client!.rebootstrap(),
    onStatus: (status) => {
      if (status === 'connected') reloadGuard.clear();
      client!.setConnectionStatus(status);
    },
    onVersionMismatch: (mismatch) => {
      if (mismatch.reason === 'server_updating') return;
      if (
        mismatch.reason === 'row_schema_mismatch' &&
        !reloadGuard.shouldReload(mismatch.serverRowSchemaFingerprint)
      ) {
        logger.error('Rounds assets and sync server have different row contracts.', mismatch);
        return;
      }
      // wheel-raw-location: a new contract requires a full asset reload.
      location.reload();
    }
  });
  client = new SyncClient({
    transport,
    clientId: wireId,
    actor: 'inspector',
    clock: systemClock,
    randomBytes: systemRandomBytes,
    syncModules: ROUNDS_SYNC_MODULES,
    localCache: new IndexedDbCache(
      'rounds',
      createCacheScopes({ storeScope: stableStoreId(), rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT })
    )
  });
  return client;
}
