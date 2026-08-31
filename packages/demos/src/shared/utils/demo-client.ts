/**
 * One SyncClient per demo, wired the way a real wheel app should be:
 * - IndexedDbCache → hydrate-from-cache boot + durable offline outbox
 * - createWebSocketTransport → retry-forever connects, rebootstrap on reconnect
 *
 * Two identities, deliberately split:
 * - STORE SCOPE (localStorage, shared by every tab of this browser): keys the
 *   hydration cache and outbox. Tabs share the cache; an outbox entry left by
 *   any tab replays on the next boot — safely, because the server dedupes by
 *   mutationId (exactly-once).
 * - WIRE ID (in-memory, minted fresh on every page load): the server allows
 *   one WebSocket per client id — a same-id connect SUPERSEDES the previous
 *   socket — so two live pages must NEVER share an id. Never
 *   persist this id in sessionStorage: browsers CLONE sessionStorage into
 *   duplicated tabs, and two tabs with one id fight over the stream slot —
 *   each open kicks the other, which reopens and kicks back, measured at
 *   ~5,000 cycles/second across the browser, the vite proxy, and the sync
 *   server (the transport's flap guard now caps such loops at its backoff
 *   ceiling, but unique ids remove the fight entirely). Within one page's
 *   lifetime the transport reuses the id, so a dropped stream's reconnect
 *   still supersedes its own zombie — the takeover rule's real job. The only
 *   cost of a fresh id per load: after a reload, your old presence entry
 *   lingers as a ghost peer for the moments until the dead stream is reaped.
 */
import {
  IndexedDbCache,
  MemoryCache,
  SyncClient,
  createCacheScopes,
  createRowSchemaReloadGuard,
  createWebSocketTransport,
  systemClock,
  systemRandomBytes,
  type SyncTransport
} from 'wheel/sync';
import { logger } from 'wheel/core';

import { createWorkerSyncTransport, inBrowserSyncEnabled } from '../in-browser/worker-transport';
import { withSimulatedLatency } from './simulated-latency';
import { ROW_SCHEMA_FINGERPRINTS } from '../row-schema.generated';

const clients = new Map<string, SyncClient>();
const DEMO_APPLICATION_VERSION = 1;

function stableStoreScope(demo: string): string {
  const key = `wheel-demos.${demo}.storeId`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID().slice(0, 8);
    localStorage.setItem(key, id);
  }
  return id;
}

function rowSchemaFingerprint(demo: string): string {
  const fingerprint = ROW_SCHEMA_FINGERPRINTS[demo as keyof typeof ROW_SCHEMA_FINGERPRINTS];
  if (!fingerprint) throw new Error(`Demo ${JSON.stringify(demo)} has no generated row fingerprint.`);
  return fingerprint;
}

/** Get (or boot) the singleton client for one demo. */
export function demoClient(demo: string): SyncClient {
  let client = clients.get(demo);
  if (client) {
    return client;
  }
  // Fresh wire id per page load — never persisted (module doc: WIRE ID).
  const clientId = `web_${crypto.randomUUID().slice(0, 8)}`;
  const fingerprint = rowSchemaFingerprint(demo);
  const rowSchemaReload = createRowSchemaReloadGuard(
    sessionStorage,
    `wheel-demos.${demo}.rowSchemaReload`
  );
  // In-browser mode swaps the HTTP wire for the in-page sync worker (WASM
  // SQLite, see ../in-browser/) — a SharedWorker where supported, so every
  // tab talks to ONE engine and tabs stay in sync. The engine still dies
  // with the last tab, so the local cache is a MemoryCache — an IndexedDB
  // cache would replay a previous server generation's rows and outbox into a
  // freshly seeded world.
  const inBrowser = inBrowserSyncEnabled();
  const wire: SyncTransport = inBrowser
    ? createWorkerSyncTransport({
        demo,
        onStatus: (status) => client!.setConnectionStatus(status)
      })
    : createWebSocketTransport({
        // Engines live under /sync/* so the demo APP owns clean top-level paths
        // (/todos, /kanban, …) for the router. Without the namespace, the vite
        // proxy would send a page navigation to the sync server.
        baseUrl: `/sync/${demo}`,
        applicationVersion: DEMO_APPLICATION_VERSION,
        rowSchemaFingerprint: fingerprint,
        params: {
          demoActor: `user:${clientId}`,
          demoSession: clientId
        },
        onReconnect: () => void client!.rebootstrap(),
        onStatus: (status) => {
          if (status === 'connected') rowSchemaReload.clear();
          client!.setConnectionStatus(status);
        },
        onVersionMismatch: (mismatch) => {
          const { reason } = mismatch;
          if (reason === 'server_updating') return;
          if (reason === 'row_schema_mismatch') {
            if (!rowSchemaReload.shouldReload(mismatch.serverRowSchemaFingerprint)) {
              logger.error('Demo assets and sync server have different row contracts.', mismatch);
              return;
            }
          }
          // wheel-raw-location: incompatible client code requires a full asset reload.
          location.reload();
        }
      });
  const transport = withSimulatedLatency(wire);
  client = new SyncClient({
    transport,
    clientId,
    actor: `user:${clientId}`,
    clock: systemClock,
    randomBytes: systemRandomBytes,
    localCache: inBrowser
      ? new MemoryCache()
      : new IndexedDbCache(
          'wheel-demos',
          createCacheScopes({
            storeScope: `${demo}|${stableStoreScope(demo)}`,
            rowSchemaFingerprint: fingerprint
          })
        )
  });
  clients.set(demo, client);
  return client;
}
