import { DurableObject } from 'cloudflare:workers';

import { defineAuthenticator, type AuthPrincipal } from 'wheel/auth';
import { systemClock } from 'wheel/sync';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  createCloudflareSyncBackend,
  createSyncServer,
  runDurableObjectSql,
  type DurableObjectStorageLike,
  type SyncServer,
  type SyncServerSocket
} from 'wheel/sync/server/cloudflare';

import { ROW_SCHEMA_FINGERPRINT } from '../packages/spoke/row-schema.generated';
import { SPOKE_WORKSPACES, spokeSeed } from '../packages/spoke/seed/seed';
import { SPOKE_SERVERS, SPOKE_SYNC_MODULES } from '../packages/spoke/server/modules';
import { SPOKE_DDL } from '../packages/spoke/src/sync/spoke.server';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface SpokeWorkerEnv {
  readonly ASSETS: AssetBinding;
  readonly SPOKE_WORKSPACES: DurableObjectNamespace<SpokeWorkspace>;
}

interface SpokeRuntime {
  readonly server: SyncServer;
  readonly sockets: SyncSocketServer;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const isWorkspace = (value: string | null): value is (typeof SPOKE_WORKSPACES)[number] =>
  value !== null && SPOKE_WORKSPACES.includes(value as (typeof SPOKE_WORKSPACES)[number]);

const actorMember = (actor: string): string => actor.replace(/^user:/, '');

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

function canReceivePresence(
  sql: SqlStorage,
  sender: AuthPrincipal,
  recipient: AuthPrincipal,
  state: Record<string, unknown>
): boolean {
  if (sender.workspaceId !== recipient.workspaceId || typeof state.channelId !== 'string') return false;
  const senderId = actorMember(sender.actor);
  const recipientId = actorMember(recipient.actor);
  const rows = runDurableObjectSql(
    sql,
    `select count(*) as count from channel_members
     where channel_id = ? and member_id in (?, ?)`,
    [state.channelId, senderId, recipientId]
  );
  return Number(rows[0]?.count) === (senderId === recipientId ? 1 : 2);
}

const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor');
  const sessionId = url.searchParams.get('session');
  const workspaceId = url.searchParams.get('workspace');
  return actor && sessionId && workspaceId ? { actor, sessionId, workspaceId } : null;
});

/** One routed Spoke workspace and its private SQLite database. */
export class SpokeWorkspace extends DurableObject<SpokeWorkerEnv> {
  private workspaceId: string | null = null;
  private runtime: Promise<SpokeRuntime> | null = null;
  private readonly restored: Promise<void>;

  constructor(ctx: DurableObjectState, env: SpokeWorkerEnv) {
    super(ctx, env);
    this.restored = ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        'create table if not exists spoke_workspace (id text primary key)'
      );
      const stored = this.ctx.storage.sql.exec('select id from spoke_workspace limit 1').toArray()[0]?.id;
      if (typeof stored === 'string') {
        this.workspaceId = stored;
        this.runtime = this.boot(stored);
        await this.runtime;
      }
    });
  }

  private async boot(workspaceId: string): Promise<SpokeRuntime> {
    for (const statement of SPOKE_DDL) this.ctx.storage.sql.exec(statement);
    for (const statement of spokeSeed(workspaceId)) this.ctx.storage.sql.exec(statement);
    const backend = createCloudflareSyncBackend({
      storage: storageAdapter(this.ctx.storage),
      clock: systemClock
    });
    const server = await createSyncServer({
      backend,
      syncModules: [...SPOKE_SYNC_MODULES],
      servers: [...SPOKE_SERVERS],
      presenceFilter: ({ sender, recipient, state }) =>
        canReceivePresence(this.ctx.storage.sql, sender, recipient, state)
    });
    const sockets = new SyncSocketServer({
      server,
      applicationVersion: 1,
      schemaVersion: 1,
      rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
      detailedErrors: true
    });
    await sockets.restore(this.ctx.getWebSockets().map(socketAdapter));
    return { server, sockets };
  }

  private async ensureRuntime(workspaceId: string): Promise<SpokeRuntime> {
    await this.restored;
    if (this.workspaceId !== null && this.workspaceId !== workspaceId) {
      throw new Error(`Spoke object belongs to ${this.workspaceId}, not ${workspaceId}.`);
    }
    if (!this.runtime) {
      this.ctx.storage.sql.exec('insert into spoke_workspace (id) values (?)', workspaceId);
      this.workspaceId = workspaceId;
      this.runtime = this.boot(workspaceId);
    }
    return this.runtime;
  }

  private async botWrite(request: Request, runtime: SpokeRuntime): Promise<Response> {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }
    if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_body' }, 400);
    const { channelId, body } = input as { channelId?: unknown; body?: unknown };
    const text = typeof body === 'string' ? body.trim() : '';
    if (typeof channelId !== 'string' || text.length === 0 || text.length > 240) {
      return json({ ok: false, error: 'invalid_message' }, 400);
    }
    if (runDurableObjectSql(this.ctx.storage.sql, 'select 1 from channels where id = ?', [channelId]).length === 0) {
      return json({ ok: false, error: 'unknown_channel' }, 404);
    }
    const messageId = `message_bot_${crypto.randomUUID()}`;
    runDurableObjectSql(
      this.ctx.storage.sql,
      `insert into messages (id, channel_id, author_id, body, created_at, edited_at)
       values (?, ?, ?, ?, ?, null)`,
      [messageId, channelId, 'bot', text, systemClock.now()]
    );
    const seq = await runtime.server.externalWrite({
      tables: ['messages'],
      source: 'bot.message',
      actor: 'bot:spoke'
    });
    return json({ ok: true, messageId, seq }, 201);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspace');
    if (!isWorkspace(workspaceId)) return json({ ok: false, error: 'unknown_workspace' }, 404);
    const runtime = await this.ensureRuntime(workspaceId);
    if (request.method === 'GET' && url.pathname === '/readyz') {
      this.ctx.storage.sql.exec('select 1');
      return json({ ok: true, workspaceId });
    }
    if (request.method === 'POST' && url.pathname === '/bot/message') {
      return this.botWrite(request, runtime);
    }
    if (url.pathname !== '/sync/websocket') return json({ ok: false, error: 'not_found' }, 404);
    const authenticated = await authenticateSyncSocket(request, { authenticator, workspaceId });
    if (!authenticated.ok) return authenticated.response;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    runtime.sockets.accept(socketAdapter(server), authenticated.handshake);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.restored;
    if (!this.runtime) throw new Error('Spoke workspace was not initialized.');
    await (await this.runtime).sockets.message(socketAdapter(socket), message);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    await this.restored;
    if (this.runtime) (await this.runtime).sockets.close(socketAdapter(socket));
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error('Spoke sync WebSocket error', error);
    await this.webSocketClose(socket);
  }
}

export async function fetchSpoke(request: Request, env: SpokeWorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/healthz') return json({ ok: true });
  if (url.pathname.startsWith('/sync/') || url.pathname === '/readyz' || url.pathname.startsWith('/bot/')) {
    const workspaceId = url.searchParams.get('workspace');
    if (!isWorkspace(workspaceId)) return json({ ok: false, error: 'unknown_workspace' }, 404);
    return env.SPOKE_WORKSPACES.getByName(workspaceId).fetch(request);
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

export default { fetch: fetchSpoke } satisfies ExportedHandler<SpokeWorkerEnv>;
