import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ServerWebSocket } from 'bun';
import { defineAuthenticator } from 'wheel/auth';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from 'wheel/sync/server';

import { applyChalkSeed } from '../seed/seed';
import { EDITOR_SCHEMA } from '../src/editor/sync/editor.server';

interface SocketData {
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

export interface ChalkRuntimeOptions {
  readonly port: number;
  readonly databaseFilename: string;
  readonly syncModules: readonly object[];
  readonly servers: readonly object[];
  readonly rowSchemaFingerprint: string;
}

export interface ChalkRuntime {
  close(): Promise<void>;
}

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

const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('demoActor');
  const sessionId = url.searchParams.get('demoSession');
  return actor && sessionId ? { actor, sessionId, workspaceId: 'chalk' } : null;
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/** Boot one Chalk SQLite sync server. */
export async function startChalkServer(options: ChalkRuntimeOptions): Promise<ChalkRuntime> {
  if (options.databaseFilename !== ':memory:') mkdirSync(dirname(options.databaseFilename), { recursive: true });
  const driver = bunSqliteDriver(options.databaseFilename);
  for (const statement of EDITOR_SCHEMA.create) driver.all(statement);
  applyChalkSeed(driver);

  const live = await createSyncServer({
    sqlite: { driver },
    syncModules: [...options.syncModules],
    servers: [...options.servers]
  });
  const sockets = new SyncSocketServer({
    server: live,
    applicationVersion: 1,
    schemaVersion: 1,
    rowSchemaFingerprint: options.rowSchemaFingerprint,
    detailedErrors: true
  });

  let http: ReturnType<typeof Bun.serve<SocketData>>;
  try {
    http = Bun.serve<SocketData>({
      port: options.port,
      async fetch(request, server): Promise<Response | undefined> {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/readyz') {
          try {
            driver.all('select 1');
            return json({ ok: true });
          } catch {
            return json({ ok: false }, 503);
          }
        }
        if (url.pathname === '/sync/websocket') {
          const authenticated = await authenticateSyncSocket(request, { authenticator, workspaceId: 'chalk' });
          if (!authenticated.ok) return authenticated.response;
          return server.upgrade(request, { data: { handshake: authenticated.handshake, attachment: null } })
            ? undefined
            : json({ ok: false, error: 'upgrade_failed' }, 500);
        }
        return new Response('Chalk sync server', { status: url.pathname === '/' ? 200 : 404 });
      },
      websocket: {
        open(socket) {
          sockets.accept(socketAdapter(socket), socket.data.handshake);
        },
        message(socket, message) {
          void sockets.message(socketAdapter(socket), message).catch((error) => {
            console.error('Chalk WebSocket message failed', error);
            socket.close(1011, 'message_failed');
          });
        },
        close(socket) {
          sockets.close(socketAdapter(socket));
        }
      }
    });
  } catch (error) {
    await live.close();
    throw error;
  }

  let closing: Promise<void> | null = null;
  return {
    close: () => {
      closing ??= (async () => {
        sockets.closeAll(1001, 'server_shutdown');
        try {
          await http.stop(true);
        } finally {
          await live.close();
        }
      })();
      return closing;
    }
  };
}
