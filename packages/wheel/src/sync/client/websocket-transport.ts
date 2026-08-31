/**
 * Browser sync transport over one bidirectional WebSocket.
 *
 * One reconnect loop owns socket creation. A connection is healthy only after
 * the authenticated server hello arrives. Socket loss rejects all pending
 * requests, reconnects with capped backoff, and asks SyncClient to fetch fresh
 * snapshots. Durable Object hibernation does not close the socket and does not
 * enter this path.
 */
import { isAbortError, retryForever } from '../../core/retry';
import { logger } from '../../core/logger';
import { systemDefer, systemRandom01, type Defer } from '../../core/runtime-defaults';
import {
  SYNC_PROTOCOL_VERSION,
  type SyncSocketError,
  type SyncSocketMessage,
  type SyncSocketRequest,
  type SyncSocketVersionMismatchReason
} from '../socket-protocol';
import type { MutateGroupRequest, MutateResult, ServerEvent, Snapshot } from '../protocol';
import { validateRowSchemaFingerprint, type RowSchemaFingerprint } from '../row-schema';
import { TransientSyncError, type SyncConnectionStatus, type SyncTransport } from './transport';

const BACKOFF_BASE_MS = 250;
const BACKOFF_CAP_MS = 30_000;
const BACKOFF_JITTER = 0.25;
const OFFLINE_AFTER_ATTEMPTS = 5;
const FLAP_WINDOW_MS = 1_000;
const FLAP_STREAK_CAP = 30;

interface MessageEventLike {
  readonly data: unknown;
}

interface CloseEventLike {
  readonly code?: number;
  readonly reason?: string;
}

/** Browser WebSocket subset used by the transport and by deterministic tests. */
export interface SyncClientSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: 'message', listener: (event: MessageEventLike) => void): void;
  addEventListener(type: 'error', listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: 'close', listener: (event: CloseEventLike) => void, options?: { once?: boolean }): void;
}

/** Browser lifecycle events used to detect network loss and wake reconnects. */
export interface SyncClientEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Client and server versions returned when the server refuses a connection. */
export interface SyncVersionMismatch {
  readonly reason: SyncSocketVersionMismatchReason;
  readonly clientProtocol: number;
  readonly serverProtocol: number;
  readonly clientApplicationVersion: number;
  readonly serverApplicationVersion: number;
  readonly minimumClientVersion: number;
  readonly clientRowSchemaFingerprint: string;
  readonly serverRowSchemaFingerprint: string;
}

/** Browser WebSocket address, versions, lifecycle hooks, and test seams. */
export interface WebSocketTransportOptions {
  /** URL prefix. The socket endpoint is `<baseUrl>/sync/websocket`. */
  readonly baseUrl: string;
  /** Monotonic application API version sent during every handshake. */
  readonly applicationVersion: number;
  /** Exact generated identity of cached row declarations. */
  readonly rowSchemaFingerprint: string;
  /** Non-secret query parameters used by demo authentication or a one-use ticket. */
  readonly params?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  readonly protocols?: string | readonly string[];
  readonly onReconnect?: () => void;
  readonly onStatus?: (status: SyncConnectionStatus) => void;
  readonly onVersionMismatch?: (mismatch: SyncVersionMismatch) => void;
  readonly createSocket?: (url: string, protocols?: string | readonly string[]) => SyncClientSocket;
  readonly eventTarget?: SyncClientEventTarget;
  readonly defer?: Defer;
  readonly random01?: () => number;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
}

type SyncSocketRequestBody = SyncSocketRequest extends infer Request
  ? Request extends SyncSocketRequest
    ? Omit<Request, 'protocol' | 'requestId'>
    : never
  : never;

class SocketResponseError extends Error {
  constructor(readonly detail: SyncSocketError) {
    super(`${detail.code}: ${detail.message}`);
  }
}

