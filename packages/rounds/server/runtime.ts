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

import { ROW_SCHEMA_FINGERPRINT } from '../row-schema.generated';
import { applyRoundsSeed } from '../seed/seed';
import { ROUNDS_SYNC_MODULES } from './modules';
import { ROUNDS_DDL } from '../src/sync/rounds.server';

interface SocketData {
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

/** Runtime options shared by the production and test-only Rounds entries. */
export interface RoundsRuntimeOptions {
  readonly port: number;
  readonly databaseFilename: string;
  readonly servers: readonly object[];
  readonly extraFetch?: (request: Request) => Response | Promise<Response | undefined> | undefined;
}

/** A running Rounds server. */
export interface RoundsRuntime {
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
  return actor && sessionId ? { actor, sessionId, workspaceId: 'rounds' } : null;
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/** Boot one Rounds SQLite sync server. */
export async function startRoundsServer(options: RoundsRuntimeOptions): Promise<RoundsRuntime> {
  if (options.databaseFilename !== ':memory:') mkdirSync(dirname(options.databaseFilename), { recursive: true });
  const driver = bunSqliteDriver(options.databaseFilename);
  for (const statement of ROUNDS_DDL) driver.all(statement);
  applyRoundsSeed(driver);

  const live = await createSyncServer({
    sqlite: { driver },
    syncModules: [...ROUNDS_SYNC_MODULES],
    servers: [...options.servers]
  });
  const sockets = new SyncSocketServer({
    server: live,
    applicationVersion: 1,
    schemaVersion: 1,
    rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
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
        const extra = await options.extraFetch?.(request);
        if (extra) return extra;
        if (url.pathname === '/sync/websocket') {
          const authenticated = await authenticateSyncSocket(request, {
            authenticator,
            workspaceId: 'rounds'
          });
          if (!authenticated.ok) return authenticated.response;
          return server.upgrade(request, {
            data: { handshake: authenticated.handshake, attachment: null }
          })
            ? undefined
            : json({ ok: false, error: 'upgrade_failed' }, 500);
        }
        return new Response('Rounds sync server', { status: url.pathname === '/' ? 200 : 404 });
      },
      websocket: {
        open(socket) {
          sockets.accept(socketAdapter(socket), socket.data.handshake);
        },
        message(socket, message) {
          void sockets.message(socketAdapter(socket), message).catch((error) => {
            console.error('Rounds WebSocket message failed', error);
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
