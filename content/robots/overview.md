# Overview

Human page: [Overview](../docs/overview.mdx).

Wheel is a Solid application framework with service-owned state, a server-authoritative sync engine, connected components, development inspection, and enforced source conventions.

## Ownership model

```text
component -> connect() -> service -> SyncClient -> transport -> SyncServer -> backend
```

- A component owns rendering and component-local `useSignal` state.
- A service owns shared local state and actions.
- A `SyncService` owns query handles, mutations, presence reads, and client bookkeeping.
- `SyncClient` owns cached rows, optimistic overlays, the outbox, and provenance.
- `SyncServer` owns authoritative writes, subscriptions, sequence numbers, and backend lifetime.

## Required conventions

1. Each connected component calls one connection first.
2. Components resolve services only inside the connection.
3. Services expose immutable data and named actions.
4. Sync declarations are shared; SQL and authoritative handlers stay server-only.
5. Business time, scheduling, randomness, and ids are injected.
6. Lint and contract tests enforce rules that syntax can prove.

## Public layers

- Independent leaves: `wheel/auth`, `wheel/config`, `wheel/core`, `wheel/components`.
- `wheel/router` and `wheel/sync` build on `core`.
- `wheel/kit` builds on `core` and `components`.
- `wheel/sync/server` builds on `auth`, `sync`, and `core`.
- `wheel/debug` builds on `core` and `sync`.
- `wheel/testing` builds on `core`, `sync`, and `sync/server`.
- `wheel/vite` is a build adapter that uses the core clock.

See [Architecture](architecture.md) and [Import map](import-map.md).

## Locked sync choices

- Server truth replaces optimistic guesses.
- One writer owns each database identity.
- Deltas carry whole rows.
- Reconnect performs a fresh bootstrap.
- Mutation ids make replay exactly once.
- Local cache and outbox durability are required.

## Primary source files

- [`packages/wheel/src/core/services.ts`](../../packages/wheel/src/core/services.ts) - service state and lifecycle.
- [`packages/wheel/src/core/connect.tsx`](../../packages/wheel/src/core/connect.tsx) - providers, connections, and root directives.
- [`packages/wheel/src/sync/client/client.ts`](../../packages/wheel/src/sync/client/client.ts) - local-first client.
- [`packages/wheel/src/sync/server/engine.ts`](../../packages/wheel/src/sync/server/engine.ts) - authoritative engine.
- [`eslint.config.mjs`](../../eslint.config.mjs) - repository rule scope.
