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

import * as todosServer from './todos.server';
import * as todosSync from './todos.sync';
import { TODOS_SCHEMA } from './todos.server';

const driver = bunSqliteDriver('./todos.db');
for (const statement of TODOS_SCHEMA) {
  driver.all(statement);
}

const syncServer = await createSyncServer({
  sqlite: { driver },
  syncModules: [todosSync],
  servers: [todosServer]
});

// Demo only: a real app verifies its cookie or bearer token here.
const authenticator = defineAuthenticator((request) => {
  const url = new URL(request.url);
  const actor = url.searchParams.get('demoActor');
  const sessionId = url.searchParams.get('demoSession');
  return actor && sessionId
    ? { actor, sessionId, workspaceId: 'todos' }
    : null;
});

const sockets = new SyncSocketServer({
  server: syncServer,
  applicationVersion: 1,
  schemaVersion: 1
});

interface SocketData {
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
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

const httpServer = Bun.serve<SocketData>({
  port: 4795,
  async fetch(request, server) {
    const authenticated = await authenticateSyncSocket(request, {
      authenticator,
      workspaceId: 'todos'
    });
    if (!authenticated.ok) return authenticated.response;
    const upgraded = server.upgrade(request, {
      data: { handshake: authenticated.handshake, attachment: null }
    });
    return upgraded ? undefined : new Response('Upgrade failed.', { status: 500 });
  },
  websocket: {
    open(socket) {
      sockets.accept(socketAdapter(socket), socket.data.handshake);
    },
    message(socket, message) {
      void sockets.message(socketAdapter(socket), message);
    },
    close(socket) {
      sockets.close(socketAdapter(socket));
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    sockets.closeAll(1001, 'server_shutdown');
    void httpServer.stop(true).then(() => syncServer.close());
  });
}
