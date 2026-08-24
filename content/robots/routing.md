# Routing

Human page: [Routing](../docs/routing.mdx). API: [`wheel/router`](api/router.md).

## Route declaration

`createRouter(route, options)` compiles one nested route tree. Child names join with dots. `$name` path segments become typed params. Each node can add a Zod `search` object.

The root node is a layout, not a match target. Define an index child for `/`.

## Generated surface

- `Service`: generated `RouterService` subclass.
- `Root`: provider and matched route renderer.
- `Link`: route-name-checked anchor component.
- `Outlet`: matched child renderer.
- `table`: `CompiledRoute` records for tooling and pure tests.

## Service state

- `url` is the source atom.
- `match()` returns the active leaf plus accumulated params, search, and node chain.
- `matchOf(name)` returns an active ancestor or leaf match.
- `navigate(name, options)` writes the atom and history.
- `searchAtom(options)` binds an atom to one search key.

## Search decoding

For each field, the router tries the raw string, JSON-decoded value, then schema default. Invalid input uses the default. Values equal to defaults are omitted during URL building.

Search-atom writes coalesce browser history updates. Default mode is `replace`; use `push` for a real destination change.

## Matching priority

1. Deeper route chain.
2. Fewer params, so literals beat `$param`.
3. Declaration order.

Malformed params, duplicate param names in one chain, and dotted local route names fail during router creation.

## Errors

Per-node boundaries keep parent layouts mounted after leaf failures. A global boundary catches root-layout and renderer failures. Navigation resets latched boundaries.

## History seams

- `browserHistory`, `memoryHistory`, and `basedHistory` implement `RouterHistory`.
- `memoryHistoryOverride()` and `basedHistoryOverride()` install history through service overrides.
- `matchUrl()` and `buildUrl()` operate on a compiled table without services.

## Current limits

No loaders, preloading, scroll restoration, route caching, file route generation, or navigation blocking. Query data belongs in `SyncService`.

Primary sources:

- [`create-router.tsx`](../../packages/wheel/src/router/create-router.tsx)
- [`router-service.ts`](../../packages/wheel/src/router/router-service.ts)
- [`match.ts`](../../packages/wheel/src/router/match.ts)
- [`history.ts`](../../packages/wheel/src/router/history.ts)