class RowSchemaMismatchError extends Error {}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function socketUrl(
  baseUrl: string,
  clientId: string,
  applicationVersion: number,
  rowSchemaFingerprint: RowSchemaFingerprint
): URL {
  const fallback = 'http://localhost/';
  const href = (globalThis as { location?: { href?: string } }).location?.href ?? fallback;
  const base = baseUrl.replace(/\/$/, '');
  const url = new URL(`${base}/sync/websocket`, href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('client', clientId);
  url.searchParams.set('protocol', String(SYNC_PROTOCOL_VERSION));
  url.searchParams.set('version', String(applicationVersion));
  url.searchParams.set('rowSchemaFingerprint', rowSchemaFingerprint);
  return url;
}

async function messageText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  throw new TypeError('Sync WebSocket received an unsupported message type.');
}

/** Create the browser transport used by Cloudflare and Bun WebSocket servers. */
export function createWebSocketTransport(options: WebSocketTransportOptions): SyncTransport {
  const applicationVersion = positiveInteger(options.applicationVersion, 'applicationVersion');
  const rowSchemaFingerprint = validateRowSchemaFingerprint(options.rowSchemaFingerprint);
  const defer = options.defer ?? systemDefer;
  const random01 = options.random01 ?? systemRandom01;
  const createSocket =
    options.createSocket ??
    ((url: string, protocols?: string | readonly string[]) =>
      (protocols === undefined
        ? new WebSocket(url)
        : new WebSocket(url, protocols as string | string[])) as unknown as SyncClientSocket);
  const lifecycle = new AbortController();
  const signal = lifecycle.signal;
  const pending = new Map<string, PendingRequest>();
  const incompatibleServerListeners = new Set<(message: string) => void>();
  const wakeCallbacks = new Set<() => void>();
  const eventTarget =
    options.eventTarget ??
    (globalThis as unknown as Partial<SyncClientEventTarget>);
  let activeSocket: SyncClientSocket | null = null;
  let dropCurrentSocket: ((error: Error, code: number, reason: string) => void) | null = null;
  let browserOffline =
    (globalThis as unknown as { navigator?: { onLine?: boolean } }).navigator?.onLine === false;
  let connected = false;
  let nextRequestId = 0;
  let serverTooOld: SyncVersionMismatch | null = null;

  const rejectPending = (error: Error): void => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const nudge = (): void => {
    for (const wake of [...wakeCallbacks]) wake();
  };

  const attachWake = (wake: () => void): (() => void) => {
    wakeCallbacks.add(wake);
    eventTarget.addEventListener?.('online', wake);
    eventTarget.addEventListener?.('visibilitychange', wake);
    return () => {
      wakeCallbacks.delete(wake);
      eventTarget.removeEventListener?.('online', wake);
      eventTarget.removeEventListener?.('visibilitychange', wake);
    };
  };

  const handleOffline = (): void => {
    browserOffline = true;
    options.onStatus?.('offline');
    dropCurrentSocket?.(
      new TransientSyncError('browser reported that the network is offline'),
      4001,
      'browser_offline'
    );
  };

  const handleOnline = (): void => {
    browserOffline = false;
    nudge();
  };

  eventTarget.addEventListener?.('offline', handleOffline);
  eventTarget.addEventListener?.('online', handleOnline);

  const buildUrl = async (clientId: string): Promise<string> => {
    const url = socketUrl(
      options.baseUrl,
      clientId,
      applicationVersion,
      rowSchemaFingerprint
    );
    const configured =
      typeof options.params === 'function' ? await options.params() : options.params;
    for (const [name, value] of Object.entries(configured ?? {})) {
      url.searchParams.set(name, value);
    }
    return url.toString();
  };

  const openSocket = async (
    clientId: string,
    onEvent: (event: ServerEvent) => void
  ): Promise<{ socket: SyncClientSocket; ended: Promise<void> }> => {
    const socket = createSocket(await buildUrl(clientId), options.protocols);
    let settleEnd!: () => void;
    const ended = new Promise<void>((resolve) => {
      settleEnd = resolve;
    });
    let opened = false;
    let hello = false;
    let mismatch: SyncVersionMismatch | null = null;

    return new Promise((resolve, reject) => {
      let finished = false;
      let dropSocket!: (error: Error, code: number, reason: string) => void;
      const finishSocket = (error: Error): void => {
        if (finished) return;
        finished = true;
        if (dropCurrentSocket === dropSocket) dropCurrentSocket = null;
        if (activeSocket === socket) {
          activeSocket = null;
          connected = false;
        }
        rejectPending(new TransientSyncError('sync WebSocket closed before the operation completed'));
        if (!hello) reject(error);
        settleEnd();
      };
      dropSocket = (error, code, reason): void => {
        try {
          socket.close(code, reason);
        } finally {
          // Chromium can leave a socket in CLOSING while the network is down.
          // End this transport attempt without waiting for its close event.
          finishSocket(error);
        }
      };
      dropCurrentSocket = dropSocket;
      socket.addEventListener('open', () => {
        opened = true;
      }, { once: true });
      socket.addEventListener('message', (event) => {
        void messageText(event.data)
          .then((text) => JSON.parse(text) as SyncSocketMessage)
          .then((message) => {
            if (message.type === 'hello') {
              if (message.applicationVersion < applicationVersion) {
                socket.close(4410, 'server_updating');
                return;
              }
              if (!hello) {
                hello = true;
                connected = true;
                activeSocket = socket;
                resolve({ socket, ended });
              }
              return;
            }
            if (message.type === 'version_mismatch') {
              mismatch = message;
              if (
                message.reason === 'protocol_mismatch' &&
                message.serverProtocol < message.clientProtocol
              ) {
                serverTooOld = message;
                for (const listener of incompatibleServerListeners) {
                  listener(
                    `The sync server speaks protocol ${message.serverProtocol}, but mutation groups require protocol ${message.clientProtocol}.`
                  );
                }
              }
              options.onVersionMismatch?.(message);
              return;
            }
            if (message.type === 'event') {
              if (!hello) throw new Error('Sync event arrived before the server hello.');
              onEvent(message.event);
              return;
            }
            const request = pending.get(message.requestId);
            if (!request) return;
            pending.delete(message.requestId);
            if (message.ok) request.resolve(message.value);
            else request.reject(new SocketResponseError(message.error));
          })
          .catch((error) => {
            logger.warn('wheel: malformed WebSocket message; reconnecting for a full bootstrap', error);
            socket.close(4400, 'invalid_server_message');
          });
      });
      socket.addEventListener('error', () => {
        if (!opened || !hello) {
          dropSocket(new TransientSyncError('sync WebSocket failed to open'), 4002, 'socket_error');
        }
      }, { once: true });
      socket.addEventListener('close', () => {
        const message = mismatch
          ? `sync version mismatch: ${mismatch.reason}`
          : 'sync WebSocket closed before hello';
        finishSocket(
          mismatch?.reason === 'row_schema_mismatch'
            ? new RowSchemaMismatchError(message)
            : new TransientSyncError(message)
        );
      }, { once: true });
      signal.addEventListener(
        'abort',
        () => dropSocket(new TransientSyncError('sync WebSocket transport closed'), 1000, 'client_closed'),
        { once: true }
      );
      if (signal.aborted) {
        dropSocket(new TransientSyncError('sync WebSocket transport closed'), 1000, 'client_closed');
      }
    });
  };

  const connectionLoop = async (
    clientId: string,
    onEvent: (event: ServerEvent) => void,
    onFirstOpen: () => void
  ): Promise<void> => {
    options.onStatus?.(browserOffline ? 'offline' : 'connecting');
    let openedBefore = false;
    let flapStreak = 0;
    try {
      for (;;) {
        let openedOnAttempt = 0;
        let reportedOffline = false;
        const opened = await retryForever(
          (attempt) => {
            openedOnAttempt = attempt;
            return openSocket(clientId, onEvent);
          },
          {
            defer,
            signal,
            baseMs: BACKOFF_BASE_MS,
            capMs: BACKOFF_CAP_MS,
            jitter: BACKOFF_JITTER,
            random01,
            wake: attachWake,
            waitFirst: flapStreak > 0,
            startAttempt: Math.max(0, flapStreak - 1),
            onFailure: ({ attempt, error }) => {
              if (error instanceof RowSchemaMismatchError) return 'stop';
              if (!reportedOffline && attempt + 1 >= OFFLINE_AFTER_ATTEMPTS) {
                reportedOffline = true;
                options.onStatus?.('offline');
              }
            }
          }
        );
        options.onStatus?.('connected');
        if (openedBefore || openedOnAttempt > 0) options.onReconnect?.();
        if (!openedBefore) {
          openedBefore = true;
          onFirstOpen();
        }
        let outlivedProbation = false;
        const cancelProbation = defer.schedule(FLAP_WINDOW_MS, () => {
          outlivedProbation = true;
        });
        await opened.ended;
        cancelProbation();
        flapStreak = outlivedProbation ? 0 : Math.min(flapStreak + 1, FLAP_STREAK_CAP);
        if (signal.aborted) return;
        options.onStatus?.(browserOffline ? 'offline' : 'reconnecting');
      }
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      if (error instanceof RowSchemaMismatchError) {
        options.onStatus?.('offline');
        return;
      }
      logger.error('wheel: sync WebSocket loop crashed', error);
      options.onStatus?.('offline');
    }
  };

  const request = <T>(body: SyncSocketRequestBody): Promise<T> => {
    const socket = activeSocket;
    if (!connected || !socket || socket.readyState !== 1) {
      nudge();
      return Promise.reject(new TransientSyncError('sync WebSocket is not connected'));
    }
    const requestId = `r_${++nextRequestId}`;
    const message = { ...body, protocol: SYNC_PROTOCOL_VERSION, requestId } as SyncSocketRequest;
    return new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        pending.delete(requestId);
        nudge();
        reject(new TransientSyncError(`sync WebSocket send failed: ${String(error)}`));
      }
    });
  };

  return {
    async connect(clientId, onEvent): Promise<void> {
      await new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true });
        void connectionLoop(clientId, onEvent, resolve);
      });
    },
    async subscribe(_clientId, query, params): Promise<Snapshot> {
      try {
        return await request<Snapshot>({ type: 'subscribe', query, params });
      } catch (error) {
        if (error instanceof SocketResponseError && !error.detail.retryable) throw error;
        if (error instanceof TransientSyncError) throw error;
        if (error instanceof SocketResponseError) throw new TransientSyncError(error.message);
        throw error;
      }
    },
    async unsubscribe(_clientId, subscriptionId): Promise<void> {
      await request<Record<string, never>>({ type: 'unsubscribe', subscriptionId });
    },
    async mutateGroup(command: MutateGroupRequest): Promise<MutateResult> {
      if (serverTooOld) {
        return {
          ok: false,
          error: {
            kind: 'error',
            code: 'server_too_old',
            message:
              `The sync server speaks protocol ${serverTooOld.serverProtocol}, ` +
              `but mutation groups require protocol ${serverTooOld.clientProtocol}.`
          }
        };
      }
      try {
        return await request<MutateResult>({ type: 'mutateGroup', command });
      } catch (error) {
        if (error instanceof SocketResponseError && !error.detail.retryable) {
          return {
            ok: false,
            error: { kind: 'error', code: error.detail.code, message: error.detail.message }
          };
        }
        if (error instanceof SocketResponseError) throw new TransientSyncError(error.message);
        throw error;
      }
    },
    onIncompatibleServer(listener): () => void {
      incompatibleServerListeners.add(listener);
      if (serverTooOld) {
        listener(
          `The sync server speaks protocol ${serverTooOld.serverProtocol}, but mutation groups require protocol ${serverTooOld.clientProtocol}.`
        );
      }
      return () => incompatibleServerListeners.delete(listener);
    },
    async setPresence(_clientId, state): Promise<void> {
      await request<Record<string, never>>({ type: 'presence', state });
    },
    close(): void {
      lifecycle.abort();
      eventTarget.removeEventListener?.('offline', handleOffline);
      eventTarget.removeEventListener?.('online', handleOnline);
      connected = false;
      incompatibleServerListeners.clear();
      dropCurrentSocket?.(
        new TransientSyncError('sync WebSocket transport closed'),
        1000,
        'client_closed'
      );
      activeSocket = null;
      rejectPending(new TransientSyncError('sync WebSocket transport closed'));
    }
  };
}
