# Real application: tracker

Human page: [A real app](../docs/real-app.mdx).

The tracker application, Axle, exercises local-first sync, routing, framing, kit systems, components, authentication modes, jobs, search, tests, and production process controls.

## Run

```sh
bun run tracker:server
bun run tracker
```

Default mode uses memory SQLite and demo identity. It resets on restart.

## Read in order

1. [`issues.sync.ts`](../../packages/tracker/src/sync/issues.sync.ts) - declarations, optimistic handlers, inverse mutations, id and sentinel rules.
2. [`issues.server.ts`](../../packages/tracker/src/sync/issues.server.ts) - SQL truth and business guards.
3. [`issue-service.ts`](../../packages/tracker/src/services/issue-service.ts) - keyed queries, keyed view models, actions, and mutation feedback.
4. [`issue-list.tsx`](../../packages/tracker/src/components/list/issue-list.tsx) - one complete connected list.
5. [`issue-interaction-service.ts`](../../packages/tracker/src/services/issue-interaction-service.ts) - bounded composition across domain services.
6. [`schema.ts`](../../packages/tracker/server/schema.ts) - append-only application migrations.
7. [`inbox.server.ts`](../../packages/tracker/src/sync/inbox.server.ts) - principal-scoped reads and row-image pruning.
8. [`rollover.ts`](../../packages/tracker/jobs/rollover.ts) - deterministic external writes.
9. [`search.server.ts`](../../packages/tracker/src/sync/search.server.ts) - custom FTS query handler with table and push invalidation.
10. [`m5-fuzz.test.ts`](../../packages/tracker/test/m5-fuzz.test.ts) - seeded multi-client adversarial checks.

## Additional references

- [`packages/tracker/TOUR.md`](../../packages/tracker/TOUR.md) - long-form code tour.
- [`packages/tracker/ROADMAP.md`](../../packages/tracker/ROADMAP.md) - current application-level production gaps.
- [`packages/tracker/server.ts`](../../packages/tracker/server.ts) - process composition and shutdown.
- [`packages/tracker/src/components/shell/app-shell.tsx`](../../packages/tracker/src/components/shell/app-shell.tsx) - root systems and frame tree.

## Do not copy blindly

Demo auth trusts local controls. Default storage is ephemeral. The tracker demonstrates framework patterns; application identity, provisioning, authorization policy, and operations remain product-specific.
