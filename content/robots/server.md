# Server

Human page: [Server](../docs/server.mdx). API: [`wheel/sync/server`](api/sync-server.md).

## Create one server

`createSyncServer()` accepts one backend source:

- `sqlite`: create or inject `SqliteSyncBackend`.
- `backend`: inject any `SyncBackend`.

It also receives shared sync modules, matching server modules, an optional clock, and engine options. The server owns and closes the selected backend.

## SQLite

- `bunSqliteDriver(filename)` is the local and self-hosted Bun driver.
- `betterSqlite3Driver(filename)` supports Node and Vitest.
- `createSqliteSyncBackend()` wraps a driver.
- `databaseId` identifies separate wrappers that point at one database for the writer lease.
- `:memory:` databases need one shared driver when setup and engine must see the same connection.

Do not combine `filename` and `driver`. Do not close an injected driver after `SyncServer.close()`; the server owns it.

Install `better-sqlite3` before you use `betterSqlite3Driver` or `wheel/testing` under Node:

```sh
bun add --dev better-sqlite3
```

## Other backends

The shipped implementations are SQLite only: `SqliteSyncBackend` for Bun, Node,
and Vitest, and `CloudflareSyncBackend` for a Durable Object's own SQLite. There
is no Postgres adapter in this release. `SyncBackend` remains the seam for one.

## SQL ownership

`sql` tagged fragments contain text parts and values, not placeholder syntax. `compileSql(fragment, dialect)` emits the dialect's placeholders — `?` for SQLite.

Raw SQL strings pass through unchanged. Use raw text for DDL and dialect-owned statements. Use fragments for parameterized handlers.

## Backend contract

`SyncBackend` owns:

- initialization and writer lease;
- read sessions;
- atomic mutation plus sync-log commit;
- mutation-id deduplication;
- external-change notification;
- transient error classification;
- shutdown.

Run the backend conformance suite for a new implementation.

## WebSocket sessions

`authenticateSyncSocket()` authenticates the `/sync/websocket` upgrade and creates a trusted handshake. `SyncSocketServer` accepts the runtime socket and handles subscribe, unsubscribe, mutate, presence, replies, and server events.

Use `maxMessageBytes` and `messagesPerMinute` for per-connection limits. Keep `detailedErrors` off in production.

For Cloudflare, import `wheel/sync/server/cloudflare`. Build `createCloudflareSyncBackend()` from Durable Object storage, accept through `ctx.acceptWebSocket()`, and restore socket attachments after hibernation. For local or self-hosted Bun, adapt `Bun.serve` WebSockets to `SyncServerSocket`.

## External writes

`server.externalWrite()` records one sequence and re-runs affected query handlers after application code writes the database directly. A continuous backend feed uses `onExternalChange` instead.

## Lifecycle

One writer owns a database identity. A second live server fails. Await `server.close()` exactly once during process shutdown.

Primary sources:

- [`engine.ts`](../../packages/wheel/src/sync/server/engine.ts)
- [`sync-backend.ts`](../../packages/wheel/src/sync/server/sync-backend.ts)
- [`sqlite-backend.ts`](../../packages/wheel/src/sync/server/backends/sqlite-backend.ts)
- [`cloudflare-backend.ts`](../../packages/wheel/src/sync/server/backends/cloudflare-backend.ts)
- [`socket.ts`](../../packages/wheel/src/sync/server/socket.ts)
