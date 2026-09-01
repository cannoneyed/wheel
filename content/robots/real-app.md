# Real applications

Human page: [A real app](../docs/real-app.mdx).

Axle is the broad product example. Rounds, Chalk, and Spoke provide focused browser proofs for sync behaviors that need distinct application shapes.

## Portfolio

| App | Role | Required configurations |
| --- | --- | --- |
| Axle (`packages/tracker`) | Product-scale tracker and baseline multi-client convergence | SQLite, Elixir/Postgres, Durable Objects |
| Rounds (`packages/rounds`) | Offline durability and row-contract changes | SQLite default and upgrade |
| Chalk (`packages/chalk`) | Collaborative editor groups, ordering, metadata, comments, undo, and presence | SQLite, Durable Objects |
| Spoke (`packages/spoke`) | Authorization, aggregates, external writes, workspace routing, and multi-node delivery | SQLite, Elixir/Postgres, Durable Objects, two Postgres nodes |

`test/behaviors/catalog.ts` owns the 31 required behavior IDs and the `ws-hibernate` stretch ID. Each row names one primary app and backend. Extra backend runs keep the same spec files and exist only for backend-specific risk.

`scripts/behavior-coverage.ts --check` validates source tags and CI legs. Matrix browser jobs emit Playwright JSON through `scripts/playwright-behavior-report.ts`. `scripts/behavior-results.ts` rejects missing, skipped, failed, or duplicate primary proofs and renders the Buildkite annotation.

## Run

```sh
bun run tracker:server
bun run tracker
```

Default mode uses memory SQLite and demo identity. It resets on restart.

Focused browser commands:

```sh
bun run test:browser:tracker:sqlite
bun run test:browser:rounds
bun run test:browser:rounds:upgrade
bun run test:browser:chalk:sqlite
bun run test:browser:chalk:do
bun run test:browser:spoke:sqlite
bun run test:browser:spoke:do
```

Use Buildkite for the full Postgres and two-node matrix. Those scripts own isolated databases, nodes, and explicit test ports.

Rounds keeps restart, database reset, and one-shot query failure in `packages/rounds/browser/support/server-controller.ts`. Production imports from browser support fail lint.

Forced Durable Object eviction and stale-attachment refusal remain required worker tests. A deployed `ws-hibernate` proof is stretch coverage and must be recorded as pass, fail, or unrun.

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

Demo auth trusts local controls. Default storage is ephemeral. These applications demonstrate framework patterns; identity, provisioning, authorization policy, and operations remain product-specific.
