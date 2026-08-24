/**
 * The landing page's two sync clients: two independent peers of ONE in-browser
 * server, so the demo above the fold proves the claim under it with no backend
 * anywhere.
 *
 * The server is the demos' sync worker (`packages/demos/src/shared/in-browser`)
 * — the same wheel engine `bun run demos:server` boots, running on WASM SQLite
 * inside a worker. It is not a mock or a fake: the panes talk the real
 * protocol to the real engine, which is why "pull the plug" behaves the same
 * here as it does against a deployed Durable Object.
 *
 * Deliberate differences from `demos/src/shared/utils/demo-client.ts`:
 *
 * - ALWAYS in-browser. The demos pick a transport from a build flag; the
 *   landing page has no server to fall back to, so there is no choice to make.
 * - MemoryCache, never IndexedDB. The worker's database dies with the last
 *   tab, so a persisted cache would replay a previous world's rows into a
 *   freshly seeded one. A reload starting clean is the correct behavior here.
 * - An offline switch per client, which is the whole point of the figure.
 */
import { MemoryCache, SyncClient, systemClock, systemRandomBytes } from 'wheel/sync';

import { createWorkerSyncTransport } from '../../../demos/src/shared/in-browser/worker-transport';
import { withOfflineSwitch, type OfflineSwitch } from '../../../demos/src/shared/utils/offline-switch';

/** The worker engine the panes share. `todos` is the smallest complete one. */
const ENGINE = 'todos';

/** One pane: its client and the switch that unplugs it. */
export interface LivePeer {
  readonly client: SyncClient;
  readonly control: OfflineSwitch;
}

const peers = new Map<string, LivePeer>();

/**
 * Get (or boot) the peer for one pane. Keyed by `pane` so a re-render reuses
 * the live client instead of opening a third connection to the engine.
 */
export function livePeer(pane: string): LivePeer {
  const existing = peers.get(pane);
  if (existing) {
    return existing;
  }
  // Distinct wire ids: the engine keys connections and presence by client id,
  // so two panes sharing one id would each kick the other off the stream.
  const clientId = `web_${pane}_${crypto.randomUUID().slice(0, 8)}`;
  let client: SyncClient;
  const { transport, control } = withOfflineSwitch(
    createWorkerSyncTransport({
      demo: ENGINE,
      onStatus: (status) => client.setConnectionStatus(status)
    }),
    // Flipping the switch back to `connected` is what makes the client release
    // its offline outbox and re-open stale subscriptions — the same funnel a
    // real reconnect uses (SyncClient.connectionRestored).
    (status) => client.setConnectionStatus(status)
  );
  client = new SyncClient({
    transport,
    clientId,
    actor: `user:${clientId}`,
    clock: systemClock,
    randomBytes: systemRandomBytes,
    localCache: new MemoryCache()
  });
  const peer: LivePeer = { client, control };
  peers.set(pane, peer);
  return peer;
}
