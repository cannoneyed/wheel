# Architecture

Human page: [Architecture](../docs/architecture.mdx). API map: [Import map](import-map.md).

## Enforced source graph

```text
auth          -> no Wheel layer
config        -> no Wheel layer
core          -> no Wheel layer
components    -> no Wheel layer
router        -> core
sync          -> core
kit           -> core, components
sync/server   -> auth, sync, core
debug         -> core, sync
testing       -> core, sync, sync/server
```

Same-layer imports are valid. Tests can cross layers for integration setup. `wheel/vite` is a build adapter outside the application state-layer checker and imports the core runtime clock.

The rule implementation is [`no-cross-layer-imports.mjs`](../../packages/wheel/eslint/rules/no-cross-layer-imports.mjs).

## External dependencies by leaf

- Core uses Solid, Immer, and XState.
- Components use Solid and floating UI utilities where needed.
- Auth and config remain independent; config re-exports Zod.
- Server runtime adapters isolate Bun, Node, browser Worker, and Durable Object dependencies.

## Locked engine decisions

1. Server truth, no CRDT merge layer.
2. One writer lease per database identity.
3. Whole-row deltas.
4. Fresh bootstrap after reconnect.
5. Injected clock, scheduling, randomness, and ids.

## Client architecture

`SyncClient` is renderer-independent. It owns base rows, optimistic operations, query membership, local cache, outbox, transport, connection state, undo stacks, presence, and provenance.

`SyncService` is the Solid adapter. Live-query rows track per-table revisions. Query status and `clientRead` bookkeeping track the coarse context revision.

## Server architecture

`SyncServer` owns connections, subscriptions, the writer queue, declaration registry, backend, and sequence delivery. `SyncBackend` owns database-specific atomic operations and writer leasing.

## Component architecture

`connect()` resolves services and records a complete state manifest. `view()` converts deferred accessors to value properties. Root directives attach mounted instances to DOM geometry.

## Feature file split

- `<domain>.sync.ts`: browser-safe declarations and optimistic behavior.
- `<domain>.server.ts`: SQL, authoritative handlers, and DDL.

The registry requires server bindings to reference the original shared declarations.
