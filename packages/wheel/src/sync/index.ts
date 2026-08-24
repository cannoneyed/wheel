/**
 * wheel/sync — the local-first sync surface (browser-safe).
 *
 * Declarations (table/query/mutation/presence), the wire protocol, the sync
 * client + transports + local cache, and `SyncService`/`liveQuery`. Depends on
 * `core` and nothing else — never on `sync/server` (the node engine).
 */
export {
  table,
  query,
  mutation,
  patchMutation,
  presence,
  rejection,
  RejectionError,
  orphan,
  OrphanedError,
  type PresenceDecl,
  type TableDecl,
  type QueryDecl,
  type MutationDecl,
  type OptimisticCache,
  type MutationCtx,
  type CacheReader,
  type InverseSpec,
  type QueryProjection,
  type MutationRejection
} from './declarations';
export {
  t,
  validateJsonValue,
  validateRow,
  JsonValueError,
  RowValidationError,
  type Infer,
  type RowSchema,
  type RowValidationIssue
} from './schema';
export { sql, isSqlFragment, type SqlFragment } from './sql';
export {
  createIdGen,
  seededRandomBytes,
  fixedClock,
  isValidId,
  type Clock,
  type IdGen,
  type RandomBytes
} from './ids';
export { positionBetween } from './ordering';
export { systemClock, systemDefer, systemRandomBytes, type Defer } from '../core/runtime-defaults';
export type {
  RowDelta,
  ServerEvent,
  MutateRequest,
  MutationError,
  MutateResult,
  Snapshot,
  DbRow
} from './protocol';
export {
  SYNC_PROTOCOL_VERSION,
  type SyncSocketError,
  type SyncSocketMessage,
  type SyncSocketRequest,
  type SyncSocketVersionMismatchReason
} from './socket-protocol';
export {
  SyncClient,
  type ExplainResult,
  type PeersResult,
  type PeerPresenceFailure,
  type SyncClientOptions,
  type MutationHandle,
  type MutationInfo,
  type MutationState,
  type QueryHandle
} from './client/client';
export type { ClientIdentity, SyncConnectionStatus, SyncTransport } from './client/transport';
export {
  createWebSocketTransport,
  type SyncClientSocket,
  type SyncVersionMismatch,
  type WebSocketTransportOptions
} from './client/websocket-transport';
export { ProvenanceLog, type ProvenanceEntry, type WriteCause } from './client/provenance';
export {
  MemoryCache,
  IndexedDbCache,
  type CacheScopes,
  type LocalCache,
  type PersistedOutboxEntry,
  type PersistedSubscription
} from './client/local-cache';
export { SyncService, type LiveQueryFor, type LiveQueryView, type QueryStatus } from './sync-service';
