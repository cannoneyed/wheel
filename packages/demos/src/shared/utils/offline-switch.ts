/**
 * A pull-the-plug switch for a demo transport.
 *
 * Going offline in devtools proves local-first, but nobody reading a landing
 * page will do it. This wrapper is that gesture as a button: while a switch is
 * open, every request rejects and every server event is held, exactly as if
 * the wire were cut. Closing it replays the held events in order and lets the
 * next request through, so the client rebootstraps and converges on its own —
 * the same path a real reconnect takes.
 *
 * One switch per client, not one per page: the whole point of the two-pane
 * demo is unplugging ONE side and watching the other keep working.
 */
import type { SyncConnectionStatus, SyncTransport } from 'wheel/sync';

/** The handle the UI holds: flip it, read it, and hear about changes. */
export interface OfflineSwitch {
  readonly offline: () => boolean;
  setOffline(next: boolean): void;
}

class Disconnected extends Error {
  constructor() {
    super('offline: the demo switch is open');
    this.name = 'Disconnected';
  }
}

/**
 * Wrap a transport with an unplug switch. `onStatus` mirrors the wire state so
 * the pane can show `offline` / `connected` without a second source of truth.
 */
export function withOfflineSwitch(
  inner: SyncTransport,
  onStatus?: (status: SyncConnectionStatus) => void
): { transport: SyncTransport; control: OfflineSwitch } {
  let offline = false;
  let listener: (() => void) | undefined;
  // Events that arrived while the plug was out, in arrival order.
  const held: unknown[] = [];
  let deliver: ((event: unknown) => void) | undefined;

  const gate = <T>(run: () => Promise<T>): Promise<T> =>
    offline ? Promise.reject(new Disconnected()) : run();

  const control: OfflineSwitch = {
    offline: () => offline,
    setOffline(next) {
      if (next === offline) return;
      offline = next;
      if (offline) {
        onStatus?.('offline');
      } else {
        // Drain in order BEFORE reporting connected: a subscriber that reacts
        // to the status flip must not see a half-applied stream.
        while (held.length > 0) {
          deliver?.(held.shift());
        }
        onStatus?.('connected');
      }
      listener?.();
    }
  };

  const transport: SyncTransport = {
    async connect(clientId, onEvent, identity) {
      deliver = onEvent as (event: unknown) => void;
      return gate(() =>
        inner.connect(
          clientId,
          (event) => {
            if (offline) {
              held.push(event);
              return;
            }
            deliver?.(event);
          },
          identity
        )
      );
    },
    subscribe: (clientId, queryName, params) =>
      gate(() => inner.subscribe(clientId, queryName, params)),
    unsubscribe: (clientId, subscriptionId) =>
      gate(() => inner.unsubscribe(clientId, subscriptionId)),
    mutateGroup: (request) => gate(() => inner.mutateGroup(request)),
    setPresence: (clientId, state) => gate(() => inner.setPresence(clientId, state)),
    close: (clientId) => inner.close(clientId)
  };

  return { transport, control };
}
