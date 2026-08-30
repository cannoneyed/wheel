/**
 * `wheel/sync/server/cloudflare` — runtime-neutral sync engine and the Durable
 * Object SQLite backend. This entry contains no Node or Bun imports.
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
export type {
  SyncBackend,
  BackendMutateResult,
  BackendMutationCall,
  ExternalChangeRecord,
  SyncBackendInitOptions
} from './sync-backend';
export {
  CloudflareSyncBackend,
  createCloudflareSyncBackend,
  runDurableObjectSql,
  type CloudflareSyncBackendOptions,
  type DurableObjectSqlCursor,
  type DurableObjectSqlRow,
  type DurableObjectSqlStorageLike,
  type DurableObjectStorageLike
} from './backends/cloudflare-backend';
export { toSqlitePlaceholders } from './backends/sqlite-placeholders';
export {
  applyDurableObjectMigrations,
  type DurableObjectMigration,
  type DurableObjectMigrationOptions,
  type DurableObjectMigrationResult
} from './cloudflare-migrations';
export {
  createSyncServer,
  SyncServer,
  SyncServerError,
  type SyncConnection,
  type SyncConnectionState,
  type SyncSubscriptionState,
  type SyncServerOptions,
  type MutateGroupRequest,
  type MutateCallRequest,
  type MutateResult,
  type MutationError,
  type RowDelta,
  type ServerEvent,
  type Snapshot,
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
