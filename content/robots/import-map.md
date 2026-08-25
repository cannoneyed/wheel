# Import map

Human page: [Import map](../docs/import-map.mdx). Generated APIs: [`api/`](api/).

## JavaScript entries

| Entry | Owns | Environment |
| --- | --- | --- |
| `wheel/auth` | Principal and authenticator contracts | Browser-safe and server-safe |
| `wheel/config` | Zod-backed JSON configuration | Browser-safe and server-safe |
| `wheel/core` | Services, providers, connections, views, state, stubs, runtime seams | Browser-safe |
| `wheel/sync` | Declarations, schema, SQL fragments, client, transport, cache, SyncService | Browser-safe |
| `wheel/sync/server` | Handlers, engine, WebSocket sessions, drivers, backends, adapters | Server and Worker runtimes; exclude from the main client bundle |
| `wheel/sync/server/cloudflare` | Runtime-neutral server engine and Durable Object backend | Worker-safe |
| `wheel/sync/server/testing` | Backend conformance runner and harness contract | Runtime-neutral test code |
| `wheel/kit` | Application UI services, systems, framing, gesture and menu helpers | Browser-safe |
| `wheel/components` | Aggregate component families | Browser-safe |
| `wheel/components/<family>` | One component family and its types | Browser-safe |
| `wheel/router` | Routes, history, matcher, link, outlet, service | Browser-safe |
| `wheel/debug` | App wrapper, panel, inspector, errors, snapshots, bridge | Browser-safe |
| `wheel/testing` | World, simulation, parity, driver, deterministic utilities | Node/test |
| `wheel/testing/playwright` | Behavior harness types and runtime | Node-only |
| `wheel/vite` | Vite development plugin | Node/build |
| `wheel/eslint` | Plain ESM rule plugin | Node/tooling |

## CSS entries

- `wheel/styles`: core `--wheel-*` design tokens.
- `wheel/components/styles`: component recipes and `--wheel-component-*` tokens.

## Protected service members

Do not import `field`, `atom`, `computed`, `computedFor`, `machine`, or `action`. Call them on a `Service` subclass.

Do not import `liveQuery`, `liveQueryFor`, `clientRead`, or `clientReadFor`. Call them on a `SyncService` subclass.

`searchAtom` is a method on the generated router service.

## Package conditions

`package.json` maps browser `import`, Node, Bun, and type declarations to built outputs. CSS entries map directly to copied styles. The component wildcard maps only built component family inputs listed in [`packages/wheel/vite.config.ts`](../../packages/wheel/vite.config.ts).

## Source of truth

- [`packages/wheel/package.json`](../../packages/wheel/package.json)
- [`packages/wheel/vite.config.ts`](../../packages/wheel/vite.config.ts)
- [`scripts/check-package.mjs`](../../scripts/check-package.mjs)
