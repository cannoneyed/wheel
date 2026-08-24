# Names and errors

Human page: [Names and errors](../docs/reference.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md).

## Declaration names

| Kind | Grammar |
| --- | --- |
| Table and presence | `^[a-z][a-z0-9_]*$` |
| Query and mutation | `^[a-z][a-z0-9_]*\.[a-z][a-zA-Z0-9_]*$` |

A query namespace must equal its result table name. A mutation namespace groups operations and does not declare its complete write set.

## JSON boundary

Query params, mutation args, rows, presence, and protocol values must round-trip through JSON.

Reject bigint, `Date`, non-finite numbers, undefined, sparse arrays, class instances, functions, symbols, and cycles. Validate table keys as non-empty strings. Reject duplicate keys in one query result.

## Mutation states

| State | Terminal | Retry | Meaning |
| --- | --- | --- | --- |
| `pending` | No | N/A | Optimistic write exists locally |
| `queued` | No | Yes | Communication failed |
| `confirmed` | Yes | No | Server committed |
| `rejected` | Yes | No | Business rule refused |
| `failed` | Yes | No | Input or handler is broken |
| `orphaned` | Yes | No | Optimistic replay target vanished |

`mutate()` returns a handle and does not throw terminal results. Read `handle.settled`.

## Wire classification

- `{ ok: true, seq }` confirms.
- `{ ok: false, rejection }` rejects.
- `{ ok: false, error }` fails terminally.
- Network errors, 5xx responses, invalid responses, and retryable backend recovery throw at transport and leave queued state.

Anything the server computed travels as data. Only failure to communicate remains retryable.

## Error classes

- `RejectionError`: created by `rejection(code, message)` and thrown in authoritative handlers.
- `OrphanedError`: created by `orphan(message)` and thrown by optimistic replay when a row legitimately vanished.
- `SyncServerError`: stable server and backend code with HTTP mapping.

## Transient backend errors

`SyncBackend.isTransientError(error)` classifies connection and recovery failures. A transient authoritative attempt must not settle the mutation as failed. A terminal handler bug must not enter the forever-retry queue.

Primary sources:

- [`declarations.ts`](../../packages/wheel/src/sync/declarations.ts)
- [`protocol.ts`](../../packages/wheel/src/sync/protocol.ts)
- [`errors.ts`](../../packages/wheel/src/sync/server/errors.ts)
