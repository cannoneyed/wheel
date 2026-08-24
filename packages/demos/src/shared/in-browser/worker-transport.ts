/**
 * The main-thread half of in-browser sync: a SyncTransport whose "server" is
 * the sync worker (sync-worker.ts) instead of an HTTP origin. The SyncClient
 * cannot tell — the same property that makes wheel's World tests honest is
 * what makes the hosted demos serverless.
 *
 * The worker is a SHARED worker where the browser supports it: one engine
 * per origin, so every tab is another client of the same server — tabs sync
 * with each other exactly like they do against the Bun dev server, and
 * presence spans tabs. Browsers without SharedWorker (e.g. Chrome on
 * Android) fall back to a dedicated worker: same engines, one per tab.
 * Either way the tab talks to ONE port via a lazy singleton.
 */
import type { SyncConnectionStatus, SyncTransport } from 'wheel/sync';

import type { WorkerRequest, WorkerRequestBody, WorkerResponse } from './worker-protocol';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

/** What both worker flavors give the page: postMessage + onmessage. */
interface WirePort {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  start?(): void;
}

interface WorkerHandle {
  port: WirePort;
  ready: Promise<void>;
  pending: Map<number, Pending>;
  /** `${demo}|${clientId}` → the connected client's event sink. */
  eventSinks: Map<string, (event: unknown) => void>;
  nextId: number;
}

let handle: WorkerHandle | null = null;

function openPort(): WirePort {
  // Both constructions keep `new URL(...)` inline — vite's static worker
  // detection requires the literal form to bundle the worker entry.
  if (typeof SharedWorker !== 'undefined') {
    const shared = new SharedWorker(new URL('./sync-worker.ts', import.meta.url), {
      type: 'module',
      name: 'wheel-demo-sync'
    });
    return shared.port as unknown as WirePort;
  }
  return new Worker(new URL('./sync-worker.ts', import.meta.url), { type: 'module' }) as unknown as WirePort;
}

function workerHandle(): WorkerHandle {
  if (handle) {
    return handle;
  }
  const port = openPort();
  const pending = new Map<number, Pending>();
  const eventSinks = new Map<string, (event: unknown) => void>();
  let markReady: () => void;
  let markBootFailed: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    markReady = resolve;
    markBootFailed = reject;
  });
  port.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    switch (message.kind) {
      case 'ready':
        markReady();
        break;
      case 'boot-error':
        markBootFailed(new Error(`in-browser sync worker failed to boot: ${message.message}`));
        break;
      case 'result':
        pending.get(message.id)?.resolve(message.result);
        pending.delete(message.id);
        break;
      case 'error':
        pending.get(message.id)?.reject(new Error(message.message));
        pending.delete(message.id);
        break;
      case 'event':
        eventSinks.get(`${message.demo}|${message.clientId}`)?.(message.event);
        break;
    }
  };
  port.start?.();
  handle = { port, ready, pending, eventSinks, nextId: 1 };
  return handle;
}

async function call<T>(request: WorkerRequestBody): Promise<T> {
  const h = workerHandle();
  await h.ready;
  const id = h.nextId++;
  return new Promise<T>((resolve, reject) => {
    h.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    const message: WorkerRequest = { ...request, id };
    h.port.postMessage(message);
  });
}

/** Options for one demo's worker transport. */
export interface WorkerTransportOptions {
  /** Which in-worker engine to talk to (todos / kanban / editor / sheet). */
  demo: string;
  /** Connection status sink — reports `connected` once the worker engine accepts the client. */
  onStatus?: (status: SyncConnectionStatus) => void;
}

/** A SyncTransport backed by the in-page sync worker instead of a WebSocket. */
export function createWorkerSyncTransport(options: WorkerTransportOptions): SyncTransport {
  const { demo, onStatus } = options;
  return {
    async connect(clientId, onEvent, identity) {
      onStatus?.('connecting');
      workerHandle().eventSinks.set(`${demo}|${clientId}`, onEvent as (event: unknown) => void);
      await call({ op: 'connect', demo, clientId, actor: identity.actor });
      onStatus?.('connected');
    },
    subscribe(clientId, queryName, params) {
      return call({ op: 'subscribe', demo, clientId, queryName, params });
    },
    async unsubscribe(clientId, subscriptionId) {
      await call({ op: 'unsubscribe', demo, clientId, subscriptionId });
    },
    mutate(request) {
      return call({ op: 'mutate', demo, request });
    },
    async setPresence(clientId, state) {
      await call({ op: 'presence', demo, clientId, state });
    },
    close(clientId) {
      workerHandle().eventSinks.delete(`${demo}|${clientId}`);
      void call({ op: 'close', demo, clientId });
    }
  };
}

/**
 * In-browser mode switch: build-time via `VITE_SYNC_MODE=browser` (how the
 * wheel.dev deployment pins it) or per-visit via `?sync=local` (how you try it
 * against a dev server without restarting anything).
 */
export function inBrowserSyncEnabled(): boolean {
  if (import.meta.env.VITE_SYNC_MODE === 'browser') {
    return true;
  }
  // wheel-raw-location: read-once boot flag, decided before any service or
  // router exists — the sync transport is chosen while the app is still booting.
  return new URLSearchParams(window.location.search).get('sync') === 'local';
}
