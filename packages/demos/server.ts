/**
 * The demo server: SIX live engines (todos, kanban, editor, sheet, graph,
 * sequencer), each on
 * its own in-process SQLite database (the default backend, on the production
 * `bun:sqlite` driver — this file runs under Bun), behind one Bun.serve.
 * WebSockets are routed by prefix (`/sync/todos/sync/websocket` → the todos
 * engine).
 *
 *   bun run packages/demos/server.ts [port]     # default PORT env, else 4795
 *
 * The vite dev shell (`bun run demos`) proxies these prefixes, so the apps
 * talk same-origin. Kill and restart this server while the apps run to watch
 * the reconnect + hydrate story do its thing.
 */
// Bun resolves wheel's `bun` export condition straight to source — no build.
import type { ServerWebSocket } from 'bun';
import { defineAuthenticator, type Authenticator } from 'wheel/auth';
import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from 'wheel/sync/server';

import * as todosSync from './src/todos/sync/todos.sync';
import * as todosServer from './src/todos/sync/todos.server';
import { TODOS_SCHEMA } from './src/todos/sync/todos.server';
import * as kanbanSync from './src/kanban/sync/kanban.sync';
import * as kanbanServer from './src/kanban/sync/kanban.server';
import { KANBAN_SCHEMA } from './src/kanban/sync/kanban.server';
import * as editorSync from './src/editor/sync/editor.sync';
import * as editorServer from './src/editor/sync/editor.server';
import { EDITOR_SCHEMA } from './src/editor/sync/editor.server';
import * as sheetSync from './src/sheet/sync/sheet.sync';
import * as sheetServer from './src/sheet/sync/sheet.server';
import { SHEET_SCHEMA } from './src/sheet/sync/sheet.server';
import * as graphSync from './src/graph/sync/graph.sync';
import * as graphServer from './src/graph/sync/graph.server';
import { GRAPH_SCHEMA } from './src/graph/sync/graph.server';
import * as sequencerSync from './src/sequencer/sync/sequencer.sync';
import * as sequencerServer from './src/sequencer/sync/sequencer.server';
import { SEQUENCER_SCHEMA } from './src/sequencer/sync/sequencer.server';
import { ROW_SCHEMA_FINGERPRINTS } from './src/shared/row-schema.generated';

// PORT is how portless (and any other supervisor) assigns a free port;
// the literal is the fallback for a plain `bun run demos:server`.
const port = Number(process.argv[2] ?? process.env.PORT ?? 4795);
const DEMO_APPLICATION_VERSION = 1;

interface DemoEngine {
  prefix: string;
  workspaceId: string;
  authenticator: Authenticator;
  sockets: SyncSocketServer;
  close: () => Promise<void>;
}

interface DemoSocketData {
  readonly engine: DemoEngine;
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

function socketAdapter(socket: ServerWebSocket<DemoSocketData>): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.data.attachment,
    setAttachment: (value) => {
      socket.data.attachment = value;
    }
  };
}

async function bootEngine(
  prefix: string,
  syncModule: object,
  servers: object,
  schema: { create: string[]; seed: string[] },
  rowSchemaFingerprint: string
): Promise<DemoEngine> {
  // ONE bun:sqlite :memory: driver, shared: create + seed the tables on it,
  // then hand the same driver to the engine (a :memory: db is per-connection).
  const driver = bunSqliteDriver(':memory:');
  for (const statement of [...schema.create, ...schema.seed]) {
    driver.all(statement);
  }
  const live = await createSyncServer({ sqlite: { driver }, syncModules: [syncModule], servers: [servers] });
  const workspaceId = `demo:${prefix.slice(1)}`;
  const authenticator = defineAuthenticator((request) => {
    const url = new URL(request.url);
    const actor = request.headers.get('x-wheel-demo-actor') ?? url.searchParams.get('demoActor');
    const sessionId =
      request.headers.get('x-wheel-demo-session') ?? url.searchParams.get('demoSession');
    return actor && sessionId ? { actor, sessionId, workspaceId } : null;
  });
  const sockets = new SyncSocketServer({
    server: live,
    applicationVersion: DEMO_APPLICATION_VERSION,
    schemaVersion: 1,
    rowSchemaFingerprint,
    detailedErrors: true
  });
  return {
    prefix,
    workspaceId,
    authenticator,
    sockets,
    close: async () => {
      sockets.closeAll();
      await live.close();
    }
  };
}

