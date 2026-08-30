/**
 * wheel/sync/server — the node-side sync engine and backends.
 *
 * The writer loop, WebSocket handler, SQLite backend, and registry the engine
 * builds from declarations. Depends on `sync` + `core`.
 */
export {
  serveQuery,
  serveMutation,
  type ServeQueryBinding,
  type ServeMutationBinding,
  type ServerTx,
  type ServerMutationCtx,
  type MutationHandler,
  type QuerySource
} from './serve';
export { SqlQueryHandler, type QueryHandler, type QueryHandlerCtx, type QueryReader } from './query-handler';
// Dialect compilation lives on the SERVER layer, next to the backends that own
// a database. App code builds fragments and never compiles them.
export { compileSql, type CompiledSql } from '../sql';
export type {
  SyncBackend,
  BackendMutateResult,
  ExternalChangeRecord,
  SyncBackendInitOptions
} from './sync-backend';
export {
  SqliteSyncBackend,
  createSqliteSyncBackend,
  type SqliteSyncBackendOptions
} from './backends/sqlite-backend';
export {
  bunSqliteDriver,
  betterSqlite3Driver,
  coerceRows,
  coerceParams,
  coerceValue,
  type SqliteDriver,
  type SqliteRow
} from './backends/sqlite-driver';
export {
  SyncServer,
  SyncServerError,
  type SyncConnection,
  type SyncConnectionState,
  type SyncSubscriptionState,
  type MutateRequest,
  type MutateResult,
  type MutationError,
  type QueryStatusEvent,
  type RowDelta,
  type ServerEvent,
  type Snapshot,
  type SyncQueryError,
  type SyncQueryStatus,
  type SubscriptionDebugInfo
} from './engine';
export {
  SyncSocketServer,
  authenticateSyncSocket,
  type AuthenticateSyncSocketOptions,
  type AuthenticateSyncSocketResult,
  type SyncServerSocket,
  type SyncSocketErrorContext,
  type SyncSocketHandshake,
  type SyncSocketServerOptions
} from './socket';
export {
  createSyncServer,
  type SyncServerOptions,
  type SqliteServerOptions
} from './node-engine';
export type { DbRow } from '../protocol';
export {
  collectDeclarations,
  buildRegistry,
  RegistryError,
  type SyncDeclarations,
  type Registry,
  type ServerBindingLike
} from './registry';
export {
  WHEEL_SCHEMA_SPEC_VERSION,
  createSchemaSpec,
  stringifySchemaSpec,
  type SchemaSpecKey,
  type SchemaSpecMutation,
  type SchemaSpecPresence,
  type SchemaSpecQuery,
  type SchemaSpecTable,
  type WheelSchemaSpec
} from './schema-spec';
