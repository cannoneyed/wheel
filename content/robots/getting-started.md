# Getting started

Human page: [Getting Started](../docs/getting-started.mdx).

Install the exact alpha release under the local package name `wheel`:

```sh
bun add wheel@npm:@cannoneyed/wheel@0.1.0 solid-js
```

Keep imports under `wheel/...`. The scoped registry name appears only in the dependency specification.

## Run the repository

```sh
bun install
bun run demos:server
bun run demos
```

The demos browser runs at `http://localhost:4796`. The docs site uses `bun run docs`. The tracker uses `bun run tracker:server` and `bun run tracker`.

## Use a local checkout

```sh
bun run --cwd ../wheel-dev/packages/wheel build
bun add --no-save wheel@file:../wheel-dev/packages/wheel
```

`--no-save` leaves the consumer manifest and lockfile unchanged. Rebuild Wheel and repeat the install after each source change.

## Minimum feature files

```text
src/sync/todos.sync.ts       shared declarations and optimistic handlers
src/sync/todos.server.ts     SQL and authoritative handlers
src/services/todo-service.ts shared state and actions
src/components/todo-list.tsx connected view
src/main.tsx                 WheelApp and client root
server.ts                    backend and sync HTTP process
vite.config.ts               Solid plugin, Wheel plugin, and /sync proxy
```

Use the checked examples in [`packages/docs/examples/getting-started`](../../packages/docs/examples/getting-started).

## Client requirements

- Construct one `SyncClient` with a stable local cache scope.
- Mint a new wire client id for each page load.
- Use `IndexedDbCache` in browsers and `MemoryCache` for ephemeral or test clients.
- Mount `WheelApp` with the client.
- Configure `wheelDevTools()` after the Solid Vite plugin.

## Server requirements

- Apply application migrations before server creation.
- Pass shared sync modules and matching server modules.
- Configure one backend source: `sqlite`, `db`, or `backend`.
- Create an authenticated HTTP handler.
- Await `SyncServer.close()` during shutdown.

## Verification

```sh
bun run typecheck
bun run lint
bun run test:docs
```

Run the full repository gate once after implementation with `bun run check`.
