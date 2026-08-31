/**
 * Bidirectional sync protocol over one WebSocket.
 *
 * This module owns request/reply correlation, authenticated connection state,
 * message limits, and hibernation restoration. The SyncServer owns database
 * and synchronization rules and does not import WebSocket APIs.
 */
import type { AuthPrincipal, Authenticator } from '../../auth/index';
import { validateAuthPrincipal } from '../../auth/index';
import { logger } from '../../core/logger';
import {
  SYNC_PROTOCOL_VERSION,
  type SyncSocketMessage,
  type SyncSocketRequest,
  type SyncSocketVersionMismatchReason
} from '../socket-protocol';
import type { MutateGroupRequest, MutateResult, Snapshot } from '../protocol';
import { validateRowSchemaFingerprint, type RowSchemaFingerprint } from '../row-schema';
import type { SyncConnection, SyncConnectionState, SyncServer } from './engine';
import { SyncServerError } from './errors';

const CLOSE_BAD_MESSAGE = 4400;
const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_SUPERSEDED = 4409;
const CLOSE_VERSION = 4410;
const CLOSE_TOO_LARGE = 1009;
const CLOUDFLARE_ATTACHMENT_LIMIT_BYTES = 16_384;
const DEFAULT_ATTACHMENT_LIMIT_BYTES = 15 * 1_024;

/** WebSocket operations used by the runtime-neutral session server. */
export interface SyncServerSocket {
  send(message: string): void;
  close(code?: number, reason?: string): void;
  getAttachment(): unknown;
  setAttachment(value: unknown): void;
}

/** Data established by the authenticated HTTP upgrade request. */
export interface SyncSocketHandshake {
  readonly ownerClientId: string;
  readonly principal: AuthPrincipal;
  readonly clientProtocol: number;
  readonly clientApplicationVersion: number;
  readonly clientRowSchemaFingerprint: string;
}

/** Operation and request identity attached to server-side error reports. */
export interface SyncSocketErrorContext {
  readonly operation: 'accept' | 'restore' | 'message' | 'close';
  readonly connectionId?: string;
  readonly requestId?: string;
}

/** Version policy, limits, engine, and observability for one WebSocket server. */
export interface SyncSocketServerOptions {
  readonly server: SyncServer;
  /** Monotonic application API version shipped by the current deployment. */
  readonly applicationVersion: number;
  /** Oldest client API version this deployment accepts. Defaults to applicationVersion. */
  readonly minimumClientVersion?: number;
  /** Applied Durable Object SQLite schema version, reported in hello frames. */
  readonly schemaVersion: number;
  /** Exact generated identity of cached row declarations. */
  readonly rowSchemaFingerprint: RowSchemaFingerprint | string;
  readonly maxMessageBytes?: number;
  /** Maximum JSON size kept in a hibernation attachment. Defaults below Cloudflare's 16 KiB limit. */
  readonly maxAttachmentBytes?: number;
  readonly messagesPerMinute?: number;
  readonly detailedErrors?: boolean;
  readonly now?: () => number;
  readonly issueConnectionId?: () => string;
  readonly onError?: (error: unknown, context: SyncSocketErrorContext) => void;
}

interface RateState {
  startedAt: number;
  count: number;
}

interface SyncSocketAttachment {
  readonly attachmentVersion: 2;
  readonly applicationVersion: number;
  readonly schemaVersion: number;
  readonly rowSchemaFingerprint: string;
  readonly ownerClientId: string;
  readonly connection: SyncConnectionState;
  readonly rate: RateState;
}

