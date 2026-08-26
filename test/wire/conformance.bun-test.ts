import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { SyncSocketMessage } from '../../packages/wheel/src/sync';
import expectedFixture from './fixtures/expected.json';
import requestFixture from './fixtures/requests.json';
import {
  WIRE_APPLICATION_VERSION,
  WIRE_MINIMUM_CLIENT_VERSION,
  startTypeScriptWireServer,
  type RunningWireServer
} from './ts-server';

type JsonRecord = Record<string, unknown>;
type Predicate = (message: SyncSocketMessage) => boolean;

class Inbox {
  private readonly queued: SyncSocketMessage[] = [];
  private readonly waiters: Array<{
    predicate: Predicate;
    resolve: (message: SyncSocketMessage) => void;
  }> = [];

  private constructor(readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as SyncSocketMessage;
      const index = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (index < 0) {
        this.queued.push(message);
        return;
      }
      const [waiter] = this.waiters.splice(index, 1);
      waiter!.resolve(message);
    });
  }

  static open(
    baseUrl: string,
    client: string,
    options: { version?: number; protocol?: number; actor?: string; session?: string } = {}
  ): Promise<Inbox> {
    const url = new URL('/sync/websocket', baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('client', client);
    url.searchParams.set('protocol', String(options.protocol ?? 1));
    url.searchParams.set('version', String(options.version ?? WIRE_APPLICATION_VERSION));
    url.searchParams.set('actor', options.actor ?? 'user:wire');
    url.searchParams.set('session', options.session ?? `session:${client}`);
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const inbox = new Inbox(socket);
      socket.addEventListener('open', () => resolve(inbox), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Failed to open ${url}`)), {
        once: true
      });
    });
  }

  send(message: JsonRecord): void {
    this.socket.send(JSON.stringify(message));
  }

  next(predicate: Predicate, timeoutMs = 5_000): Promise<SyncSocketMessage> {
    const queuedIndex = this.queued.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.queued.splice(queuedIndex, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for frame. Queued: ${JSON.stringify(this.queued)}`));
      }, timeoutMs);
    });
  }

  response(requestId: string): Promise<SyncSocketMessage> {
    return this.next(
      (message) => message.type === 'response' && message.requestId === requestId
    );
  }

  async expectNo(predicate: Predicate, waitMs = 100): Promise<void> {
    if (this.queued.some(predicate)) {
      throw new Error(`Unexpected frame: ${JSON.stringify(this.queued.find(predicate))}`);
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: (message: SyncSocketMessage) =>
          reject(new Error(`Unexpected frame: ${JSON.stringify(message)}`))
      };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve();
      }, waitMs);
    });
  }

  close(): void {
    this.socket.close(1000, 'test_done');
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function fill(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{([^}]+)}}/g, (_match, name: string) => replacements[name] ?? _match);
  }
  if (Array.isArray(value)) return value.map((entry) => fill(entry, replacements));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, fill(child, replacements)])
    );
  }
  return value;
}

function request(name: keyof typeof requestFixture): JsonRecord {
  return clone(requestFixture[name]) as JsonRecord;
}

function deltaFor(subscriptionId: string, seq: number): Predicate {
  return (message) =>
    message.type === 'event' &&
    message.event.type === 'delta' &&
    message.event.delta.subscriptionId === subscriptionId &&
    message.event.delta.seq === seq;
}

async function subscribe(inbox: Inbox): Promise<string> {
  inbox.send(request('subscribe'));
  const response = await inbox.response('subscribe');
  if (response.type !== 'response' || !response.ok || !('subscriptionId' in response.value)) {
    throw new Error(`Subscribe failed: ${JSON.stringify(response)}`);
  }
  return response.value.subscriptionId;
}

let local: RunningWireServer | undefined;
let baseUrl = '';

beforeAll(async () => {
  const remote = process.env.WHEEL_WIRE_URL;
  if (remote) {
    baseUrl = remote;
  } else {
    local = await startTypeScriptWireServer();
    baseUrl = local.baseUrl;
  }
});

beforeEach(async () => {
  const response = await fetch(new URL('/__reset', baseUrl), { method: 'POST' });
  if (!response.ok) throw new Error(`Fixture reset failed: ${response.status}`);
});

afterAll(async () => {
  await local?.close();
});

