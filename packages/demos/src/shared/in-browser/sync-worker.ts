/**
 * The in-browser demo sync server: the SAME six engines the Bun demo server
 * boots (todos, kanban, editor, sheet, graph, sequencer), each on its own WASM
 * SQLite database, running inside a worker. The Bun server wraps each engine
 * in a WebSocket session. This file wraps them in a postMessage RPC that
 * mirrors SyncTransport. Connections are held for each clientId.
 *
 * DUAL-MODE: loaded as a SharedWorker where the browser supports it (one
 * engine per origin — every tab is another client of the same server, so
 * tabs sync with each other and presence works across them), or as a
 * dedicated Worker fallback (one engine per tab). The same file serves both:
 * a SharedWorker attaches one MessagePort per tab via `onconnect`; the
 * dedicated scope IS the single port. Server events route to the port that
 * opened the client connection.
 *
 * No auth layer: there is no untrusted network hop, so connect() attaches the
 * principal directly (the same principal shape server.ts authenticates at upgrade).
 */
import {
  createSyncServer,
  type SqliteDriver,
  type SyncConnection,
  type SyncServer
} from 'wheel/sync/server';

import * as todosSync from '../../todos/sync/todos.sync';
import * as todosServer from '../../todos/sync/todos.server';
import { TODOS_SCHEMA } from '../../todos/sync/todos.server';
import * as kanbanSync from '../../kanban/sync/kanban.sync';
import * as kanbanServer from '../../kanban/sync/kanban.server';
import { KANBAN_SCHEMA } from '../../kanban/sync/kanban.server';
import * as editorServer from 'wheel-chalk/server';
import { EDITOR_SCHEMA } from 'wheel-chalk/server';
import * as editorSync from 'wheel-chalk/sync';
import * as sheetSync from '../../sheet/sync/sheet.sync';
import * as sheetServer from '../../sheet/sync/sheet.server';
import { SHEET_SCHEMA } from '../../sheet/sync/sheet.server';
import * as graphSync from '../../graph/sync/graph.sync';
import * as graphServer from '../../graph/sync/graph.server';
import { GRAPH_SCHEMA } from '../../graph/sync/graph.server';
import * as sequencerSync from '../../sequencer/sync/sequencer.sync';
import * as sequencerServer from '../../sequencer/sync/sequencer.server';
import { SEQUENCER_SCHEMA } from '../../sequencer/sync/sequencer.server';

import { createWasmSqliteDriverFactory } from './wasm-sqlite-driver';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

/** One tab's wire — a MessagePort in shared mode, the worker global itself in dedicated mode. */
interface ClientPort {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  /** MessagePorts must be started before they deliver; absent on the dedicated global. */
  start?(): void;
}

interface ClientEntry {
  connection: SyncConnection;
  port: ClientPort;
}

interface DemoEngine {
  server: SyncServer;
  connections: Map<string, ClientEntry>;
}

const engines = new Map<string, DemoEngine>();

async function bootEngine(
  makeDriver: () => SqliteDriver,
  demo: string,
  syncModule: object,
  servers: object,
  schema: { create: string[]; seed: string[] }
): Promise<void> {
  // ONE driver, shared: create + seed the tables on it, then hand the same
  // driver to the engine (a :memory: database is per-connection) — the same
  // boot sequence as packages/demos/server.ts.
  const driver = makeDriver();
  for (const statement of [...schema.create, ...schema.seed]) {
    driver.all(statement);
  }
  const server = await createSyncServer({ sqlite: { driver }, syncModules: [syncModule], servers: [servers] });
  engines.set(demo, { server, connections: new Map() });
}

function engineFor(demo: string): DemoEngine {
  const engine = engines.get(demo);
  if (!engine) {
    throw new Error(`in-browser sync: unknown demo engine "${demo}"`);
  }
  return engine;
}

async function handle(request: WorkerRequest, port: ClientPort): Promise<unknown> {
  const engine = engineFor(request.demo);
  switch (request.op) {
    case 'connect': {
      // A same-id reconnect supersedes the old connection.
      engine.connections.get(request.clientId)?.connection.close();
      const connection = engine.server.connect(request.clientId, {
        actor: request.actor,
        workspaceId: `demo:${request.demo}`,
        sessionId: request.clientId
      });
      // Events go to the port that owns this client.
      connection.onEvent((event) =>
        port.postMessage({ kind: 'event', demo: request.demo, clientId: request.clientId, event })
      );
      engine.connections.set(request.clientId, { connection, port });
      return null;
    }
    case 'subscribe': {
      const entry = engine.connections.get(request.clientId);
      if (!entry) {
        throw new Error(`in-browser sync: client "${request.clientId}" is not connected`);
      }
      return entry.connection.subscribe(request.queryName, request.params);
    }
    case 'unsubscribe': {
      engine.connections.get(request.clientId)?.connection.unsubscribe(request.subscriptionId);
      return null;
    }
    case 'mutateGroup': {
      const entry = engine.connections.get(request.request.clientId);
      if (!entry) {
        throw new Error(`in-browser sync: client "${request.request.clientId}" is not connected`);
      }
      return engine.server.mutateGroup(request.request, entry.connection.principal);
    }
    case 'presence': {
      await engine.server.setPresence(request.clientId, request.state);
      return null;
    }
    case 'close': {
      engine.connections.get(request.clientId)?.connection.close();
      engine.connections.delete(request.clientId);
      return null;
    }
  }
}

/** Boot exactly once, no matter how many tabs attach. */
let bootPromise: Promise<void> | null = null;

function boot(): Promise<void> {
  bootPromise ??= (async () => {
    const makeDriver = await createWasmSqliteDriverFactory();
    await Promise.all([
      bootEngine(makeDriver, 'todos', todosSync, todosServer, TODOS_SCHEMA),
      bootEngine(makeDriver, 'kanban', kanbanSync, kanbanServer, KANBAN_SCHEMA),
      bootEngine(makeDriver, 'editor', editorSync, editorServer, EDITOR_SCHEMA),
      bootEngine(makeDriver, 'sheet', sheetSync, sheetServer, SHEET_SCHEMA),
      bootEngine(makeDriver, 'graph', graphSync, graphServer, GRAPH_SCHEMA),
      bootEngine(makeDriver, 'sequencer', sequencerSync, sequencerServer, SEQUENCER_SCHEMA)
    ]);
  })();
  return bootPromise;
}

/** Wire one tab: route its requests, reply on its own port, handshake when ready. */
function attach(port: ClientPort): void {
  port.onmessage = (event) => {
    const request = event.data;
    void handle(request, port)
      .then((result) => port.postMessage({ kind: 'result', id: request.id, result }))
      .catch((error: unknown) =>
        port.postMessage({
          kind: 'error',
          id: request.id,
          message: error instanceof Error ? error.message : String(error)
        })
      );
  };
  port.start?.();
  void boot()
    .then(() => port.postMessage({ kind: 'ready' }))
    .catch((error: unknown) =>
      port.postMessage({ kind: 'boot-error', message: error instanceof Error ? error.message : String(error) })
    );
}

// Shared scope exposes `onconnect` (one MessagePort per tab); the dedicated
// scope is itself the single port.
const scope = self as unknown as {
  onconnect?: ((event: MessageEvent) => void) | null;
} & ClientPort;

if ('onconnect' in scope) {
  scope.onconnect = (event: MessageEvent) => {
    const port = event.ports[0] as unknown as ClientPort;
    attach(port);
  };
} else {
  attach(scope);
}
