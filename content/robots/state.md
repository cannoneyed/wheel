# State

Human page: [State](../docs/state.mdx). API: [`wheel/core`](api/core.md), [`wheel/sync`](api/sync.md).

## Service factories

| Protected member | Contract |
| --- | --- |
| `field(initial)` | Non-reactive mutable slot with debug history |
| `atom(initial, name?)` | Writable signal with frozen values |
| `computed(read, name?)` | Eager zero-argument memo |
| `computedFor(read, name?)` | Memo family keyed by canonical argument tuples |
| `action(fn, name?)` | Bound, batched action |
| `machine(machine, options?)` | Service-owned XState actor and typed transitions |
| `latestAsyncTask()` | Replace the service's previous latest-wins token |

## Atom contract

- `get()` tracks the current reader.
- `set(value)` freezes and replaces the value.
- `update(recipe)` edits an Immer draft and installs a new value.
- Objects, arrays, sets, and maps are immutable after writes.
- `Date` and other mutable non-JSON state should use epoch or plain-data forms.

## Computed contract

- `computed()` takes no callback arguments and evaluates eagerly.
- `computedFor()` arguments must not contain `undefined`.
- Keyed entries persist until `release(...args)`, `clear()`, or service disposal.
- Passthrough computeds are prohibited by convention because they add no derivation.

## SyncService state

| Protected member | Contract |
| --- | --- |
| `liveQuery(decl, params)` | One `LiveQueryView` |
| `liveQueryFor(decl, paramsForKey)` | Keyed live-query family |
| `clientRead(read)` | Reactive view of imperative client state |
| `clientReadFor(read)` | Keyed client-read family |
| `mutate(decl, args)` | Immediate optimistic mutation handle |

Live-query views expose rows and a `loading`, `live`, or `error` status. Releasing the final query handle removes live membership and requests server unsubscribe.

## Invalidation

- Atom writes notify readers of that atom.
- Computeds notify readers when their derived value changes.
- Client events bump one context revision read by live query and client-read views.
- Actions batch synchronous writes.

## Debug registration

Service primitives carry declaration metadata and appear in `DebugRegistry`. Component connections record which service reads feed each mounted instance.

Primary sources:

- [`services.ts`](../../packages/wheel/src/core/services.ts)
- [`sync-service.ts`](../../packages/wheel/src/sync/sync-service.ts)
- [`debug-registry.ts`](../../packages/wheel/src/core/debug-registry.ts)
