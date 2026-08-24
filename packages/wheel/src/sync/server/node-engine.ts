/**
 * Node and Bun backend selection for the standard `wheel/sync/server` entry.
 * The live engine stays runtime-neutral in `engine.ts`; this module is the only
 * place that chooses the built-in SQLite constructor.
 */
import { systemClock } from '../../core/runtime-defaults';
import {
  createSyncServer as createRuntimeSyncServer,
  type SyncServer,
  type SyncServerOptions as RuntimeSyncServerOptions
} from './engine';
import { SyncServerError } from './errors';
import { createSqliteSyncBackend } from './backends/sqlite-backend';
import type { SqliteDriver } from './backends/sqlite-driver';
import type { SyncBackend } from './sync-backend';

/** Built-in SQLite backend selection for Node and Bun callers. */
export interface SqliteServerOptions {
  /** Shared driver when setup DDL and the engine must use one connection. */
  driver?: SqliteDriver;
  /** Database file when no driver is injected. Defaults to `:memory:`. */
  filename?: string;
  /** Stable identity for wrappers that share one underlying database. */
  databaseId?: string;
}

/** Standard server options with one Node/Bun backend source. */
export interface SyncServerOptions extends Omit<RuntimeSyncServerOptions, 'backend'> {
  /** An already-built backend. Provide this or `sqlite`. */
  backend?: SyncBackend;
  /** The built-in SQLite backend. Provide this or `backend`. */
  sqlite?: SqliteServerOptions;
}

function resolveBackend(options: SyncServerOptions): SyncBackend {
  const sources = [
    options.backend ? 'backend' : null,
    options.sqlite ? 'sqlite' : null
  ].filter((source): source is string => source !== null);
  if (sources.length !== 1) {
    const received = sources.length === 0 ? 'none' : sources.join(', ');
    throw new SyncServerError(
      'invalid_backend_config',
      `createSyncServer requires exactly one backend source: \`sqlite\` or \`backend\`. Received: ${received}.`
    );
  }
  if (options.backend) return options.backend;
  if (options.sqlite) {
    return createSqliteSyncBackend({
      driver: options.sqlite.driver,
      filename: options.sqlite.filename,
      databaseId: options.sqlite.databaseId,
      clock: options.clock ?? systemClock
    });
  }
  throw new SyncServerError('invalid_backend_config', 'SQLite backend configuration is missing.');
}

/** Build the selected Node/Bun backend, then boot the runtime-neutral engine. */
export async function createSyncServer(options: SyncServerOptions): Promise<SyncServer> {
  const { backend: _backend, sqlite: _sqlite, ...runtime } = options;
  return createRuntimeSyncServer({ ...runtime, backend: resolveBackend(options) });
}
