# Concurrent writes: implementation results

Implemented on `perf/concurrent-writes`, based on `36f984b`. All changes stay in the concurrent-writes worktree. Validation below ran locally against a dedicated PostgreSQL 17 database on 2026-09-11; no deployed Everybody application was changed.

## Delivered behavior

- Workspace writers dispatch linked, monitored tasks. Postgrex owns checkout; a runtime task limit bounds active plus waiting writes across workspaces.
- `write_pool_size` retains its default of two connections. `write_queue_size` defaults to 128 additional tasks; `write_timeout` defaults to 25 seconds.
- Mutation IDs take transaction-scoped PostgreSQL locks before deduplication. The existing workspace counter and sync log remain atomic with application writes.
- Anonymous external callbacks run concurrently but have no replay guarantee after an uncertain commit.
- Source invalidations coalesce by query name and retry after saturation or failure.
- The WebSocket transport retries explicit transient server responses with existing capped backoff. Other writes can continue. Disconnect and close cancel or wake delayed retries.
- Application dependencies remain explicit: await a successful command or use one atomic group. No client-wide or socket-wide serial write queue was added.
- Tracker protects issue numbering, active-state checks, parent cycles, and ownership checks with narrower locks. Its schema enforces unique issue numbers per team.
- `Tx.lock!/2` exposes workspace-scoped resource locking for application rules that span rows or absent rows.

## Correctness checks

| Check | Result |
|---|---|
| Wheel ExUnit suite with PostgreSQL | 41 passed; eight opt-in benchmark cases excluded |
| Tracker transaction tests | Three passed: unique numbers, opposing parent changes, archive/edit race |
| Sync client unit tests | 68 passed, including transport overload, concurrent independent writes, disconnect, and retry cancellation |
| Repository TypeScript checks | Passed |
| Repository ESLint and CSS lint | Passed |
| Generated robot API documentation check | Passed |
| Elixir formatting and compiler warnings | Passed for changed applications |
| Modified shell scripts | Syntax checks passed |

The new independent-write regression was also run with the original `Writer` from `36f984b`. It failed because B waited until A's gate expired. Restoring the concurrent writer made the suite pass.

Database tests cover stalled independent writes and subscriber checkpoints, same-row updates, duplicate commands across two runtimes after commit or rollback, sequence-lock ordering, a lost reply after commit, global saturation, task death, deadlines, workspace shutdown, source invalidation recovery, and 50 simultaneous writers.

The benchmark remains excluded from regular CI. Tracker transaction tests were added to the existing Elixir check scripts. Full browser suites and deployed-app tests were not run locally.

## Controlled write benchmark

Each case uses 50 concurrent callers issuing two writes each. Every transaction increments a row and then spends 10 ms in `pg_sleep` while holding its lock. All 100 effects and ordered log entries are verified. The queue target is 5 seconds for this saturation measurement, rather than the production default of 50 ms.

This is a single local synthetic run, not a production latency target. One connection is the serial-capacity baseline for the new implementation; it is not a benchmark of the old revision.

| Rows | Connections | Writes/sec | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|---:|
| Independent rows | 1 | 63.1 | 779.2 | 792.1 | 792.8 |
| Independent rows | 2 | 129.0 | 381.2 | 387.1 | 389.7 |
| Independent rows | 4 | 252.0 | 185.1 | 193.8 | 206.1 |
| Independent rows | 8 | 482.7 | 93.7 | 103.1 | 110.3 |
| One shared row | 1 | 60.9 | 778.7 | 842.8 | 852.2 |
| One shared row | 2 | 64.8 | 745.2 | 795.5 | 796.6 |
| One shared row | 4 | 63.8 | 742.5 | 814.9 | 820.4 |
| One shared row | 8 | 51.3 | 891.7 | 1130.7 | 1248.4 |

All eight benchmark cases passed. More connections improved independent-row throughput; a shared row remained serialized by its database lock.

From `elixir/wheel_sync`, with `DATABASE_URL` set to a dedicated test database:

```bash
mix test --warnings-as-errors
WHEEL_WRITE_BENCHMARK=1 mix test test/write_performance_test.exs --warnings-as-errors
```

## Deployment boundary

Everybody still needs a handler audit and an isolated deployment test. Its application locks, constraints, transaction lengths, and connection budget determine useful production throughput. The short workspace sequence lock remains a shared commit point; read-pool saturation and total-process memory are separate limits.

Tracker's new unique index rejects existing duplicate issue numbers. Resolve such data before starting an upgraded Tracker database. The change does not repair deployed data automatically.

Runtime limits bound write tasks, not every mailbox or allocation. They do not guarantee fairness under permanent overload. Pending source invalidations publish when capacity becomes available. Higher pool sizes multiply connections across all deployed runtimes.
