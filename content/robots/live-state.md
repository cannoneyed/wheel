# Live state

Human page: [Live State](../docs/live-state.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md).

## Shared declarations

- `table()` defines immutable row schema, name, key extractor, and virtual flag.
- `query()` defines name, params, result table, and optional optimistic projection.
- `mutation()` defines name, args, optimistic handler, and optional inverse.
- `patchMutation()` defines the common `{ id, patch }` inverse pattern.
- `presence()` defines the one typed ephemeral peer-state shape.

Shared declaration modules import from `wheel/sync`. Server binding modules import the same objects and add behavior from `wheel/sync/server`.

## Client write path

1. Validate args and pre-generate deterministic ids.
2. Apply the optimistic handler to an overlay.
3. Persist the outbox entry before transport send.
4. Send mutations in order.
5. Settle from the server envelope or retain queued state after communication failure.
6. Replace base rows from server truth.
7. Reapply every pending optimistic mutation in order.

## Server write path

1. Authenticate and resolve the connection principal.
2. Deduplicate by mutation id.
3. Run the authoritative handler under one writer lease and transaction.
4. Commit the mutation result and sync sequence atomically.
5. Re-run query handlers whose invalidation channels fired.
6. Diff rows against prior snapshots.
7. Emit whole-row deltas only for changed results.

## Terminal and non-terminal states

- `pending`: local optimistic write exists.
- `queued`: communication failed; retain and retry.
- `confirmed`: server committed.
- `rejected`: handler issued a typed business refusal.
- `failed`: invalid input or broken handler; terminal and never retried.
- `orphaned`: optimistic replay target vanished; terminal rollback.

## Offline guarantees

- IndexedDB stores snapshots and outbox entries in browsers.
- Cached subscriptions hydrate as stale before network bootstrap.
- Outbox entries keep their mutation ids and deterministic id streams through reload.
- Server deduplication makes resend exactly once.
- Reconnect retries with capped backoff and jitter.
- A same-wire-id reconnect replaces the older stream.
- One wire id belongs to one live page.

## Subscription invalidation

`rerunOn` and handler `subscribe()` decide when to re-check. Row diff decides whether a client event exists. Coarse invalidation affects server work, not client correctness.

## Provenance

`ProvenanceLog` records bootstrap, hydrate, optimistic, sync apply, rollback, and orphan causes. `client.explain(table, id)` returns current value, last cause, and history.

## Current limits

Server-authoritative reconciliation uses no CRDT. The design targets small collaborative applications. The shipped WebSocket transport carries subscriptions, mutations, presence, replies, and server events over one bidirectional socket.

Primary sources:

- [`declarations.ts`](../../packages/wheel/src/sync/declarations.ts)
- [`client.ts`](../../packages/wheel/src/sync/client/client.ts)
- [`engine.ts`](../../packages/wheel/src/sync/server/engine.ts)
- [`protocol.ts`](../../packages/wheel/src/sync/protocol.ts)
