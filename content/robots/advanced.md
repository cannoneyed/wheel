# Swappable parts

Human page: [Swappable Parts](../docs/advanced.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md), [`wheel/kit`](api/kit.md).

## Transport

`SyncTransport` has six operations: connect, subscribe, unsubscribe, mutate, set presence, and close. It carries plain protocol values. The HTTP transport and in-process demo transport implement the same contract.

Wrap a transport to add latency, tracing, or fault injection. Preserve event order across delayed deliveries.

## Local cache

`LocalCache` persists query snapshots, outbox entries, and subscription state. `IndexedDbCache` is the browser implementation. `MemoryCache` is ephemeral.

Cache scope identifies one durable local store. It is separate from the wire client id.

## Backend

`SyncBackend` replaces database-specific storage, writer leasing, exactly-once mutation commits, reads, transient-error classification, and close.

Use `createSqliteSyncBackend()` and `CloudflareSyncBackend` as implementation references. Run conformance tests for another backend.

## SQLite driver

`SqliteDriver` has synchronous `exec`, `all`, and `close` methods. Transactions use explicit SQL because mutation handlers can await and synchronous driver transaction callbacks cannot.

Use `coerceParams`, `coerceRows`, and `coerceValue` at a driver boundary to normalize booleans, bigints, byte arrays, and undefined parameters.

## Query handler

`QueryHandler` can replace SQL sugar. It returns current rows from any source. The shared query declaration owns table dependencies, and the handler may add a push subscription.

## External writes

Use `SyncServer.externalWrite()` after a controlled direct database write. Use backend `onExternalChange` for a continuous foreign-write feed.

## In-browser engine

The demos combine a WASM SQLite driver with a SharedWorker message transport. They run the real server engine without HTTP. Storage is memory-only and dedicated-worker fallback isolates tabs.

## Low-level kit exports

- `thumbGeometry` and `Scrollbar` for custom scroll surfaces.
- `createGestureActor`, `gestureMachine`, and `NO_MODIFIERS` for headless gesture input.
- `parseCombo` and `matchesCombo` for keyboard parsing.
- `createMenuStack`, `flattenLeaves`, and `menuMatches` for menu data.
- `applyDockIntent`, `normalizeSplitTree`, `removePanel`, and `panelIds` for split trees.

Use high-level systems unless application behavior requires these seams.
