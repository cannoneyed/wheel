# Virtual tables

Human page: [Virtual tables](../docs/virtual-tables.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md).

A virtual table is a typed row contract without a matching physical table or touch trigger.

## Declaration

```ts
const projectStats = table({
  name: 'project_stats',
  type: t.object({ projectId: t.string(), open: t.number() }),
  key: (row) => row.projectId,
  virtual: true,
});
```

Queries can target the virtual table. Their server handler computes rows from physical tables or another data source.

## Invalidation

Virtual table queries update only through handler invalidation channels:

- `rerunOn`: engine-authored writes to physical tables.
- `subscribe(params, invalidate)`: application push source.

At least one channel is required. A handler can use both.

`rerunOn` decides when to execute. Row diff decides whether to emit. An unchanged derived result emits no client event.

## Optimistic behavior

Virtual rows have no direct optimistic cache layer because no mutation writes the virtual table. Source-table optimistic changes can render immediately through source queries. Derived values update after the server computes and emits the new rows.

## Use cases

- counts and progress summaries;
- ranked search results;
- joined read models;
- external index output;
- query-specific projections with no storage table.

Primary example: [`packages/docs/examples/virtual-tables/virtual-tables.ts`](../../packages/docs/examples/virtual-tables/virtual-tables.ts).
