# Server handlers

Human page: [Server handlers](../docs/server-advanced.mdx). API: [`wheel/sync/server`](api/sync-server.md).

## Migrations

Wheel does not generate application schema. A package migration runner should:

1. Create a migration bookkeeping table.
2. Read applied versions.
3. Begin one write transaction.
4. Apply pending versions in order.
5. Record each version.
6. Commit or roll back the complete batch.

Append versions. Never edit applied DDL. Keep each domain's DDL beside its server bindings.

## Query binding

`serveQuery()` returns a binding that references the exact shared declaration.

```ts
serveQuery({
  query: issuesByTeam,
  sql: (params, principal) => sql`select ...`
});
```

Pass `handler` for a custom `QueryHandler`. A handler must define `run`. Its query needs non-empty `dependsOn` or the handler must define `subscribe()`.

`QueryHandlerCtx.query()` provides read-only access. `ctx.principal` carries trusted identity.

## Row-image pruning

`prune(image, params)` can skip a re-run. It receives raw database rows in `image.o` and `image.n`.

- Check old and new images when membership can change.
- Use database column spelling.
- Configure row-image capture when the selected backend supports it.
- Missing images fall back to running the query.
- Never use pruning as authorization.

## Mutation binding

`serveMutation()` runs one authoritative handler inside `ServerTx`.

- Validate domain rules in the transaction.
- Read actor, workspace, session, mutation id, deterministic ids, and clock from context.
- Throw `rejection()` for correctable business refusal.
- Let unexpected errors become terminal failures.

## Deterministic ids

1. Client and server call `ctx.newId()` the same number of times in the same order.
2. Mint ids before conditional branches.
3. Put a creating row id in args when the inverse needs it.
4. Derive server-only row ids from mutation id and domain identity.
5. Pair deterministic ids with idempotent insert behavior.
6. Use optimistic sentinels for server-assigned fields.

## SQLite adapter details

- Bind booleans as `0` and `1`.
- Read boolean schema fields back as booleans.
- Convert safe bigints to numbers; reject non-JSON values beyond the safe range.
- Use `real` for fractional positions.
- Use `?` in raw SQLite statements.
- Use `sql` fragments for portable parameter binding.

## External jobs

Make clock input explicit. Derive stable ids. Make inserts idempotent. Publish one `externalWrite` after all statements and list every touched table.

Primary sources:

- [`serve.ts`](../../packages/wheel/src/sync/server/serve.ts)
- [`query-handler.ts`](../../packages/wheel/src/sync/server/query-handler.ts)
- [`packages/tracker/server/schema.ts`](../../packages/tracker/server/schema.ts)
- [`packages/tracker/jobs/rollover.ts`](../../packages/tracker/jobs/rollover.ts)