interface SessionRecord {
  readonly socket: SyncServerSocket;
  readonly ownerKey: string;
  readonly connection: SyncConnection;
  rate: RateState;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function principalKey(principal: AuthPrincipal): string {
  return JSON.stringify([principal.workspaceId, principal.sessionId, principal.actor]);
}

function ownerKey(principal: AuthPrincipal, ownerClientId: string): string {
  return JSON.stringify([principalKey(principal), ownerClientId]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRequest(raw: string): SyncSocketRequest {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new TypeError('Sync message must be a JSON object.');
  if (value.protocol !== SYNC_PROTOCOL_VERSION) {
    throw new TypeError(`Sync message protocol must be ${SYNC_PROTOCOL_VERSION}.`);
  }
  if (typeof value.requestId !== 'string' || value.requestId === '' || value.requestId.length > 128) {
    throw new TypeError('Sync message requestId must be a non-empty string of 128 characters or fewer.');
  }
  if (value.type === 'subscribe') {
    if (typeof value.query !== 'string' || value.query === '') {
      throw new TypeError('Sync subscribe query must be a non-empty string.');
    }
  } else if (value.type === 'unsubscribe') {
    if (typeof value.subscriptionId !== 'string' || value.subscriptionId === '') {
      throw new TypeError('Sync unsubscribe subscriptionId must be a non-empty string.');
    }
  } else if (value.type === 'presence') {
    if (value.state !== null && !isRecord(value.state)) {
      throw new TypeError('Sync presence state must be an object or null.');
    }
  } else if (value.type === 'mutateGroup') {
    const command = value.command;
    if (
      !isRecord(command) ||
      typeof command.mutationId !== 'string' ||
      !Array.isArray(command.calls) ||
      !command.calls.every(
        (call) =>
          isRecord(call) &&
          typeof call.name === 'string' &&
          Array.isArray(call.ids) &&
          call.ids.every((id) => typeof id === 'string')
      )
    ) {
      throw new TypeError('Sync mutateGroup message is invalid.');
    }
  } else {
    throw new TypeError('Sync message type is unknown.');
  }
  return value as unknown as SyncSocketRequest;
}

function parseAttachment(value: unknown): SyncSocketAttachment {
  if (!isRecord(value) || value.attachmentVersion !== 2) {
    throw new TypeError('WebSocket attachment has an unsupported format.');
  }
  if (
    !Number.isSafeInteger(value.applicationVersion) ||
    !Number.isSafeInteger(value.schemaVersion) ||
    typeof value.rowSchemaFingerprint !== 'string' ||
    typeof value.ownerClientId !== 'string' ||
    value.ownerClientId === '' ||
    !isRecord(value.connection) ||
    !isRecord(value.rate)
  ) {
    throw new TypeError('WebSocket attachment is missing connection identity.');
  }
  const connection = value.connection;
  if (
    typeof connection.clientId !== 'string' ||
    connection.clientId === '' ||
    !isRecord(connection.principal) ||
    !Array.isArray(connection.subscriptions) ||
    (connection.presence !== null && !isRecord(connection.presence))
  ) {
    throw new TypeError('WebSocket attachment has invalid connection state.');
  }
  validateAuthPrincipal(connection.principal);
  for (const subscription of connection.subscriptions) {
    if (
      !isRecord(subscription) ||
      typeof subscription.id !== 'string' ||
      subscription.id === '' ||
      typeof subscription.query !== 'string' ||
      subscription.query === ''
    ) {
      throw new TypeError('WebSocket attachment has an invalid subscription.');
    }
  }
  if (
    typeof value.rate.startedAt !== 'number' ||
    typeof value.rate.count !== 'number' ||
    !Number.isSafeInteger(value.rate.count) ||
    value.rate.count < 0
  ) {
    throw new TypeError('WebSocket attachment has invalid rate state.');
  }
  return value as unknown as SyncSocketAttachment;
}

function encode(message: SyncSocketMessage): string {
  return JSON.stringify(message);
}

/** One SyncServer exposed as authenticated request/reply operations on WebSockets. */
export class SyncSocketServer {
  private readonly applicationVersion: number;
  private readonly minimumClientVersion: number;
  private readonly schemaVersion: number;
  private readonly rowSchemaFingerprint: RowSchemaFingerprint;
  private readonly maxMessageBytes: number;
  private readonly maxAttachmentBytes: number;
  private readonly messagesPerMinute: number;
  private readonly now: () => number;
  private readonly issueConnectionId: () => string;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly owners = new Map<string, string>();

  constructor(private readonly options: SyncSocketServerOptions) {
    this.applicationVersion = positiveInteger(options.applicationVersion, 'applicationVersion');
    this.minimumClientVersion = positiveInteger(
      options.minimumClientVersion ?? options.applicationVersion,
      'minimumClientVersion'
    );
    if (this.minimumClientVersion > this.applicationVersion) {
      throw new TypeError('minimumClientVersion must not exceed applicationVersion.');
    }
    this.schemaVersion = positiveInteger(options.schemaVersion, 'schemaVersion');
    this.rowSchemaFingerprint = validateRowSchemaFingerprint(options.rowSchemaFingerprint);
    this.maxMessageBytes = positiveInteger(options.maxMessageBytes ?? 256 * 1024, 'maxMessageBytes');
    this.maxAttachmentBytes = positiveInteger(
      options.maxAttachmentBytes ?? DEFAULT_ATTACHMENT_LIMIT_BYTES,
      'maxAttachmentBytes'
    );
    if (this.maxAttachmentBytes > CLOUDFLARE_ATTACHMENT_LIMIT_BYTES) {
      throw new TypeError(
        `maxAttachmentBytes must not exceed Cloudflare's ${CLOUDFLARE_ATTACHMENT_LIMIT_BYTES}-byte limit.`
      );
    }
    this.messagesPerMinute = positiveInteger(
      options.messagesPerMinute ?? 1_200,
      'messagesPerMinute'
    );
    this.now = options.now ?? Date.now;
    this.issueConnectionId = options.issueConnectionId ?? (() => `conn_${crypto.randomUUID()}`);
  }

  private report(error: unknown, context: SyncSocketErrorContext): void {
    if (this.options.onError) {
      this.options.onError(error, context);
      return;
    }
    logger.error('wheel: sync WebSocket error', context, error);
  }

  private send(socket: SyncServerSocket, message: SyncSocketMessage): void {
    socket.send(encode(message));
  }

  private mismatch(
    socket: SyncServerSocket,
    handshake: SyncSocketHandshake,
    reason: SyncSocketVersionMismatchReason
  ): void {
    this.send(socket, {
      protocol: SYNC_PROTOCOL_VERSION,
      type: 'version_mismatch',
      reason,
      clientProtocol: handshake.clientProtocol,
      serverProtocol: SYNC_PROTOCOL_VERSION,
      clientApplicationVersion: handshake.clientApplicationVersion,
      serverApplicationVersion: this.applicationVersion,
      minimumClientVersion: this.minimumClientVersion,
      clientRowSchemaFingerprint: handshake.clientRowSchemaFingerprint,
      serverRowSchemaFingerprint: this.rowSchemaFingerprint
    });
    socket.close(CLOSE_VERSION, reason);
  }

  private versionMismatch(handshake: SyncSocketHandshake): SyncSocketVersionMismatchReason | null {
    if (handshake.clientProtocol !== SYNC_PROTOCOL_VERSION) return 'protocol_mismatch';
    if (handshake.clientApplicationVersion > this.applicationVersion) return 'server_updating';
    if (handshake.clientApplicationVersion < this.minimumClientVersion) return 'client_outdated';
    if (handshake.clientRowSchemaFingerprint !== this.rowSchemaFingerprint) {
      return 'row_schema_mismatch';
    }
    return null;
  }

  private attachment(record: SessionRecord, ownerClientId: string): SyncSocketAttachment {
    return {
      attachmentVersion: 2,
      applicationVersion: this.applicationVersion,
      schemaVersion: this.schemaVersion,
      rowSchemaFingerprint: this.rowSchemaFingerprint,
      ownerClientId,
      connection: record.connection.state(),
      rate: record.rate
    };
  }

  private persist(record: SessionRecord, ownerClientId: string): void {
    const attachment = this.attachment(record, ownerClientId);
    const size = new TextEncoder().encode(JSON.stringify(attachment)).byteLength;
    if (size > this.maxAttachmentBytes) {
      throw new SyncServerError(
        'hibernation_state_too_large',
        `Connection hibernation state is ${size} bytes; the configured limit is ${this.maxAttachmentBytes} bytes.`
      );
    }
    record.socket.setAttachment(attachment);
  }

  private wire(
    socket: SyncServerSocket,
    connection: SyncConnection,
    ownerClientId: string,
    rate: RateState
  ): SessionRecord {
    const key = ownerKey(connection.principal, ownerClientId);
    const record: SessionRecord = { socket, ownerKey: key, connection, rate };
    connection.onEvent((event) => {
      try {
        this.send(socket, { protocol: SYNC_PROTOCOL_VERSION, type: 'event', event });
      } catch (error) {
        this.report(error, { operation: 'message', connectionId: connection.clientId });
      }
    });
    this.sessions.set(connection.clientId, record);
    this.owners.set(key, connection.clientId);
    return record;
  }

  /** Accept one newly upgraded and authenticated socket. */
  accept(socket: SyncServerSocket, handshake: SyncSocketHandshake): void {
    let connectionId: string | undefined;
    try {
      const mismatch = this.versionMismatch(handshake);
      if (mismatch) {
        this.mismatch(socket, handshake, mismatch);
        return;
      }
      const key = ownerKey(handshake.principal, handshake.ownerClientId);
      const previousId = this.owners.get(key);
      if (previousId) {
        const previous = this.sessions.get(previousId);
        if (previous) {
          this.drop(previousId);
          previous.socket.close(CLOSE_SUPERSEDED, 'superseded');
        }
      }
      connectionId = this.issueConnectionId();
      const connection = this.options.server.connect(connectionId, handshake.principal);
      const record = this.wire(socket, connection, handshake.ownerClientId, {
        startedAt: this.now(),
        count: 0
      });
      this.persist(record, handshake.ownerClientId);
      this.send(socket, {
        protocol: SYNC_PROTOCOL_VERSION,
        type: 'hello',
        connectionId,
        applicationVersion: this.applicationVersion,
        schemaVersion: this.schemaVersion,
        rowSchemaFingerprint: this.rowSchemaFingerprint
      });
    } catch (error) {
      this.report(error, { operation: 'accept' });
      if (connectionId) this.drop(connectionId);
      if (error instanceof SyncServerError && error.code === 'hibernation_state_too_large') {
        socket.close(CLOSE_TOO_LARGE, error.code);
        return;
      }
      socket.close(CLOSE_UNAUTHENTICATED, 'connection_failed');
    }
  }

  /** Restore sockets that stayed connected while their Durable Object hibernated. */
  async restore(sockets: readonly SyncServerSocket[]): Promise<void> {
    for (const socket of sockets) {
      try {
        const attachment = parseAttachment(socket.getAttachment());
        if (
          attachment.applicationVersion !== this.applicationVersion ||
          attachment.schemaVersion !== this.schemaVersion ||
          attachment.rowSchemaFingerprint !== this.rowSchemaFingerprint
        ) {
          socket.close(1012, 'deployment_changed');
          continue;
        }
        const connection = await this.options.server.restoreConnection(attachment.connection);
        this.wire(socket, connection, attachment.ownerClientId, attachment.rate);
      } catch (error) {
        this.report(error, { operation: 'restore' });
        socket.close(1012, 'restore_failed');
      }
    }
  }

  private rateLimit(record: SessionRecord): boolean {
    const current = this.now();
    if (current - record.rate.startedAt >= 60_000) {
      record.rate = { startedAt: current, count: 0 };
    }
    record.rate.count += 1;
    return record.rate.count <= this.messagesPerMinute;
  }

  /** Handle one text or binary JSON message. */
  async message(
    socket: SyncServerSocket,
    message: string | ArrayBuffer | ArrayBufferView
  ): Promise<void> {
    let requestId: string | undefined;
    let connectionId: string | undefined;
    try {
      const attachment = parseAttachment(socket.getAttachment());
      connectionId = attachment.connection.clientId;
      const record = this.sessions.get(connectionId);
      if (!record) throw new SyncServerError('connection_required', 'The sync connection is not active.');
      const bytes =
        typeof message === 'string'
          ? null
          : message instanceof ArrayBuffer
            ? new Uint8Array(message)
            : new Uint8Array(message.buffer, message.byteOffset, message.byteLength);
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(bytes!);
      if (new TextEncoder().encode(raw).byteLength > this.maxMessageBytes) {
        socket.close(CLOSE_TOO_LARGE, 'message_too_large');
        return;
      }
      if (!this.rateLimit(record)) {
        socket.close(CLOSE_BAD_MESSAGE, 'rate_limited');
        return;
      }
      // Persist the rate counter before parsing or running the operation. A
      // hibernation after an error cannot reset the connection's rate state.
      this.persist(record, attachment.ownerClientId);
      const request = parseRequest(raw);
      requestId = request.requestId;
      let value: Snapshot | MutateResult | Record<string, never>;
      if (request.type === 'subscribe') {
        value = await record.connection.subscribe(request.query, request.params);
      } else if (request.type === 'unsubscribe') {
        record.connection.unsubscribe(request.subscriptionId);
        value = {};
      } else if (request.type === 'presence') {
        this.options.server.setPresence(record.connection.clientId, request.state);
        value = {};
      } else {
        const command: MutateGroupRequest = {
          ...request.command,
          clientId: record.connection.clientId
        };
        value = await this.options.server.mutateGroup(command, record.connection.principal);
      }
      this.persist(record, attachment.ownerClientId);
      this.send(socket, {
        protocol: SYNC_PROTOCOL_VERSION,
        type: 'response',
        requestId: request.requestId,
        ok: true,
        value
      });
    } catch (error) {
      this.report(error, { operation: 'message', connectionId, requestId });
      if (error instanceof SyncServerError && error.code === 'hibernation_state_too_large') {
        if (connectionId) this.drop(connectionId);
        socket.close(CLOSE_TOO_LARGE, error.code);
        return;
      }
      if (!requestId) {
        socket.close(CLOSE_BAD_MESSAGE, 'invalid_message');
        return;
      }
      const retryable =
        !(error instanceof SyncServerError) ||
        ['engine_recovering', 'server_closed', 'backend_closed'].includes(error.code);
      this.send(socket, {
        protocol: SYNC_PROTOCOL_VERSION,
        type: 'response',
        requestId,
        ok: false,
        error: {
          code: error instanceof SyncServerError ? error.code : 'internal_error',
          message:
            this.options.detailedErrors && error instanceof Error
              ? error.message
              : retryable
                ? 'The sync service is recovering. Retry shortly.'
                : 'The sync operation was rejected.',
          retryable
        }
      });
    }
  }

  private drop(connectionId: string): void {
    const record = this.sessions.get(connectionId);
    if (!record) return;
    record.connection.close();
    this.sessions.delete(connectionId);
    if (this.owners.get(record.ownerKey) === connectionId) this.owners.delete(record.ownerKey);
  }

  /** Release engine state after the runtime reports a real socket close. */
  close(socket: SyncServerSocket): void {
    try {
      const value = socket.getAttachment();
      if (value === null || value === undefined) return;
      const attachment = parseAttachment(value);
      this.drop(attachment.connection.clientId);
    } catch (error) {
      this.report(error, { operation: 'close' });
    }
  }

  /** Close every live socket before a local server restart or process shutdown. */
  closeAll(code = 1012, reason = 'server_restarting'): void {
    for (const [connectionId, record] of [...this.sessions]) {
      this.drop(connectionId);
      record.socket.close(code, reason);
    }
  }
}

/** Trust policy used before a runtime accepts a WebSocket upgrade. */
export interface AuthenticateSyncSocketOptions {
  readonly authenticator: Authenticator;
  readonly workspaceId: string;
  readonly allowedOrigins?: readonly string[];
}

/** Authenticated handshake data or the HTTP response that refuses the upgrade. */
export type AuthenticateSyncSocketResult =
  | { readonly ok: true; readonly handshake: SyncSocketHandshake }
  | { readonly ok: false; readonly response: Response };

function jsonError(status: number, code: string, message: string): AuthenticateSyncSocketResult {
  return {
    ok: false,
    response: new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status,
      headers: { 'content-type': 'application/json' }
    })
  };
}

/** Authenticate and validate the HTTP request before its WebSocket upgrade. */
export async function authenticateSyncSocket(
  request: Request,
  options: AuthenticateSyncSocketOptions
): Promise<AuthenticateSyncSocketResult> {
  if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return jsonError(426, 'websocket_required', 'Use a WebSocket upgrade request.');
  }
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowedOrigins = options.allowedOrigins ?? [url.origin];
  if (origin && !allowedOrigins.includes(origin)) {
    return jsonError(403, 'origin_forbidden', 'This WebSocket origin is not allowed.');
  }
  const authenticated = await options.authenticator.authenticate(request);
  if (authenticated === null) {
    return jsonError(401, 'unauthenticated', 'Authentication is required.');
  }
  const principal = validateAuthPrincipal(authenticated);
  if (principal.workspaceId !== options.workspaceId) {
    return jsonError(403, 'workspace_forbidden', 'This workspace is not available.');
  }
  const ownerClientId = url.searchParams.get('client') ?? '';
  if (ownerClientId === '' || ownerClientId.length > 256) {
    return jsonError(400, 'invalid_client', 'client must contain 1 to 256 characters.');
  }
  const clientProtocol = Number(url.searchParams.get('protocol'));
  const clientApplicationVersion = Number(url.searchParams.get('version'));
  if (!Number.isSafeInteger(clientProtocol) || !Number.isSafeInteger(clientApplicationVersion)) {
    return jsonError(400, 'invalid_version', 'protocol and version must be integers.');
  }
  const clientRowSchemaFingerprint = url.searchParams.get('rowSchemaFingerprint') ?? '';
  if (clientRowSchemaFingerprint.length > 128) {
    return jsonError(
      400,
      'invalid_row_schema_fingerprint',
      'rowSchemaFingerprint must contain 128 characters or fewer.'
    );
  }
  return {
    ok: true,
    handshake: {
      ownerClientId,
      principal,
      clientProtocol,
      clientApplicationVersion,
      clientRowSchemaFingerprint
    }
  };
}
