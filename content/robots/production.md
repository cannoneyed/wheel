# Production

Human page: [Production](../docs/production.mdx). API: [`wheel/vite`](api/vite.md), [`wheel/debug`](api/debug.md), [`wheel/sync/server`](api/sync-server.md).

## Artifacts

- Browser: `vite build` output served by a static host or CDN.
- Sync: long-running server process with one workspace and backend.

The browser uses `/sync/*` on its current origin unless the application transport changes that behavior.

## Server process requirements

1. Apply migrations before accepting sync requests.
2. Expose liveness and database readiness endpoints.
3. Limit request body size and request rate.
4. Disable detailed sync errors and debug routes.
5. Validate environment and reject demo defaults in production mode.
6. Handle `SIGTERM` and `SIGINT` with one memoized shutdown promise.
7. Await HTTP stop and `SyncServer.close()`.

## Authentication

Production mode needs a real session verifier, explicit workspace id, and persistent database configuration. Header-trusting demo authentication is not a production mode.

## Base path

Set Vite `base`, install `basedHistoryOverride(base)`, and configure the host to return `index.html` for every application path under the base.

## In-browser mode

The demos can run the real engine in a SharedWorker over WASM SQLite and a message transport. The database and client cache are memory-only. This mode is for demos and single-visitor tools, not shared durable data.

## Logging and errors

- Application code calls `logger` from `wheel/core`.
- `setLoggerSink()` routes logger entries.
- `startErrorCapture()` installs uncaught error, rejection, and logger capture.
- Installing a new logger sink after capture replaces capture's sink.
- Subscribe to the shared capture buffer when one pipeline must include all error sources.

## Development plugin

`wheelDevTools()` enables development mode during serve, preserves service class names, verifies direct `file:` dependencies, and serves rich snapshot endpoints. It does not enable debug mode during production build.

Reference process: [`packages/tracker/server.ts`](../../packages/tracker/server.ts).