describe(`wire protocol conformance (${process.env.WHEEL_WIRE_LABEL ?? 'TypeScript SQLite'})`, () => {
  test('hello and all three rolling-version mismatch reasons', async () => {
    const current = await Inbox.open(baseUrl, 'current');
    const hello = await current.next((message) => message.type === 'hello');
    expect(hello).toMatchObject({
      protocol: 1,
      type: 'hello',
      applicationVersion: WIRE_APPLICATION_VERSION,
      schemaVersion: 1
    });
    if (hello.type !== 'hello') throw new Error('Expected hello');
    expect(
      await current.next(
        (message) =>
          message.type === 'event' &&
          message.event.type === 'hello' &&
          message.event.clientId === hello.connectionId
      )
    ).toBeDefined();
    current.close();

    const newer = await Inbox.open(baseUrl, 'newer', { version: WIRE_APPLICATION_VERSION + 1 });
    expect(await newer.next((message) => message.type === 'version_mismatch')).toMatchObject({
      reason: 'server_updating'
    });
    const older = await Inbox.open(baseUrl, 'older', { version: WIRE_MINIMUM_CLIENT_VERSION - 1 });
    expect(await older.next((message) => message.type === 'version_mismatch')).toMatchObject({
      reason: 'client_outdated'
    });
    const protocol = await Inbox.open(baseUrl, 'protocol', { protocol: 2 });
    expect(await protocol.next((message) => message.type === 'version_mismatch')).toMatchObject({
      reason: 'protocol_mismatch'
    });
  });

  test('subscribe snapshot and unsubscribe use exact fixture frames', async () => {
    const inbox = await Inbox.open(baseUrl, 'snapshot');
    await inbox.next((message) => message.type === 'hello');
    inbox.send(request('subscribe'));
    const response = await inbox.response('subscribe');
    if (response.type !== 'response' || !response.ok || !('subscriptionId' in response.value)) {
      throw new Error('Expected snapshot');
    }
    expect(response).toEqual(
      fill(expectedFixture.emptySnapshot, { subscriptionId: response.value.subscriptionId })
    );
    inbox.send({
      protocol: 1,
      type: 'unsubscribe',
      requestId: 'unsubscribe',
      subscriptionId: response.value.subscriptionId
    });
    expect(await inbox.response('unsubscribe')).toEqual({
      protocol: 1,
      type: 'response',
      requestId: 'unsubscribe',
      ok: true,
      value: {}
    });
    inbox.close();
  });

  test('mutations emit whole-row diffs and the full order to every subscriber', async () => {
    const a = await Inbox.open(baseUrl, 'writer');
    const b = await Inbox.open(baseUrl, 'peer');
    await Promise.all([
      a.next((message) => message.type === 'hello'),
      b.next((message) => message.type === 'hello')
    ]);
    const [subA, subB] = await Promise.all([subscribe(a), subscribe(b)]);

    a.send(request('createAlpha'));
    const [created, alphaA, alphaB] = await Promise.all([
      a.response('create-alpha'),
      a.next(deltaFor(subA, 1)),
      b.next(deltaFor(subB, 1))
    ]);
    expect(created).toMatchObject({ ok: true, value: { ok: true, seq: 1 } });
    expect(alphaA).toEqual(fill(expectedFixture.alphaDelta, { subscriptionId: subA }));
    expect(alphaB).toEqual(fill(expectedFixture.alphaDelta, { subscriptionId: subB }));

    a.send(request('createBeta'));
    const beta = await a.next(deltaFor(subA, 2));
    expect(beta).toMatchObject({
      event: {
        delta: {
          puts: [{ title: 'Béta', active: false, note: '' }],
          deletes: [],
          order: [
            'widget_0190b62e-0000-7000-8000-000000000001',
            'widget_0190b62e-0000-7000-8000-000000000002'
          ]
        }
      }
    });
    await a.response('create-beta');

    a.send(request('moveBetaFirst'));
    const moved = await a.next(deltaFor(subA, 3));
    expect(moved).toMatchObject({
      event: {
        delta: {
          puts: [{ id: 'widget_0190b62e-0000-7000-8000-000000000002', position: 0.5 }],
          order: [
            'widget_0190b62e-0000-7000-8000-000000000002',
            'widget_0190b62e-0000-7000-8000-000000000001'
          ]
        }
      }
    });
    await a.response('move-beta');

    a.send(request('deleteAlpha'));
    const deleted = await a.next(deltaFor(subA, 4));
    expect(deleted).toMatchObject({
      event: {
        delta: {
          puts: [],
          deletes: ['widget_0190b62e-0000-7000-8000-000000000001'],
          order: ['widget_0190b62e-0000-7000-8000-000000000002']
        }
      }
    });
    await a.response('delete-alpha');
    a.close();
    b.close();
  });

  test('duplicate mutation ids return the original seq without another delta', async () => {
    const inbox = await Inbox.open(baseUrl, 'dedupe');
    await inbox.next((message) => message.type === 'hello');
    const subscriptionId = await subscribe(inbox);
    inbox.send(request('createAlpha'));
    await Promise.all([inbox.response('create-alpha'), inbox.next(deltaFor(subscriptionId, 1))]);
    inbox.send(request('createAlpha'));
    expect(await inbox.response('create-alpha')).toMatchObject({
      ok: true,
      value: { ok: true, seq: 1 }
    });
    await inbox.expectNo(
      (message) => message.type === 'event' && message.event.type === 'delta'
    );
    inbox.close();
  });

  test('id stream exhaustion, prefix mismatch, and malformed ids are terminal values', async () => {
    const inbox = await Inbox.open(baseUrl, 'ids');
    await inbox.next((message) => message.type === 'hello');

    const exhausted = request('pair');
    (exhausted.mutation as JsonRecord).ids = [
      'widget_0190b62e-0000-7000-8000-000000000005'
    ];
    inbox.send(exhausted);
    expect(await inbox.response('pair')).toMatchObject({
      ok: true,
      value: { ok: false, error: { kind: 'error', code: 'id_stream_exhausted' } }
    });

    const mismatch = request('createAlpha');
    mismatch.requestId = 'mismatch';
    (mismatch.mutation as JsonRecord).mutationId =
      'm_0190b62e-0000-7000-8000-000000000007';
    (mismatch.mutation as JsonRecord).ids = [
      'note_0190b62e-0000-7000-8000-000000000007'
    ];
    inbox.send(mismatch);
    expect(await inbox.response('mismatch')).toMatchObject({
      ok: true,
      value: { ok: false, error: { code: 'id_stream_mismatch' } }
    });

    const malformed = request('createAlpha');
    malformed.requestId = 'malformed-id';
    (malformed.mutation as JsonRecord).mutationId = 'not-an-id';
    inbox.send(malformed);
    expect(await inbox.response('malformed-id')).toMatchObject({
      ok: true,
      value: { ok: false, error: { code: 'invalid_mutation_id' } }
    });
    inbox.close();
  });

  test('rejections and handler failures roll back and remain distinct terminal values', async () => {
    const inbox = await Inbox.open(baseUrl, 'failures');
    await inbox.next((message) => message.type === 'hello');
    const subscriptionId = await subscribe(inbox);
    inbox.send(request('createAlpha'));
    await Promise.all([inbox.response('create-alpha'), inbox.next(deltaFor(subscriptionId, 1))]);

    const rejected = {
      protocol: 1,
      type: 'mutate',
      requestId: 'reject',
      mutation: {
        clientId: 'ignored',
        mutationId: 'm_0190b62e-0000-7000-8000-000000000008',
        name: 'widgets.reject',
        args: { widgetId: 'widget_0190b62e-0000-7000-8000-000000000001' },
        ids: []
      }
    };
    inbox.send(rejected);
    expect(await inbox.response('reject')).toMatchObject({
      ok: true,
      value: {
        ok: false,
        rejection: { kind: 'rejection', code: 'forbidden', message: 'fixture rejection' }
      }
    });

    const failed = clone(rejected);
    failed.requestId = 'fail';
    failed.mutation.mutationId = 'm_0190b62e-0000-7000-8000-000000000009';
    failed.mutation.name = 'widgets.fail';
    inbox.send(failed);
    expect(await inbox.response('fail')).toMatchObject({
      ok: true,
      value: { ok: false, error: { kind: 'error', code: 'handler_error' } }
    });
    await inbox.expectNo(deltaFor(subscriptionId, 2));

    inbox.send({ ...request('subscribe'), requestId: 'verify' });
    expect(await inbox.response('verify')).toMatchObject({
      ok: true,
      value: { seq: 1, rows: [{ title: 'Alpha λ' }] }
    });
    inbox.close();
  });

  test('request errors, strict args, and presence follow their separate envelopes', async () => {
    const a = await Inbox.open(baseUrl, 'presence-a');
    const b = await Inbox.open(baseUrl, 'presence-b');
    const helloA = await a.next((message) => message.type === 'hello');
    await b.next((message) => message.type === 'hello');
    if (helloA.type !== 'hello') throw new Error('Expected hello');

    a.send({ ...request('subscribe'), requestId: 'unknown', query: 'widgets.missing' });
    expect(await a.response('unknown')).toMatchObject({
      ok: false,
      error: { code: 'unknown_query', retryable: false }
    });

    const extra = request('createAlpha');
    extra.requestId = 'extra';
    (extra.mutation as JsonRecord).mutationId =
      'm_0190b62e-0000-7000-8000-000000000010';
    ((extra.mutation as JsonRecord).args as JsonRecord).extra = true;
    inboxSend(a, extra);
    expect(await a.response('extra')).toMatchObject({
      ok: true,
      value: { ok: false, error: { code: 'invalid_args' } }
    });

    a.send(request('presence'));
    expect(await a.response('presence')).toMatchObject({ ok: true, value: {} });
    expect(
      await b.next(
        (message) =>
          message.type === 'event' &&
          message.event.type === 'presence' &&
          message.event.clientId === helloA.connectionId
      )
    ).toMatchObject({
      event: {
        actor: 'user:wire',
        state: { route: '/widgets', cursor: null }
      }
    });
    await a.expectNo(
      (message) => message.type === 'event' && message.event.type === 'presence'
    );

    const c = await Inbox.open(baseUrl, 'presence-c');
    await c.next((message) => message.type === 'hello');
    expect(
      await c.next(
        (message) =>
          message.type === 'event' &&
          message.event.type === 'presence' &&
          message.event.clientId === helloA.connectionId
      )
    ).toMatchObject({ event: { state: { route: '/widgets', cursor: null } } });
    a.close();
    expect(
      await b.next(
        (message) =>
          message.type === 'event' &&
          message.event.type === 'presence' &&
          message.event.clientId === helloA.connectionId &&
          message.event.state === null
      )
    ).toBeDefined();
    b.close();
    c.close();
  });
});

function inboxSend(inbox: Inbox, message: JsonRecord): void {
  inbox.send(message);
}
