# Everyday data patterns

Human page: [Everyday data patterns](../docs/data-patterns.mdx). API: [`wheel/sync`](api/sync.md).

## Query rendering

A `LiveQueryView` provides `rows` and `status` from the same subscription.

| Status | Meaning | Rendering rule |
| --- | --- | --- |
| `loading` | Subscribe round trip is open | Show loading only when no prior rows exist |
| `live` | Current rows and active subscription | Render rows or a domain-specific empty state |
| `error` | Subscription was refused | Render an error; identical retries do not clear it |

Branch in this order: error, empty plus loading, empty, rows. This keeps prior rows visible while new params load.

## Mutation feedback

`SyncClient.mutate()` returns a `MutationHandle`. Read `await handle.settled` for terminal state.

| State | User-facing treatment |
| --- | --- |
| `confirmed` | No message; optimistic UI already showed success |
| `rejected` | Show the handler's business message |
| `failed` | Show a stable error code; log details |
| `orphaned` | Explain that the target disappeared |

Transport failure does not settle the handle. The mutation stays queued.

Use one service helper to observe handles consistently. Return the original handle so callers retain its identity.

Silent optimistic interactions, such as reorder and toggle, can use rollback movement as feedback. They still need logging or another failure surface when the domain requires it.

## Ordering

Store a numeric `position` on each row. `positionBetween(before, after)` returns a value at an edge or midpoint.

- Empty list: `positionBetween(undefined, undefined)`.
- Before first: `positionBetween(undefined, first.position)`.
- After last: `positionBetween(last.position, undefined)`.
- Between rows: `positionBetween(left.position, right.position)`.

One reorder changes one row. The query SQL and optimistic projection must sort by the same field.

SQLite positions use `real`, not `integer`. Repeated insertion into one exact gap eventually reaches floating-point precision; use a string fractional-index scheme for machine-generated dense edits.

## Route-keyed queries

Route identity props feed service query families:

```ts
readonly issuesFor = this.liveQueryFor(issuesByTeam, (teamId: string) => ({ teamId }));
```

Release the family entry when the domain object cannot return, or clear the family when its owning workspace changes.

Primary sources:

- [`sync-service.ts`](../../packages/wheel/src/sync/sync-service.ts)
- [`ordering.ts`](../../packages/wheel/src/sync/ordering.ts)
- [`packages/tracker/src/services/issue-service.ts`](../../packages/tracker/src/services/issue-service.ts)
