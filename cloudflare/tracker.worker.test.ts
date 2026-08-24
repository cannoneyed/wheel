import { env } from 'cloudflare:workers';
import {
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject
} from 'cloudflare:test';
import { expect, test } from 'vitest';

import {
  SYNC_PROTOCOL_VERSION,
  type SyncSocketMessage,
  type SyncSocketRequest
} from 'wheel/sync';
import { TRACKER_MIGRATIONS } from '../packages/tracker/server/schema';
import {
  fetchTracker,
  TRACKER_APPLICATION_VERSION,
  type TrackerWorkerEnv,
  type TrackerWorkspace
} from './tracker-worker';

const authHeaders = {
  'x-axle-demo-user': 'user_0190b62e-0000-7000-8000-00000000u001',
  'x-axle-demo-session': 'session:test'
};

type MessagePredicate = (message: SyncSocketMessage) => boolean;

class SocketInbox {
  private readonly queued: SyncSocketMessage[] = [];
  private readonly waiters: Array<{
    predicate: MessagePredicate;
    resolve: (message: SyncSocketMessage) => void;
  }> = [];

  constructor(readonly socket: WebSocket) {
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
    socket.accept();
  }

  next(predicate: MessagePredicate, timeoutMs = 5_000): Promise<SyncSocketMessage> {
    const queuedIndex = this.queued.findIndex(predicate);
    if (queuedIndex >= 0) return Promise.resolve(this.queued.splice(queuedIndex, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index < 0) return;
        this.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for a WebSocket frame. Queued: ${JSON.stringify(this.queued)}`));
      }, timeoutMs);
    });
  }

  response(requestId: string): Promise<SyncSocketMessage> {
    return this.next(
      (message) => message.type === 'response' && message.requestId === requestId
    );
  }

  send(request: Omit<SyncSocketRequest, 'protocol'>): void {
    this.socket.send(JSON.stringify({ ...request, protocol: SYNC_PROTOCOL_VERSION }));
  }
}

async function openSyncSocket(
  stub: DurableObjectStub<TrackerWorkspace>,
  options: {
    client: string;
    session?: string;
    version?: number;
    protocol?: number;
  }
): Promise<SocketInbox> {
  const url = new URL('https://tracker.test/sync/websocket');
  url.searchParams.set('client', options.client);
  url.searchParams.set('version', String(options.version ?? TRACKER_APPLICATION_VERSION));
  url.searchParams.set('protocol', String(options.protocol ?? SYNC_PROTOCOL_VERSION));
  const response = await stub.fetch(
    new Request(url, {
      headers: {
        ...authHeaders,
        'x-axle-demo-session': options.session ?? authHeaders['x-axle-demo-session'],
        upgrade: 'websocket'
      }
    })
  );
  expect(response.status).toBe(101);
  expect(response.webSocket).not.toBeNull();
  return new SocketInbox(response.webSocket!);
}

function request(
  type: SyncSocketRequest['type'],
  requestId: string,
  fields: Record<string, unknown>
): Omit<SyncSocketRequest, 'protocol'> {
  return { type, requestId, ...fields } as Omit<SyncSocketRequest, 'protocol'>;
}

test('WebSockets retain subscriptions and presence through Durable Object hibernation', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-websocket-hibernation');

  const ready = await stub.fetch('https://tracker.test/readyz');
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ ok: true, workspaceId: 'axle-demo' });

  const before = await runInDurableObject(stub, async (instance) => ({
    issues: Number((await instance.queryForTests('select count(*) as count from issues'))[0]?.count),
    migrations: Number(
      (await instance.queryForTests('select count(*) as count from _wheel_schema_migrations'))[0]
        ?.count
    )
  }));
  expect(before).toEqual({ issues: 250, migrations: 1 });

  const socketA = await openSyncSocket(stub, { client: 'client-a' });
  const socketB = await openSyncSocket(stub, { client: 'client-b', session: 'session:second' });
  const helloA = await socketA.next((message) => message.type === 'hello');
  const helloB = await socketB.next((message) => message.type === 'hello');
  expect(helloA).toMatchObject({ applicationVersion: 1, schemaVersion: 1 });
  expect(helloB).toMatchObject({ applicationVersion: 1, schemaVersion: 1 });

  socketA.send(request('subscribe', 'subscribe-a', { query: 'teams.all', params: {} }));
  socketB.send(request('subscribe', 'subscribe-b', { query: 'teams.all', params: {} }));
  const subscribedA = await socketA.response('subscribe-a');
  const subscribedB = await socketB.response('subscribe-b');
  expect(subscribedA).toMatchObject({ ok: true, value: { rows: expect.any(Array) } });
  expect(subscribedB).toMatchObject({ ok: true, value: { rows: expect.any(Array) } });
  if (subscribedA.type !== 'response' || !subscribedA.ok) throw new Error('subscribe-a failed');
  if (subscribedB.type !== 'response' || !subscribedB.ok) throw new Error('subscribe-b failed');
  if (!('subscriptionId' in subscribedA.value) || !('subscriptionId' in subscribedB.value)) {
    throw new Error('subscribe did not return snapshots');
  }
  const subscriptionA = subscribedA.value.subscriptionId;
  const subscriptionB = subscribedB.value.subscriptionId;

  socketA.send(request('presence', 'presence-a', { state: { route: '/issues' } }));
  await socketA.response('presence-a');
  expect(
    await socketB.next(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'presence' &&
        message.event.clientId === (helloA.type === 'hello' ? helloA.connectionId : '')
    )
  ).toMatchObject({ event: { state: { route: '/issues' } } });

  await evictDurableObject(stub, { webSockets: 'hibernate' });

  socketA.send(
    request('mutate', 'mutate-after-wake', {
      mutation: {
        clientId: 'untrusted-client-id',
        mutationId: 'm_0190b62e-0000-7000-8000-000000000001',
        name: 'teams.update',
        args: {
          teamId: 'team_0190b62e-0000-7000-8000-00000000t001',
          patch: { name: 'Cloud Team' }
        },
        ids: []
      }
    })
  );
  const [mutation, deltaA, deltaB] = await Promise.all([
    socketA.response('mutate-after-wake'),
    socketA.next(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'delta' &&
        message.event.delta.subscriptionId === subscriptionA
    ),
    socketB.next(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'delta' &&
        message.event.delta.subscriptionId === subscriptionB
    )
  ]);
  expect(mutation).toMatchObject({ ok: true, value: { ok: true } });
  expect(deltaA).toMatchObject({ event: { delta: { puts: [expect.objectContaining({ name: 'Cloud Team' })] } } });
  expect(deltaB).toMatchObject({ event: { delta: { puts: [expect.objectContaining({ name: 'Cloud Team' })] } } });

  const socketC = await openSyncSocket(stub, { client: 'client-c', session: 'session:third' });
  await socketC.next((message) => message.type === 'hello');
  expect(
    await socketC.next(
      (message) =>
        message.type === 'event' &&
        message.event.type === 'presence' &&
        message.event.state !== null
    )
  ).toMatchObject({ event: { state: { route: '/issues' } } });

  expect(await runDurableObjectAlarm(stub)).toBe(true);
  const alarm = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
  expect(alarm).toBeGreaterThan(Date.now());
  socketA.socket.close(1000, 'test_done');
  socketB.socket.close(1000, 'test_done');
  socketC.socket.close(1000, 'test_done');
});

test('version handshakes separate rolling deploys from outdated clients', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-version-handshake');

  const newerClient = await openSyncSocket(stub, {
    client: 'newer-client',
    version: TRACKER_APPLICATION_VERSION + 1
  });
  expect(await newerClient.next((message) => message.type === 'version_mismatch')).toMatchObject({
    reason: 'server_updating',
    serverApplicationVersion: TRACKER_APPLICATION_VERSION
  });

  const olderClient = await openSyncSocket(stub, { client: 'older-client', version: 0 });
  expect(await olderClient.next((message) => message.type === 'version_mismatch')).toMatchObject({
    reason: 'client_outdated',
    minimumClientVersion: 1
  });

  const changedProtocol = await openSyncSocket(stub, {
    client: 'changed-protocol',
    protocol: SYNC_PROTOCOL_VERSION + 1
  });
  expect(await changedProtocol.next((message) => message.type === 'version_mismatch')).toMatchObject({
    reason: 'protocol_mismatch',
    serverProtocol: SYNC_PROTOCOL_VERSION
  });
});

test('deployment shutdown closes sockets and a fresh connection bootstraps again', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-deployment-close');
  const first = await openSyncSocket(stub, { client: 'deploy-client' });
  await first.next((message) => message.type === 'hello');
  const closed = new Promise<void>((resolve) => first.socket.addEventListener('close', () => resolve()));

  await evictDurableObject(stub, { webSockets: 'close' });
  await closed;

  const replacement = await openSyncSocket(stub, { client: 'deploy-client' });
  expect(await replacement.next((message) => message.type === 'hello')).toMatchObject({
    applicationVersion: TRACKER_APPLICATION_VERSION,
    schemaVersion: TRACKER_MIGRATIONS.length
  });
  replacement.socket.close(1000, 'test_done');
});

test('hibernation refuses an attachment from another schema version', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-hibernation-schema-change');
  const client = await openSyncSocket(stub, { client: 'schema-change-client' });
  await client.next((message) => message.type === 'hello');

  await runInDurableObject(stub, (_instance, state) => {
    const [serverSocket] = state.getWebSockets();
    if (!serverSocket) throw new Error('Expected one accepted server WebSocket.');
    const attachment = serverSocket.deserializeAttachment();
    if (typeof attachment !== 'object' || attachment === null) {
      throw new Error('Expected a hibernation attachment.');
    }
    serverSocket.serializeAttachment({ ...attachment, schemaVersion: 2 });
  });

  const closed = new Promise<CloseEvent>((resolve) =>
    client.socket.addEventListener('close', resolve, { once: true })
  );
  await evictDurableObject(stub, { webSockets: 'hibernate' });
  client.send(request('presence', 'wake-with-new-schema', { state: null }));
  await expect(closed).resolves.toMatchObject({ code: 1012, reason: 'deployment_changed' });
});

test('schema migrations apply once and old code refuses newer storage', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-schema-version');
  const versionTwo = [
    ...TRACKER_MIGRATIONS,
    {
      version: 2,
      name: 'migration_probe',
      statements: ['create table migration_probe (id text primary key)']
    }
  ];

  const first = await runInDurableObject(stub, (instance) =>
    instance.applyMigrationsForTests(versionTwo)
  );
  const second = await runInDurableObject(stub, (instance) =>
    instance.applyMigrationsForTests(versionTwo)
  );
  expect(first).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] });
  expect(second).toEqual({ fromVersion: 2, toVersion: 2, applied: [] });
  await expect(
    runInDurableObject(stub, (instance) => instance.applyMigrationsForTests(TRACKER_MIGRATIONS))
  ).rejects.toThrow(/schema version 2 is newer/);
});

test('Cloudflare migration history does not reuse the old tracker migration table', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const stub = namespace.getByName('tracker-legacy-migration-table');

  await runInDurableObject(stub, async (instance) => {
    await instance.queryForTests('drop table _wheel_schema_migrations');
    await instance.queryForTests(`create table _axle_schema_migrations (
      version integer primary key,
      name text not null,
      applied_at text not null
    )`);
    await instance.queryForTests(
      `insert into _axle_schema_migrations (version, name, applied_at)
       values (1, 'initial_tracker_schema', '2026-08-24T00:00:00.000Z')`
    );
  });
  await evictDurableObject(stub);

  const ready = await stub.fetch('https://tracker.test/readyz');
  expect(ready.status).toBe(200);
  expect(
    await runInDurableObject(stub, async (instance) =>
      Number(
        (await instance.queryForTests('select count(*) as count from _wheel_schema_migrations'))[0]
          ?.count
      )
    )
  ).toBe(1);
});

test('schema migration history cannot change and failed SQL rolls back', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const historyStub = namespace.getByName('tracker-schema-history');
  await expect(
    runInDurableObject(historyStub, (instance) =>
      instance.applyMigrationsForTests([
        { ...TRACKER_MIGRATIONS[0], name: 'renamed_initial_schema' }
      ])
    )
  ).rejects.toThrow(/Stored migration 1/);

  const sqlHistoryStub = namespace.getByName('tracker-schema-sql-history');
  await runInDurableObject(sqlHistoryStub, (instance) =>
    instance.applyMigrationsForTests(TRACKER_MIGRATIONS)
  );
  await expect(
    runInDurableObject(sqlHistoryStub, (instance) =>
      instance.applyMigrationsForTests([
        {
          ...TRACKER_MIGRATIONS[0],
          statements: [...TRACKER_MIGRATIONS[0]!.statements, 'select 1']
        }
      ])
    )
  ).rejects.toThrow(/SQL checksum/);

  const rollbackStub = namespace.getByName('tracker-schema-rollback');
  await expect(
    runInDurableObject(rollbackStub, (instance) =>
      instance.applyMigrationsForTests([
        ...TRACKER_MIGRATIONS,
        {
          version: 2,
          name: 'broken_migration',
          statements: [
            'create table migration_must_rollback (id text primary key)',
            'this is not valid SQL'
          ]
        }
      ])
    )
  ).rejects.toThrow();
  const probe = await runInDurableObject(rollbackStub, (instance) =>
    instance.queryForTests(
      "select name from sqlite_master where type = 'table' and name = 'migration_must_rollback'"
    )
  );
  expect(probe).toEqual([]);
});

test('outer Worker keeps health and sync routes out of the static asset binding', async () => {
  const namespace = env.TRACKER_WORKSPACES as unknown as DurableObjectNamespace<TrackerWorkspace>;
  const assetPaths: string[] = [];
  const workerEnv: TrackerWorkerEnv = {
    TRACKER_WORKSPACES: namespace,
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        assetPaths.push(path);
        return new Response(path);
      }
    }
  };

  expect((await fetchTracker(new Request('https://tracker.test/healthz'), workerEnv)).status).toBe(200);
  expect((await fetchTracker(new Request('https://tracker.test/readyz'), workerEnv)).status).toBe(200);
  expect(
    await (await fetchTracker(new Request('https://tracker.test/issues/ENG-42'), workerEnv)).text()
  ).toBe('/index.html');
  expect(await (await fetchTracker(new Request('https://tracker.test/'), workerEnv)).text()).toBe(
    '/index.html'
  );
  expect(
    await (await fetchTracker(new Request('https://tracker.test/assets/app.js'), workerEnv)).text()
  ).toBe('/assets/app.js');
  expect(assetPaths).toEqual(['/index.html', '/index.html', '/assets/app.js']);
});
