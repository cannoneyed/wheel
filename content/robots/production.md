# Production

Human page: [Production](../docs/production.mdx). API: [`wheel/vite`](api/vite.md), [`wheel/debug`](api/debug.md), [`wheel/sync/server`](api/sync-server.md).

## Production topology

- Browser: `vite build` output served by a static host or CDN.
- Router: a Cloudflare Worker authenticates `/sync/websocket` and selects a workspace.
- State: one Durable Object owns each workspace, SQLite database, sync engine, and socket set.

The browser opens one WebSocket at `/sync/websocket`. The asset host and sync Worker can be separate origins when the client uses the correct base URL and credential flow.

## Durable Object requirements

1. Run `applyDurableObjectMigrations()` inside `blockConcurrencyWhile()` before engine boot.
2. Build `createCloudflareSyncBackend()` from Durable Object storage.
3. Accept sockets with `ctx.acceptWebSocket()` and restore attachments after hibernation.
4. Expose object-backed database readiness.
5. Limit message bytes and messages per minute on `SyncSocketServer`.
6. Disable detailed sync errors.
7. Share application and minimum-client versions with the browser.

Cloudflare bindings declare the Durable Object namespace. Store verifier keys and service credentials as Worker secrets. Do not expose them through Vite or `wheel/config`.

## Self-hosted Bun

`packages/tracker/server.ts` is the local and self-hosted alternative. A production Bun process needs persistent SQLite, verified sessions, liveness and readiness, socket limits, sanitized errors, and memoized signal shutdown. Await the Bun server stop and `SyncServer.close()`.

## Authentication

Production needs verified identity and trusted workspace routing. Native browser sockets use same-origin cookies or short-lived tickets. Query- or header-trusting demo authentication is not production authentication.

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

References: [`cloudflare/tracker-worker.ts`](../../cloudflare/tracker-worker.ts), [`packages/tracker/server.ts`](../../packages/tracker/server.ts).
