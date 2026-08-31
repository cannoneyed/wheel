# Walkthrough

Human page: [Walkthrough](../docs/walkthrough.mdx).

The checked todo example implements one complete sync path. Read these files in order.

1. [`todos.sync.ts`](../../packages/docs/examples/getting-started/todos.sync.ts) declares the row schema, table, query, mutation, optimistic handler, and projection.
2. [`todos.server.ts`](../../packages/docs/examples/getting-started/todos.server.ts) binds SQL and the authoritative mutation.
3. [`server.ts`](../../packages/docs/examples/getting-started/server.ts) applies DDL, creates the SQLite server, and exposes authenticated HTTP routes.
4. [`client.ts`](../../packages/docs/examples/getting-started/client.ts) separates cache scope, wire id, and actor identity.
5. [`todo-service.ts`](../../packages/docs/examples/getting-started/todo-service.ts) owns one query and its mutations.
6. [`todo-list.tsx`](../../packages/docs/examples/getting-started/todo-list.tsx) connects the service to rendering.
7. [`main.tsx`](../../packages/docs/examples/getting-started/main.tsx) mounts `WheelApp`.
8. [`vite.config.ts`](../../packages/docs/examples/getting-started/vite.config.ts) configures Solid, Wheel development tools, and the sync proxy.

## Invariants to preserve

- The browser and server import the exact same declaration objects.
- Query projections mirror SQL membership and ordering for optimistic rows.
- The authoritative mutation mirrors the optimistic write shape.
- Creating mutation ids travel in args when undo must name the row.
- Server identity comes from authentication, not mutation args.
- `SyncServer` owns backend close.

## Expected behavior

1. A mutation applies to the local overlay immediately.
2. The outbox persists the request before network send.
3. The server commits one transaction and sequence entry.
4. Query handlers re-run when their invalidation channels fire.
5. Changed query rows arrive as whole-row deltas.
6. The client removes the optimistic guess and rebases pending mutations.

## Test seams

- Compile the example files with `bun run typecheck`.
- Apply app lint rules with `bun run lint`.
- Use `expectMutationParity` for optimistic and authoritative equivalence.
- Use `expectQueryInvalidation` for SQL read tables and `dependsOn` parity.
