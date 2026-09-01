import { DurableObject } from 'cloudflare:workers';

import { defineAuthenticator } from 'wheel/auth';
import { systemClock } from 'wheel/sync';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  createCloudflareSyncBackend,
  createSyncServer,
  type DurableObjectStorageLike,
  type SyncServerSocket
} from 'wheel/sync/server/cloudflare';

import { ROW_SCHEMA_FINGERPRINT } from '../packages/chalk/row-schema.generated';
import { CHALK_SERVERS, CHALK_SYNC_MODULES } from '../packages/chalk/server/modules';
import { EDITOR_SCHEMA } from '../packages/chalk/src/editor/sync/editor.server';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface ChalkWorkerEnv {
  readonly ASSETS: AssetBinding;
  readonly CHALK_WORKSPACES: DurableObjectNamespace<ChalkWorkspace>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

function storageAdapter(storage: DurableObjectStorage): DurableObjectStorageLike {
  return {
    sql: storage.sql,
    transaction: (callback) => storage.transaction(async () => callback())
  };
}

function socketAdapter(socket: WebSocket): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.deserializeAttachment(),
    setAttachment: (value) => socket.serializeAttachment(value)
  };
}

const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('demoActor');
  const sessionId = url.searchParams.get('demoSession');
  return actor && sessionId ? { actor, sessionId, workspaceId: 'chalk' } : null;
});

interface ChalkRuntime {
  readonly sockets: SyncSocketServer;
}

/** One Chalk workspace and its private SQLite database. */
export class ChalkWorkspace extends DurableObject<ChalkWorkerEnv> {
  private readonly runtime: Promise<ChalkRuntime>;

  constructor(ctx: DurableObjectState, env: ChalkWorkerEnv) {
    super(ctx, env);
    this.runtime = ctx.blockConcurrencyWhile(() => this.boot());
  }

  private async boot(): Promise<ChalkRuntime> {
    for (const statement of [...EDITOR_SCHEMA.create, ...EDITOR_SCHEMA.seed]) this.ctx.storage.sql.exec(statement);
    const backend = createCloudflareSyncBackend({ storage: storageAdapter(this.ctx.storage), clock: systemClock });
    const server = await createSyncServer({
      backend,
      syncModules: [...CHALK_SYNC_MODULES],
      servers: [...CHALK_SERVERS]
    });
    const sockets = new SyncSocketServer({
      server,
      applicationVersion: 1,
      schemaVersion: 1,
      rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
      detailedErrors: true
    });
    await sockets.restore(this.ctx.getWebSockets().map(socketAdapter));
    return { sockets };
  }

  async fetch(request: Request): Promise<Response> {
    const { sockets } = await this.runtime;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/readyz') {
      try {
        this.ctx.storage.sql.exec('select 1').toArray();
        return json({ ok: true, workspaceId: 'chalk' });
      } catch {
        return json({ ok: false }, 503);
      }
    }
    if (url.pathname !== '/sync/websocket') return json({ ok: false, error: 'not_found' }, 404);
    const authenticated = await authenticateSyncSocket(request, { authenticator, workspaceId: 'chalk' });
    if (!authenticated.ok) return authenticated.response;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    sockets.accept(socketAdapter(server), authenticated.handshake);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const { sockets } = await this.runtime;
    await sockets.message(socketAdapter(socket), message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const { sockets } = await this.runtime;
    sockets.close(socketAdapter(socket));
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error('Chalk sync WebSocket error', error);
    const { sockets } = await this.runtime;
    sockets.close(socketAdapter(socket));
  }
}

export async function fetchChalk(request: Request, env: ChalkWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true });
  if (url.pathname.startsWith('/sync/') || url.pathname === '/readyz') {
    return env.CHALK_WORKSPACES.getByName('chalk').fetch(request);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const lastSegment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    if (!lastSegment.includes('.')) {
      url.pathname = '/index.html';
      url.search = '';
      return env.ASSETS.fetch(new Request(url, request));
    }
  }
  return env.ASSETS.fetch(request);
}

export default { fetch: fetchChalk } satisfies ExportedHandler<ChalkWorkerEnv>;
