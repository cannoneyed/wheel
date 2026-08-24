/**
 * Server-side error type, extracted so the engine and backends can name it
 * without importing each other. A backend can raise errors from
 * `acquireWriterLease`, and the engine classifies them. One shared module
 * keeps the identity stable across the seam — `instanceof SyncServerError`
 * holds no matter which layer threw.
 */

/** Typed server-side failures with stable codes for WebSocket replies and logs. */
export class SyncServerError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}
