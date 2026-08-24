# In-browser sync: the serverless demo system

The six demo sync engines run entirely in
the visitor's browser — wheel's real server engine on WASM SQLite inside a
**SharedWorker**, with the sync protocol proxied over `postMessage` instead of
a WebSocket. One engine per origin: every tab is just another client of the same
server, so tabs sync with each other (and presence spans tabs) exactly like
they do against the Bun dev server. Browsers without SharedWorker (Chrome on
Android) fall back to a dedicated worker — same engines, one per tab. This is
what lets wheel.dev host fully live demos as static files.

## Try it

```
bun run demos          # no bun server needed
open http://127.0.0.1:4796/todos?sync=local
```

Or pin it at build time for a static deploy: `VITE_SYNC_MODE=browser vite build`.

## How it works

Two seams in wheel made this a proxy job rather than a port:

1. **`SqliteDriver`** (`wheel/sync/server`) — the engine's entire database
   surface is three synchronous calls: `exec`, `all`, `close`. The official
   SQLite WASM `oo1` API is also synchronous, so `wasm-sqlite-driver.ts` is a
   thin adapter, reusing wheel's own `coerceParams`/`coerceRows` so the engine
   sees identical row types on every driver.
2. **`SyncTransport`** (`wheel/sync`) — the client's entire view of the wire is
   six async methods. `worker-transport.ts` implements them as `postMessage`
   RPC; the server engine's push events return as messages. The `SyncClient`
   cannot tell the difference — the same
   property wheel's World test harness relies on.

```
tab 1                                shared worker (one per origin)
─────                                ─────────────────────────────
SyncClient                           SyncServer × 4 (one per demo)
  └─ withSimulatedLatency              └─ SqliteDriver → WASM SQLite (:memory:)
       └─ WorkerSyncTransport  ←port RPC + event stream→  per-port RPC router
tab 2 … n                                 ▲
  └─ … WorkerSyncTransport  ──────────────┘  (own MessagePort, own clientId)
```

- `worker-protocol.ts` — the message types. Everything crossing the boundary
  is protocol data (JSON-safe), so structured clone carries it untranslated.
- `sync-worker.ts` — boots the same engines with the same schema/seed
  statements as `packages/demos/server.ts`, then routes requests to per-client
  `SyncConnection`s, one for each port.
- `shims/` — two node builtins (`node:module`, `node:path`) that wheel's
  sqlite seam imports at module load, aliased to browser-safe stubs in
  `vite.config.ts`. The native code paths behind them are never invoked.

Everything else is untouched wheel code: the client outbox, rebase, undo,
presence, and the simulated-latency wrapper all run as-is. The latency slider
still works — it wraps the worker transport the same way it wraps WebSockets.

## Deliberate choices

- **`:memory:` databases, `MemoryCache` on the client.** The engine lives as
  long as any tab holds the SharedWorker and dies with the last one — each
  cold start is a fresh server generation. Pairing an ephemeral server with
  the persistent IndexedDB cache would hydrate rows and replay an outbox from
  a previous generation into a freshly seeded world, so browser mode uses a
  per-page MemoryCache instead.
- **No auth layer.** There is no untrusted hop; `connect` attaches the same
  principal shape the WebSocket authenticator would have produced.
- **One worker, four engines.** The WASM runtime loads once; each demo gets
  its own database, matching the Bun server's one-driver-per-engine layout.

## Next steps (designed, not built)

1. **OPFS persistence.** Swap `:memory:` for the `opfs-sahpool` VFS (works in
   any worker, no COOP/COEP headers) + `CREATE TABLE IF NOT EXISTS`/
   `PRAGMA user_version` guards around schema/seed, so a visitor's demo data
   survives reloads. Then IndexedDbCache can return, keyed per server
   generation.
2. **Shared rooms on Cloudflare.** The same engine runs against Durable
   Object SQLite (`ctx.storage.sql` is the same synchronous shape as
   `SqliteDriver` — the seam was designed for it). One DO per room, alarms for
   expiry. In-browser mode stays the zero-infra fallback and the offline story.
3. **The wheel.dev hero demo.** Two iframes (or two clients in one page) on
   one worker engine — type in one pane, watch the other, with the latency
   slider between them.
