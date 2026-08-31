import type { MutateGroupRequest, MutateResult, ServerEvent, Snapshot } from './protocol';

/** The JSON WebSocket protocol. Increment only when one deployment cannot read the other deployment's frames. */
export const SYNC_PROTOCOL_VERSION = 3 as const;

interface RequestBase {
  readonly protocol: typeof SYNC_PROTOCOL_VERSION;
  readonly requestId: string;
}

/** Messages accepted from one sync client. */
export type SyncSocketRequest =
  | (RequestBase & {
      readonly type: 'subscribe';
      readonly query: string;
      readonly params: unknown;
    })
  | (RequestBase & {
      readonly type: 'unsubscribe';
      readonly subscriptionId: string;
    })
  | (RequestBase & {
      readonly type: 'mutateGroup';
      readonly command: MutateGroupRequest;
    })
  | (RequestBase & {
      readonly type: 'presence';
      readonly state: Record<string, unknown> | null;
    });

/** Stable server error returned for one request without closing a healthy socket. */
export interface SyncSocketError {
  readonly code: string;
  readonly message: string;
  /** True only when sending the same operation after reconnect can succeed. */
  readonly retryable: boolean;
}

/** Reason the server refused a WebSocket during a rolling deployment. */
export type SyncSocketVersionMismatchReason =
  | 'client_outdated'
  | 'server_updating'
  | 'protocol_mismatch'
  | 'row_schema_mismatch';

/** Messages emitted by the sync server. */
export type SyncSocketMessage =
  | {
      readonly protocol: typeof SYNC_PROTOCOL_VERSION;
      readonly type: 'hello';
      readonly connectionId: string;
      readonly applicationVersion: number;
      readonly schemaVersion: number;
      readonly rowSchemaFingerprint: string;
    }
  | {
      readonly protocol: typeof SYNC_PROTOCOL_VERSION;
      readonly type: 'version_mismatch';
      readonly reason: SyncSocketVersionMismatchReason;
      readonly clientProtocol: number;
      readonly serverProtocol: number;
      readonly clientApplicationVersion: number;
      readonly serverApplicationVersion: number;
      readonly minimumClientVersion: number;
      readonly clientRowSchemaFingerprint: string;
      readonly serverRowSchemaFingerprint: string;
    }
  | {
      readonly protocol: typeof SYNC_PROTOCOL_VERSION;
      readonly type: 'response';
      readonly requestId: string;
      readonly ok: true;
      readonly value: Snapshot | MutateResult | Record<string, never>;
    }
  | {
      readonly protocol: typeof SYNC_PROTOCOL_VERSION;
      readonly type: 'response';
      readonly requestId: string;
      readonly ok: false;
      readonly error: SyncSocketError;
    }
  | {
      readonly protocol: typeof SYNC_PROTOCOL_VERSION;
      readonly type: 'event';
      readonly event: ServerEvent;
    };
