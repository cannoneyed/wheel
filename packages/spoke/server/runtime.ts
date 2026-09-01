import { mkdirSync } from 'node:fs';
import type { ServerWebSocket } from 'bun';
import { defineAuthenticator, type AuthPrincipal } from 'wheel/auth';
import { systemClock } from 'wheel/sync';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SqliteDriver,
  type SyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from 'wheel/sync/server';

import { SPOKE_WORKSPACES, spokeSeed } from '../seed/seed';
import { SPOKE_DDL } from '../src/sync/spoke.server';

interface SocketData {
  readonly workspaceId: string;
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

interface WorkspaceRuntime {
  readonly driver: SqliteDriver;
  readonly server: SyncServer;
  readonly sockets: SyncSocketServer;
}

export interface SpokeRuntimeOptions {
  readonly port: number;
  readonly databaseDirectory?: string;
  readonly syncModules: readonly object[];
  readonly servers: readonly object[];
  readonly rowSchemaFingerprint: string;
}

export interface SpokeRuntime {
  close(): Promise<void>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const actorMember = (actor: string): string => actor.replace(/^user:/, '');

function socketAdapter(socket: ServerWebSocket<SocketData>): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.data.attachment,
    setAttachment: (value) => {
      socket.data.attachment = value;
    }
  };
}

function canReceivePresence(
  driver: SqliteDriver,
  sender: AuthPrincipal,
  recipient: AuthPrincipal,
  state: Record<string, unknown>
): boolean {
  if (sender.workspaceId !== recipient.workspaceId || typeof state.channelId !== 'string') return false;
  const senderId = actorMember(sender.actor);
  const recipientId = actorMember(recipient.actor);
  const rows = driver.all(
    `select count(*) as count from channel_members
     where channel_id = ? and member_id in (?, ?)`,
    [state.channelId, senderId, recipientId]
  );
  return rows[0]?.count === (senderId === recipientId ? 1 : 2);
}

const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor');
  const sessionId = url.searchParams.get('session');
  const workspaceId = url.searchParams.get('workspace');
  return actor && sessionId && workspaceId ? { actor, sessionId, workspaceId } : null;
});

async function botWrite(request: Request, workspaces: Map<string, WorkspaceRuntime>): Promise<Response> {
  const workspaceId = new URL(request.url).searchParams.get('workspace');
  const workspace = workspaceId ? workspaces.get(workspaceId) : undefined;
  if (!workspace) return json({ ok: false, error: 'unknown_workspace' }, 404);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!input || typeof input !== 'object') return json({ ok: false, error: 'invalid_body' }, 400);
  const { channelId, body } = input as { channelId?: unknown; body?: unknown };
  if (typeof channelId !== 'string' || typeof body !== 'string' || body.trim().length === 0 || body.length > 240) {
    return json({ ok: false, error: 'invalid_message' }, 400);
  }
  if (workspace.driver.all('select 1 from channels where id = ?', [channelId]).length === 0) {
    return json({ ok: false, error: 'unknown_channel' }, 404);
  }
  const messageId = `message_bot_${crypto.randomUUID()}`;
  workspace.driver.all(
    `insert into messages (id, channel_id, author_id, body, created_at, edited_at)
     values (?, ?, ?, ?, ?, null)`,
    [messageId, channelId, 'bot', body.trim(), systemClock.now()]
  );
  const seq = await workspace.server.externalWrite({
    tables: ['messages'],
    source: 'bot.message',
    actor: 'bot:spoke'
  });
  return json({ ok: true, messageId, seq }, 201);
}

/** Boot one SQLite sync engine per Spoke workspace behind one HTTP server. */
export async function startSpokeServer(options: SpokeRuntimeOptions): Promise<SpokeRuntime> {
  if (options.databaseDirectory) mkdirSync(options.databaseDirectory, { recursive: true });
  const workspaces = new Map<string, WorkspaceRuntime>();
  try {
    for (const workspaceId of SPOKE_WORKSPACES) {
      const filename = options.databaseDirectory ? `${options.databaseDirectory}/${workspaceId}.sqlite` : ':memory:';
      const driver = bunSqliteDriver(filename);
      for (const statement of SPOKE_DDL) driver.all(statement);
      for (const statement of spokeSeed(workspaceId)) driver.all(statement);
      const server = await createSyncServer({
        sqlite: { driver },
        syncModules: [...options.syncModules],
        servers: [...options.servers],
        presenceFilter: ({ sender, recipient, state }) =>
          canReceivePresence(driver, sender, recipient, state)
      });
      const sockets = new SyncSocketServer({
        server,
        applicationVersion: 1,
        schemaVersion: 1,
        rowSchemaFingerprint: options.rowSchemaFingerprint,
        detailedErrors: true
      });
      workspaces.set(workspaceId, { driver, server, sockets });
    }
  } catch (error) {
    await Promise.all([...workspaces.values()].map((workspace) => workspace.server.close()));
    throw error;
  }

  const http = Bun.serve<SocketData>({
    port: options.port,
    async fetch(request, server): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/readyz') {
        try {
          for (const workspace of workspaces.values()) workspace.driver.all('select 1');
          return json({ ok: true, workspaces: [...workspaces.keys()] });
        } catch {
          return json({ ok: false }, 503);
        }
      }
      if (request.method === 'POST' && url.pathname === '/bot/message') {
        return botWrite(request, workspaces);
      }
      if (url.pathname === '/sync/websocket') {
        const workspaceId = url.searchParams.get('workspace');
        const workspace = workspaceId ? workspaces.get(workspaceId) : undefined;
        if (!workspace || !workspaceId) return json({ ok: false, error: 'unknown_workspace' }, 404);
        const authenticated = await authenticateSyncSocket(request, { authenticator, workspaceId });
        if (!authenticated.ok) return authenticated.response;
        return server.upgrade(request, {
          data: { workspaceId, handshake: authenticated.handshake, attachment: null }
        })
          ? undefined
          : json({ ok: false, error: 'upgrade_failed' }, 500);
      }
      return new Response('Spoke sync server', { status: url.pathname === '/' ? 200 : 404 });
    },
    websocket: {
      open(socket) {
        workspaces.get(socket.data.workspaceId)!.sockets.accept(socketAdapter(socket), socket.data.handshake);
      },
      message(socket, message) {
        void workspaces.get(socket.data.workspaceId)!.sockets.message(socketAdapter(socket), message).catch((error) => {
          console.error('Spoke WebSocket message failed', error);
          socket.close(1011, 'message_failed');
        });
      },
      close(socket) {
        workspaces.get(socket.data.workspaceId)?.sockets.close(socketAdapter(socket));
      }
    }
  });

  let closing: Promise<void> | null = null;
  return {
    close: () => {
      closing ??= (async () => {
        for (const workspace of workspaces.values()) workspace.sockets.closeAll(1001, 'server_shutdown');
        await http.stop(true);
        await Promise.all([...workspaces.values()].map((workspace) => workspace.server.close()));
      })();
      return closing;
    }
  };
}
