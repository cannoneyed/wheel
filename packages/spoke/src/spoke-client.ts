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
import { SPOKE_SYNC_MODULES } from './sync/modules';

// wheel-raw-location: the URL selects the demo principal and workspace before the client boots.
const bootUrl = new URL(location.href);
export const SPOKE_IDENTITY = Object.freeze({
  workspaceId: bootUrl.searchParams.get('workspace') ?? 'acme',
  actor: bootUrl.searchParams.get('actor') ?? 'user:ada',
  channelId: bootUrl.searchParams.get('channel') ?? 'channel_general',
  syncOrigin: bootUrl.searchParams.get('syncOrigin') ?? ''
});

let client: SyncClient | null = null;

function stableStoreId(): string {
  const key = `spoke.storeId.${SPOKE_IDENTITY.workspaceId}.${SPOKE_IDENTITY.actor}`;
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID().slice(0, 8);
    localStorage.setItem(key, value);
  }
  return value;
}

/** Get or boot this tab's local-first Spoke client. */
export function spokeClient(): SyncClient {
  if (client) return client;
  const wireId = `spoke_${crypto.randomUUID().slice(0, 8)}`;
  const reloadGuard = createRowSchemaReloadGuard(sessionStorage, 'spoke.rowSchemaReload');
  const transport = createWebSocketTransport({
    baseUrl: SPOKE_IDENTITY.syncOrigin,
    applicationVersion: 1,
    rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
    params: () => ({
      actor: SPOKE_IDENTITY.actor,
      session: wireId,
      workspace: SPOKE_IDENTITY.workspaceId
    }),
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
        logger.error('Spoke assets and sync server have different row contracts.', mismatch);
        return;
      }
      // wheel-raw-location: a new row contract requires a full asset reload.
      location.reload();
    }
  });
  client = new SyncClient({
    transport,
    clientId: wireId,
    actor: SPOKE_IDENTITY.actor,
    clock: systemClock,
    randomBytes: systemRandomBytes,
    syncModules: SPOKE_SYNC_MODULES,
    localCache: new IndexedDbCache(
      'spoke',
      createCacheScopes({
        storeScope: `${SPOKE_IDENTITY.workspaceId}:${SPOKE_IDENTITY.actor}:${stableStoreId()}`,
        rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT
      })
    )
  });
  return client;
}
