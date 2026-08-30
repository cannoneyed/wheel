/**
 * Simulated round-trip latency for the demo transports. One mutable ref the
 * transport wrapper reads at call time; the LatencyService mirrors it into a
 * reactive atom for the UI. Applies per tab — open two tabs with different
 * settings to watch optimistic sync under asymmetric links.
 */
import { systemClock, systemDefer } from 'wheel/core';
import type { SyncTransport } from 'wheel/sync';

export const simulatedLatency = { ms: 0 };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    systemDefer.schedule(ms, resolve);
  });

/**
 * Wrap a transport so every request and every pushed event arrives
 * `simulatedLatency.ms` later. Event ORDER is preserved even when the
 * setting changes mid-stream: deliveries chain, each waiting until its own
 * target time, so a newly-lowered latency can't leapfrog older events.
 */
export function withSimulatedLatency(inner: SyncTransport): SyncTransport {
  let chain: Promise<void> = Promise.resolve();
  return {
    async connect(clientId, onEvent, identity) {
      await sleep(simulatedLatency.ms);
      return inner.connect(clientId, (event) => {
        const readyAt = systemClock.now() + simulatedLatency.ms;
        chain = chain.then(async () => {
          const remaining = readyAt - systemClock.now();
          if (remaining > 0) await sleep(remaining);
          onEvent(event);
        });
      }, identity);
    },
    async subscribe(clientId, queryName, params) {
      await sleep(simulatedLatency.ms);
      return inner.subscribe(clientId, queryName, params);
    },
    async unsubscribe(clientId, subscriptionId) {
      await sleep(simulatedLatency.ms);
      return inner.unsubscribe(clientId, subscriptionId);
    },
    async mutateGroup(request) {
      await sleep(simulatedLatency.ms);
      return inner.mutateGroup(request);
    },
    async setPresence(clientId, state) {
      await sleep(simulatedLatency.ms);
      return inner.setPresence(clientId, state);
    },
    close(clientId) {
      inner.close(clientId);
    }
  };
}
