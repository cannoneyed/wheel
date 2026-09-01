/**
 * Axle server with two explicit operating modes.
 *
 * Demo (default): in-memory SQLite, deterministic seed, debug endpoint, and
 * trusted user-switcher headers.
 *
 * Production: persistent SQLite, versioned migrations, external session
 * verification, one configured workspace, bounded requests, sanitized sync
 * errors, health/readiness endpoints, and signal-owned shutdown.
 *
 *   bun run packages/tracker/server.ts
 *   TRACKER_MODE=production ... bun run packages/tracker/server.ts
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ServerWebSocket } from 'bun';

import {
  SyncSocketServer,
  authenticateSyncSocket,
  bunSqliteDriver,
  createSyncServer,
  type SyncServerSocket,
  type SyncSocketHandshake
} from 'wheel/sync/server';

import { runCycleRollover } from './jobs/rollover';
import { applySeed } from './seed/seed';
import { createTrackerAuthenticator } from './server/auth';
import { loadTrackerServerConfig } from './server/config';
import { TRACKER_SERVERS, TRACKER_SYNC_MODULES } from './server/modules';
import { applyTrackerMigrations, TRACKER_MIGRATIONS } from './server/schema';
import {
  TRACKER_APPLICATION_VERSION,
  TRACKER_MINIMUM_CLIENT_VERSION
} from './sync-version';
import { ROW_SCHEMA_FINGERPRINT } from './row-schema.generated';

const config = loadTrackerServerConfig(process.env, process.argv[2]);
if (config.databaseFilename !== ':memory:') {
  mkdirSync(dirname(config.databaseFilename), { recursive: true });
}

const driver = bunSqliteDriver(config.databaseFilename);
// Boot-time database access for migrations and the demo seed, before the engine
// exists. Tracker is a SQLite app, so this SQL is SQLite and goes to the driver
// as written — no dialect translation anywhere.
const db = {
  query: (text: string, params?: readonly unknown[]) => Promise.resolve(driver.all(text, params))
};

try {
  applyTrackerMigrations(driver);
  if (config.mode === 'demo') await applySeed(db);
} catch (error) {
  driver.close();
  throw error;
}
// Ownership transfers here. createSyncServer closes the driver itself if boot
// fails, so callers must not attempt a second cleanup.
const live = await createSyncServer({
  sqlite: { driver },
  syncModules: [...TRACKER_SYNC_MODULES],
  servers: [...TRACKER_SERVERS]
});

const authenticator = createTrackerAuthenticator(config);
const sockets = new SyncSocketServer({
  server: live,
  applicationVersion: TRACKER_APPLICATION_VERSION,
  minimumClientVersion: TRACKER_MINIMUM_CLIENT_VERSION,
  schemaVersion: TRACKER_MIGRATIONS.length,
  rowSchemaFingerprint: ROW_SCHEMA_FINGERPRINT,
  maxMessageBytes: config.maxBodyBytes,
  messagesPerMinute: config.requestsPerMinute,
  detailedErrors: config.mode === 'demo'
});

interface TrackerSocketData {
  readonly handshake: SyncSocketHandshake;
  attachment: unknown;
}

function socketAdapter(socket: ServerWebSocket<TrackerSocketData>): SyncServerSocket {
  return {
    send: (message) => socket.send(message),
    close: (code, reason) => socket.close(code, reason),
    getAttachment: () => socket.data.attachment,
    setAttachment: (value) => {
      socket.data.attachment = value;
    }
  };
}

// The job takes explicit domain time. The process scheduler only decides when
// to ask; it is not application state and creates no reactive clock.
const rollover = () =>
  void runCycleRollover({ db, server: live, now: Date.now() }).then((report) => {
    if (report.rolledIssues > 0 || report.createdCycles > 0) {
      console.log(
        `[rollover] moved ${report.rolledIssues} issues, created ${report.createdCycles} cycles`
      );
    }
  });
rollover();
const rolloverTimer = setInterval(rollover, 10 * 60 * 1000);

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });

let httpServer: ReturnType<typeof Bun.serve<TrackerSocketData>>;
try {
  httpServer = Bun.serve<TrackerSocketData>({
    port: config.port,
    async fetch(request, bunServer): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json({ ok: true });
      }
      if (request.method === 'GET' && url.pathname === '/readyz') {
        try {
          driver.all('select 1');
          return json({ ok: true, workspaceId: config.workspaceId });
        } catch {
          return json(
            { ok: false, error: { code: 'not_ready', message: 'Database is unavailable.' } },
            503
          );
        }
      }

      if (url.pathname === '/sync/websocket') {
        const authenticated = await authenticateSyncSocket(request, {
          authenticator,
          workspaceId: config.workspaceId
        });
        if (!authenticated.ok) return authenticated.response;
        if (
          bunServer.upgrade(request, {
            data: { handshake: authenticated.handshake, attachment: null }
          })
        ) {
          return undefined;
        }
        return json(
          { ok: false, error: { code: 'upgrade_failed', message: 'WebSocket upgrade failed.' } },
          500
        );
      }
      if (url.pathname.startsWith('/sync/')) {
        return json(
          { ok: false, error: { code: 'not_found', message: 'Sync route not found.' } },
          404
        );
      }
      return new Response(
        config.mode === 'demo'
          ? 'Axle demo server (SQLite :memory:; data resets on restart)'
          : 'Axle production sync server',
        { status: url.pathname === '/' ? 200 : 404 }
      );
    },
    websocket: {
      open(socket) {
        sockets.accept(socketAdapter(socket), socket.data.handshake);
      },
      message(socket, message) {
        void sockets.message(socketAdapter(socket), message).catch((error) => {
          console.error('tracker WebSocket message failed', error);
          socket.close(1011, 'message_failed');
        });
      },
      close(socket) {
        sockets.close(socketAdapter(socket));
      }
    }
  });
} catch (error) {
  clearInterval(rolloverTimer);
  await live.close();
  throw error;
}

let shutdownPromise: Promise<void> | null = null;
const shutdown = (signal: string): Promise<void> => {
  shutdownPromise ??= (async () => {
    clearInterval(rolloverTimer);
    sockets.closeAll(1001, 'server_shutdown');
    try {
      await httpServer.stop(true);
    } finally {
      // SyncServer owns and closes the SQLite driver exactly once.
      await live.close();
    }
    console.log(`tracker server stopped (${signal})`);
  })();
  return shutdownPromise;
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error) => {
      console.error('tracker server shutdown failed', error);
      process.exitCode = 1;
    });
  });
}

const storage =
  config.databaseFilename === ':memory:'
    ? 'SQLite :memory: (resets on restart)'
    : `SQLite ${config.databaseFilename}`;
console.log(
  `tracker server on :${config.port} — ${config.mode} — ${storage} — workspace ${config.workspaceId}`
);
