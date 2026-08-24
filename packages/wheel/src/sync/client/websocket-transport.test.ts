import { describe, expect, test, vi } from 'vitest';

import type { SyncSocketMessage } from '../socket-protocol';
import {
  createWebSocketTransport,
  type SyncClientEventTarget,
  type SyncClientSocket
} from './websocket-transport';

class FakeEventTarget implements SyncClientEventTarget {
  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }
}

class FakeSocket implements SyncClientSocket {
  readyState = 0;
  readonly sent: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners = new Map<string, Set<(event?: unknown) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === 3) return;
    this.closes.push({ code, reason });
    this.readyState = 3;
    this.emit('close', { code, reason });
  }

  addEventListener(
    type: 'open' | 'message' | 'error' | 'close',
    listener: ((event: { data: unknown }) => void) | ((event: { code?: number; reason?: string }) => void) | (() => void),
    options?: { once?: boolean }
  ): void {
    const wrapped = (event?: unknown): void => {
      if (options?.once) this.listeners.get(type)?.delete(wrapped);
      (listener as (value?: unknown) => void)(event);
    };
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(wrapped);
    this.listeners.set(type, listeners);
  }

  open(): void {
    this.readyState = 1;
    this.emit('open');
  }

  serverMessage(message: SyncSocketMessage): void {
    this.emit('message', { data: JSON.stringify(message) });
  }

  private emit(type: string, event?: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function hello(applicationVersion = 3): SyncSocketMessage {
  return {
    protocol: 1,
    type: 'hello',
    connectionId: 'conn_test',
    applicationVersion,
    schemaVersion: 7
  };
}

async function connectTransport(options: {
  onReconnect?: () => void;
  onStatus?: (status: string) => void;
  onVersionMismatch?: (message: { reason: string }) => void;
  eventTarget?: SyncClientEventTarget;
} = {}) {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const events: unknown[] = [];
  const transport = createWebSocketTransport({
    baseUrl: 'https://sync.test/api/',
    applicationVersion: 3,
    params: { ticket: 'one-use' },
    createSocket(url) {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    onReconnect: options.onReconnect,
    onStatus: options.onStatus as ((status: never) => void) | undefined,
    onVersionMismatch: options.onVersionMismatch as ((message: never) => void) | undefined,
    eventTarget: options.eventTarget,
    random01: () => 0.5
  });
  const connected = transport.connect('client test', (event) => events.push(event));
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  sockets[0]!.open();
  sockets[0]!.serverMessage(hello());
  await connected;
  return { transport, socket: sockets[0]!, sockets, urls, events };
}

describe('createWebSocketTransport', () => {
  test('uses one versioned socket for requests, responses, and server events', async () => {
    const { transport, socket, urls, events } = await connectTransport();
    expect(urls[0]).toBe(
      'wss://sync.test/api/sync/websocket?client=client+test&protocol=1&version=3&ticket=one-use'
    );

    const subscribed = transport.subscribe('ignored', 'todos.all', { owner: 'me' });
    const subscribe = JSON.parse(socket.sent[0]!) as { requestId: string };
    socket.serverMessage({
      protocol: 1,
      type: 'response',
      requestId: subscribe.requestId,
      ok: true,
      value: { subscriptionId: 'sub_1', query: 'todos.all', seq: 4, rows: [{ id: 'todo_1' }] }
    });
    await expect(subscribed).resolves.toMatchObject({ subscriptionId: 'sub_1', seq: 4 });

    socket.serverMessage({
      protocol: 1,
      type: 'event',
      event: {
        type: 'delta',
        delta: {
          subscriptionId: 'sub_1',
          query: 'todos.all',
          seq: 5,
          puts: [{ id: 'todo_2' }],
          deletes: [],
          order: ['todo_1', 'todo_2']
        }
      }
    });
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ type: 'delta', delta: { seq: 5 } });
    transport.close('ignored');
  });

  test('returns terminal mutation errors and rejects retryable failures', async () => {
    const { transport, socket } = await connectTransport();
    const mutation = {
      clientId: 'client-test',
      mutationId: 'm_test',
      name: 'todos.add',
      args: {},
      ids: []
    };

    const terminal = transport.mutate(mutation);
    const terminalRequest = JSON.parse(socket.sent.at(-1)!) as { requestId: string };
    socket.serverMessage({
      protocol: 1,
      type: 'response',
      requestId: terminalRequest.requestId,
      ok: false,
      error: { code: 'invalid_args', message: 'args failed', retryable: false }
    });
    await expect(terminal).resolves.toEqual({
      ok: false,
      error: { kind: 'error', code: 'invalid_args', message: 'args failed' }
    });

    const retryable = transport.mutate(mutation);
    const retryableRequest = JSON.parse(socket.sent.at(-1)!) as { requestId: string };
    socket.serverMessage({
      protocol: 1,
      type: 'response',
      requestId: retryableRequest.requestId,
      ok: false,
      error: { code: 'engine_recovering', message: 'retry', retryable: true }
    });
    await expect(retryable).rejects.toThrow(/engine_recovering/);
    transport.close('ignored');
  });

  test('reports a version mismatch before it retries', async () => {
    const mismatches: string[] = [];
    const sockets: FakeSocket[] = [];
    const transport = createWebSocketTransport({
      baseUrl: 'https://sync.test',
      applicationVersion: 3,
      createSocket() {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onVersionMismatch: (message) => mismatches.push(message.reason),
      random01: () => 0.5
    });
    const connecting = transport.connect('client-test', () => {});
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    sockets[0]!.open();
    sockets[0]!.serverMessage({
      protocol: 1,
      type: 'version_mismatch',
      reason: 'client_outdated',
      clientProtocol: 1,
      serverProtocol: 1,
      clientApplicationVersion: 3,
      serverApplicationVersion: 4,
      minimumClientVersion: 4
    });
    sockets[0]!.close(4410, 'client_outdated');
    await vi.waitFor(() => expect(mismatches).toEqual(['client_outdated']));
    transport.close('client-test');
    await connecting;
  });

  test('reports browser network loss immediately and reconnects on online', async () => {
    const eventTarget = new FakeEventTarget();
    const statuses: string[] = [];
    let reconnects = 0;
    const { transport, socket, sockets } = await connectTransport({
      eventTarget,
      onStatus: (status) => statuses.push(status),
      onReconnect: () => {
        reconnects += 1;
      }
    });

    eventTarget.dispatch('offline');
    expect(socket.closes).toContainEqual({ code: 4001, reason: 'browser_offline' });
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('offline'));

    eventTarget.dispatch('online');
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    sockets[1]!.open();
    sockets[1]!.serverMessage(hello());
    await vi.waitFor(() => expect(statuses.at(-1)).toBe('connected'));
    expect(reconnects).toBe(1);
    transport.close('client-test');
  });
});
