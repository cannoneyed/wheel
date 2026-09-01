import type { Server, ServerWebSocket } from 'bun';

import { defineAuthenticator } from '../../packages/wheel/src/auth';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from '../../packages/wheel/src/sync/server';
import { WIRE_SCHEMA, WIRE_SERVERS, WIRE_SYNC_MODULE } from './fixture-app';
import { ROW_SCHEMA_FINGERPRINT } from './fixtures/row-schema.generated';

export const WIRE_APPLICATION_VERSION = 3;
export const WIRE_MINIMUM_CLIENT_VERSION = 2;
export const WIRE_SCHEMA_VERSION = 1;
const WIRE_WORKSPACE = 'wire-conformance';

interface Runtime {
  sockets: SyncSocketServer;
  close(): Promise<void>;
}

interface SocketData {
  runtime: Runtime;
  handshake: SyncSocketHandshake;
  attachment: unknown;
}

function socketAdapter(socket: ServerWebSocket<SocketData>): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.data.attachment,
    setAttachment: (attachment) => {
      socket.data.attachment = attachment;
    }
  };
}

async function bootRuntime(): Promise<Runtime> {
  const driver = bunSqliteDriver(':memory:');
  for (const statement of WIRE_SCHEMA) driver.exec(statement);
  const server = await createSyncServer({
    sqlite: { driver },
    syncModules: [WIRE_SYNC_MODULE],
    servers: [WIRE_SERVERS]
  });
  const sockets = new SyncSocketServer({
    server,
    applicationVersion: WIRE_APPLICATION_VERSION,
    minimumClientVersion: WIRE_MINIMUM_CLIENT_VERSION,
    schemaVersion: WIRE_SCHEMA_VERSION,
    rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
    detailedErrors: true,
    onError: () => {}
  });
  return {
    sockets,
    async close() {
      sockets.closeAll(1012, 'fixture_reset');
      await server.close();
    }
  };
}

export interface RunningWireServer {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function startTypeScriptWireServer(): Promise<RunningWireServer> {
  let runtime = await bootRuntime();
  let resetting = Promise.resolve();
  const authenticator = defineAuthenticator((request) => {
    const url = new URL(request.url);
    const actor = url.searchParams.get('actor');
    const sessionId = url.searchParams.get('session');
    return actor && sessionId
      ? { actor, sessionId, workspaceId: WIRE_WORKSPACE }
      : null;
  });
  const bunServer: Server<SocketData> = Bun.serve<SocketData>({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request, server): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (url.pathname === '/readyz') {
        return Response.json({ ok: true });
      }
      if (url.pathname === '/__reset' && request.method === 'POST') {
        resetting = resetting.then(async () => {
          await runtime.close();
          runtime = await bootRuntime();
        });
        await resetting;
        return Response.json({ ok: true });
      }
      if (url.pathname !== '/sync/websocket') {
        return Response.json({ ok: false }, { status: 404 });
      }
      const authenticated = await authenticateSyncSocket(request, {
        authenticator,
        workspaceId: WIRE_WORKSPACE
      });
      if (!authenticated.ok) return authenticated.response;
      if (
        server.upgrade(request, {
          data: { runtime, handshake: authenticated.handshake, attachment: null }
        })
      ) {
        return undefined;
      }
      return Response.json({ ok: false }, { status: 500 });
    },
    websocket: {
      open(socket) {
        socket.data.runtime.sockets.accept(socketAdapter(socket), socket.data.handshake);
      },
      message(socket, message) {
        void socket.data.runtime.sockets.message(socketAdapter(socket), message);
      },
      close(socket) {
        socket.data.runtime.sockets.close(socketAdapter(socket));
      }
    }
  });
  return {
    baseUrl: `http://127.0.0.1:${bunServer.port}`,
    async close() {
      void bunServer.stop(true);
      await runtime.close();
    }
  };
}
