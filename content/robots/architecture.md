# Architecture

Human page: [Architecture](../docs/architecture.mdx). API map: [Import map](import-map.md).

## Enforced source graph

```text
auth          -> no Wheel layer
config        -> no Wheel layer
core          -> no Wheel layer
components    -> core
router        -> core
sync          -> core
kit           -> core, components
sync/server   -> auth, sync, core
debug         -> core, sync, components, kit
testing       -> core, sync, sync/server
```

`debug -> kit, components` is the same kind of edge, and for the same reason: the panel is a wheel app, so it lays itself out with `Frame` and draws itself with the component library rather than hand-rolling a second, worse copy of both. Components the panel mounts for its OWN chrome are wrapped in `DebugChrome`, which suppresses registration — otherwise the panel fills the component tree it is drawing with its own furniture.

`components -> core` is a down edge, not a cycle: core never imports components. The library was a leaf for a while, on the bet that `wheel/components` might ship standalone. It does not — the design is batteries-included — and the price of the bet was that library parts could not reach `viewRoot`, so the component tree had a hole exactly where the UI was. Every part now registers through `renderElement`, named from the `slot` it already declares (`radio-root` -> `RadioRoot`). Registration is dev-only and inert outside a provider, so a part used in plain Solid still costs nothing.

Same-layer imports are valid. Tests can cross layers for integration setup. `wheel/vite` is a build adapter outside the application state-layer checker and imports the core runtime clock.

The rule implementation is [`no-cross-layer-imports.mjs`](../../packages/wheel/eslint/rules/no-cross-layer-imports.mjs).

## External dependencies by leaf

- Core uses Solid, Immer, and XState.
- Components use Solid and floating UI utilities where needed.
- Auth and config remain independent; config re-exports Zod.
- Server owns database and Node/Bun dependencies.

## Locked engine decisions

1. Server truth, no CRDT merge layer.
2. One writer lease per database identity.
3. Whole-row deltas.
4. Fresh bootstrap after reconnect.
5. Injected clock, scheduling, randomness, and ids.

## Client architecture

`SyncClient` is renderer-independent. It owns base rows, optimistic operations, query membership, local cache, outbox, transport, connection state, undo stacks, presence, and provenance.

`SyncService` is the Solid adapter. It reads one client revision and exposes service primitives.

## Server architecture

`SyncServer` owns connections, subscriptions, the writer queue, declaration registry, backend, and sequence delivery. `SyncBackend` owns database-specific atomic operations and writer leasing.

## Component architecture

`connect()` resolves services and records a complete state manifest. `view()` converts deferred accessors to value properties. Root directives attach mounted instances to DOM geometry.

## Feature file split

- `<domain>.sync.ts`: browser-safe declarations and optimistic behavior.
- `<domain>.server.ts`: SQL, authoritative handlers, and DDL.

The registry requires server bindings to reference the original shared declarations.
