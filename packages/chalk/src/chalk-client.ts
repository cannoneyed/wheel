import { logger } from 'wheel/core';
import {
  IndexedDbCache,
  SyncClient,
  createCacheScopes,
  createRowSchemaReloadGuard,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes
} from 'wheel/sync';

import { ROW_SCHEMA_FINGERPRINT } from '../row-schema.generated';
import { CHALK_SYNC_MODULES } from './sync/modules';

let client: SyncClient | null = null;

function stableStoreId(): string {
  let value = localStorage.getItem('chalk.storeId');
  if (!value) {
    value = crypto.randomUUID().slice(0, 8);
    localStorage.setItem('chalk.storeId', value);
  }
  return value;
}

/** Get or boot this tab's local-first Chalk client. */
export function chalkClient(): SyncClient {
  if (client) return client;
  const wireId = `chalk_${crypto.randomUUID().slice(0, 8)}`;
  const reloadGuard = createRowSchemaReloadGuard(sessionStorage, 'chalk.rowSchemaReload');
  const transport = createWebSocketTransport({
    baseUrl: '',
    applicationVersion: 1,
    rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
    params: () => ({ demoActor: 'writer', demoSession: wireId }),
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
        logger.error('Chalk assets and sync server have different row contracts.', mismatch);
        return;
      }
      // wheel-raw-location: a new row contract requires a full asset reload
      location.reload();
    }
  });
  client = new SyncClient({
    transport,
    clientId: wireId,
    actor: 'writer',
    clock: systemClock,
    randomBytes: systemRandomBytes,
    syncModules: CHALK_SYNC_MODULES,
    localCache: new IndexedDbCache(
      'chalk',
      createCacheScopes({ storeScope: stableStoreId(), rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT })
    )
  });
  return client;
}