/** Boot thunks by prefix — kept so `__reset` can rebuild an engine from scratch. */
const BOOTS: Record<string, () => Promise<DemoEngine>> = {
  '/sync/todos': () =>
    bootEngine('/sync/todos', todosSync, todosServer, TODOS_SCHEMA, ROW_SCHEMA_FINGERPRINTS.todos),
  '/sync/kanban': () =>
    bootEngine('/sync/kanban', kanbanSync, kanbanServer, KANBAN_SCHEMA, ROW_SCHEMA_FINGERPRINTS.kanban),
  '/sync/editor': () =>
    bootEngine('/sync/editor', editorSync, editorServer, EDITOR_SCHEMA, ROW_SCHEMA_FINGERPRINTS.editor),
  '/sync/sheet': () =>
    bootEngine('/sync/sheet', sheetSync, sheetServer, SHEET_SCHEMA, ROW_SCHEMA_FINGERPRINTS.sheet),
  '/sync/graph': () =>
    bootEngine('/sync/graph', graphSync, graphServer, GRAPH_SCHEMA, ROW_SCHEMA_FINGERPRINTS.graph),
  '/sync/sequencer': () =>
    bootEngine(
      '/sync/sequencer',
      sequencerSync,
      sequencerServer,
      SEQUENCER_SCHEMA,
      ROW_SCHEMA_FINGERPRINTS.sequencer
    )
};

const engines = new Map<string, DemoEngine>();
for (const [prefix, boot] of Object.entries(BOOTS)) {
  engines.set(prefix, await boot());
}

/** Serialize resets per prefix so concurrent callers cannot double-boot. */
const resets = new Map<string, Promise<void>>();

Bun.serve<DemoSocketData>({
  port,
  async fetch(request, bunServer): Promise<Response | undefined> {
    const url = new URL(request.url);
    for (const [prefix, engine] of engines) {
      if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
        continue;
      }
      // Dev/test reset: rebuild the engine on a fresh seeded database. Live
      // WebSocket clients of the old engine are dropped — the behavior suite calls
      // this between page loads, never under an open client.
      if (url.pathname === `${prefix}/__reset` && request.method === 'POST') {
        const pending = (resets.get(prefix) ?? Promise.resolve()).then(async () => {
          await engines.get(prefix)?.close();
          engines.set(prefix, await BOOTS[prefix]!());
        });
        resets.set(prefix, pending.catch(() => {}));
        await pending;
        return new Response('reset', { status: 200 });
      }
      const inner = new URL(url);
      inner.pathname = url.pathname.slice(prefix.length) || '/';
      if (inner.pathname !== '/sync/websocket') {
        return new Response('sync route not found', { status: 404 });
      }
      const authenticated = await authenticateSyncSocket(new Request(inner, request), {
        authenticator: engine.authenticator,
        workspaceId: engine.workspaceId
      });
      if (!authenticated.ok) return authenticated.response;
      if (
        bunServer.upgrade(request, {
          data: { engine, handshake: authenticated.handshake, attachment: null }
        })
      ) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed.', { status: 500 });
    }
    return new Response(`wheel demo server — engines: ${[...engines.keys()].join(', ')}`, {
      status: url.pathname === '/' ? 200 : 404
    });
  },
  websocket: {
    open(socket) {
      socket.data.engine.sockets.accept(socketAdapter(socket), socket.data.handshake);
    },
    message(socket, message) {
      void socket.data.engine.sockets
        .message(socketAdapter(socket), message)
        .catch((error) => {
          console.error('demo WebSocket message failed', error);
          socket.close(1011, 'message_failed');
        });
    },
    close(socket) {
      socket.data.engine.sockets.close(socketAdapter(socket));
    }
  }
});

console.log(`wheel demo server on :${port} — ${[...engines.keys()].join(', ')}`);
