# Cloudflare deployment

Human page: [Cloudflare deployment](../docs/cloudflare.mdx). Sources: [`cloudflare/website-worker.ts`](../../cloudflare/website-worker.ts), [`cloudflare/tracker-worker.ts`](../../cloudflare/tracker-worker.ts).

On `main`, `wheel-site` serves `wheel.dev` and Tracker remains an isolated preview. Other branches deploy `wheel-site-<branch-key>` and `wheel-tracker-<branch-key>` previews. There is no production Tracker identity or data deployment.

## Workers

- The website Worker serves static assets with separate fallbacks for `/`, `/docs/*`, and `/demos/*`. Paths whose last segment contains a dot are served as assets, which is how `/llms.txt` and `/robots/**.md` reach an agent.
- The tracker Worker serves Axle assets and routes `/sync/*` and `/readyz` to one Durable Object named `axle-demo`. That object owns migrations, demo data, the Wheel server, SQLite storage, and rollover alarms.

## WebSocket lifecycle

- The upgrade path calls `ctx.acceptWebSocket(server)`, never `server.accept()` — Durable Object WebSocket Hibernation.
- One socket carries `subscribe`, `unsubscribe`, `mutate`, and `presence` in both directions.
- A message that wakes the object re-runs its constructor. Boot applies migrations, creates the engine, reads `ctx.getWebSockets()`, and restores every subscription; each query runs once to rebuild its comparison baseline. The waking message runs only after restore completes.

## Versions

| Version | Owner | Change it when |
| --- | --- | --- |
| Sync protocol | Wheel | A frame shape is no longer readable by the other version |
| Application version | App | Client and server behavior can become incompatible |
| SQLite schema version | Migration list | A migration is appended |

## Migration rules

- `applyDurableObjectMigrations(...)` returns the version that becomes the WebSocket hello `schemaVersion`. The default table is `_wheel_schema_migrations`; do not reuse an application migration table with a different column format.
- Append migrations only. Never rename or edit one that has run anywhere: Wheel stores and checks a SHA-256 checksum of the SQL.
- Apply all pending migrations in one storage transaction.
- There are no down migrations. Roll forward. A code rollback runs only if it understands the current schema version.

`cloudflare/tracker.worker.test.ts` proves hibernation resume, stable subscription ids, presence restore, deploy closure, stale socket schema refusal, version mismatch, migration idempotence, changed names or SQL, newer storage, and transaction rollback on real Durable Object test storage.

## Deploy

- Buildkite secrets: `CF_WORKERS_TOKEN` (API token) and `CF_ACCOUNT_ID` (32 characters).
- `bun run preview-url` prints the deployed website URL for the current Git branch. Pass a branch name to inspect another branch.
- The deploy step downloads the exact website and tracker assets from the build steps, deploys both Workers in parallel, then checks the website URL, the tracker URL, and the tracker `/readyz` route.
