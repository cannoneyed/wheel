# Derived collections

Human page: [Derived collections](../docs/derived-collections.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md).

A derived collection is a typed row contract without a matching physical table or touch trigger.

## Declaration

```ts
const projectStats = collection({
  name: 'project_stats',
  type: t.object({ projectId: t.string(), open: t.number() }),
  key: (row) => row.projectId,
});
```

Queries target collections. A derived query names its physical sources in `dependsOn`; Wheel derives the physical table set from those lists.

## Invalidation

Derived collection queries update only through declared invalidation channels:

- `dependsOn` on `query()`: engine-authored writes to physical tables.
- `subscribe(params, invalidate)`: application push source.

At least one channel is required. A query can use both.

`dependsOn` decides when to execute. Row diff decides whether to emit. An unchanged derived result emits no client event.

## Optimistic behavior

Keep server-owned derived values out of optimistic handlers. Optimistically update the source collection. Derived values update after the server computes and emits new rows.

## Use cases

- counts and progress summaries;
- ranked search results;
- joined read models;
- external index output;
- query-specific projections with no storage table.

Primary example: [`packages/docs/examples/derived-collections/derived-collections.ts`](../../packages/docs/examples/derived-collections/derived-collections.ts).
