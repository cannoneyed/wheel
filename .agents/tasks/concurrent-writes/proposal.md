# Concurrent PostgreSQL writes

Research and implementation proposal, 2026-09-11. Based on `36f984b` (`origin/main`).
Branch: `perf/concurrent-writes`. Status: implemented locally; see [results.md](results.md) for validation and measurements.

## Outcome

Run independent transactions in the same workspace concurrently. Keep mutation groups atomic and the sync log ordered by commit. Applications establish dependencies by awaiting successful commands or grouping their calls.

The decisive test holds a transaction on document A before sequence allocation. A second client's transaction on document B must commit and reach subscribers before A is released, provided a write connection is available.

This change targets the Elixir/PostgreSQL backend. Read-pool saturation and total-process memory limits remain separate work. Everybody's reported measurements and organization-wide workspace mapping come from the supplied report; this checkout does not establish its deployed configuration or handler behavior.

## Findings in this checkout

| Source | Current behavior | Consequence |
|---|---|---|
| [workspace.ex](../../../elixir/wheel_sync/lib/wheel_sync/workspace.ex) | Sends all writes to one workspace writer; admits up to 128 outstanding requests | Reads remain responsive, but writes queue behind each other |
| [writer.ex](../../../elixir/wheel_sync/lib/wheel_sync/writer.ex) | Executes the full transaction inside a GenServer callback | Increasing the connection pool alone cannot increase one workspace's write concurrency |
| [supervisor.ex](../../../elixir/wheel_sync/lib/wheel_sync/supervisor.ex) | Already provides separate read and write Postgrex pools; write default is two connections per runtime | Reuse the existing pool and `write_pool_size` option |
| [storage.ex](../../../elixir/wheel_sync/lib/wheel_sync/storage.ex) | Updates a workspace counter after handlers finish, then inserts the log and issues `NOTIFY` in the same transaction | The existing commit-order mechanism can remain |
| [writer.ex](../../../elixir/wheel_sync/lib/wheel_sync/writer.ex) | Checks for a committed mutation before running handlers, without a lock | Concurrent duplicates can both enter handlers; the unique log constraint only resolves the conflict later |
| [client.ts](../../../packages/wheel/src/sync/client/client.ts) | New online commands send independently after persistence; reconnect replay sends one at a time | Removing the server queue can reorder dependent online commands |
| [mutations.ex](../../../elixir/tracker/lib/wheel_tracker/mutations.ex) | Allocates issue numbers with `max(number) + 1`; checks active state and parent cycles before writing | Existing application handlers need concurrency fixes in the same change |
| [concurrent_workspace_test.exs](../../../elixir/wheel_sync/test/concurrent_workspace_test.exs) | Proves a stalled write does not block reads | Does not prove two writes can progress independently |

Writers are per runtime/workspace, not a database-wide ownership mechanism. Two runtimes can already execute handlers against the same workspace. Duplicate protection and application locks must work across nodes.

## Proposed implementation

### 1. Bound transaction execution across the runtime

Keep the workspace writer as a dispatcher only. It starts tasks through a runtime-wide `Task.Supervisor`; Postgrex owns connection checkout and its existing queue-pressure policy. No custom scheduler or client ordering queues are needed.

`write_pool_size` limits database connections, with the existing default of two. `write_queue_size` defaults to 128 additional tasks. The task supervisor limits active plus waiting tasks across all workspaces; a task deadline includes checkout and handler time. The existing per-workspace command limit remains 128.

Mutation groups, external writes, and source invalidations share this path. Pending source invalidations coalesce by query name and retry after saturation or failure. Writer shutdown stops its linked tasks. Mutation IDs resolve uncertain outcomes after lost replies; anonymous external callbacks must not be blindly retried.

Postgrex already supplies transaction checkout; no additional pool library is needed. See [Postgrex](https://postgrex.hexdocs.pm/Postgrex.html) and [Task.Supervisor](https://elixir.hexdocs.pm/Task.Supervisor.html).

### 2. Preserve the existing short commit step

Keep this order inside one PostgreSQL transaction:

1. Acquire duplicate protection and inspect the committed log.
2. Run all handlers, including application locks and writes.
3. Validate the touched tables.
4. Increment `wheel_sync_workspaces.last_seq`.
5. Insert the sync-log row and issue the existing notification.
6. Commit, then acknowledge.

No application callback runs after step 4. The counter row stays locked through commit, so another transaction cannot publish a higher sequence first. Rollback removes the data changes, counter increment, and log entry together.

Retain log-based catch-up and checkpoints. Task completion order and notification arrival are wake-up signals; neither becomes the source of sequence ordering. PostgreSQL delivers transactional notifications only after commit. See [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

The counter remains a shared commit point. A transaction stalled there can still delay other commits. Instrument its wait and hold time, and enforce transaction deadlines. The goal is to remove handler execution from this shared section, not promise unlimited throughput.

### 3. Prevent concurrent duplicate execution

Acquire a transaction-scoped advisory lock derived from a namespaced, stable hash of `(workspace_id, mutation_id)` before `find_committed`. Use the same mapping across nodes; hash collisions may reduce concurrency but must not change identity checks.

After acquiring the lock, check the log in a separate statement under `READ COMMITTED`. A committed duplicate returns its original sequence without entering handlers. If the first attempt rolls back, the next attempt can run. Keep the existing unique constraint as a final invariant.

Transaction-scoped locks release on commit or rollback, including connection failure. They avoid introducing a persistent lock table. See [PostgreSQL advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

This guarantees one committed effect for a mutation ID, not one handler invocation across aborted attempts. Handlers must keep side effects inside the transaction. Email, HTTP calls, and other external effects require durable jobs written transactionally, outside this proposal's implementation scope.

`external_write` currently has no caller-supplied identity. Calls remain separate operations and must not receive automatic retries after connection loss. Callers that require safe replay must use an identified mutation or an application-owned idempotency record, including any returned value. This proposal does not promise duplicate protection for anonymous callbacks.

### 4. Make application conflicts explicit

Use `READ COMMITTED` with atomic SQL, row locks, and database constraints. A single atomic update already coordinates writes to its row. A handler that reads before deciding what to write must lock the relevant row before reading, or express the condition in the update itself.

For invariants spanning rows or absent rows, lock an existing parent row or use a transaction-scoped resource lock. Add a small `Tx.lock!` helper only for these resource locks, scoped by workspace. Acquire known multiple locks in a stable order before dependent reads.

Examples in the included Tracker app:

| Operation | Required correction |
|---|---|
| Allocate an issue number | Lock the team before calculating the next number; enforce uniqueness per workspace/team |
| Check that an issue is active, then edit it | Lock the issue before the check, or use a conditional update and inspect its result |
| Change an issue's parent | Take a shared resource convention for all hierarchy changes in that team, then check for cycles and update |
| Read a relation and then remove it | Lock before reading or use `DELETE ... RETURNING` |
| Update multiple issues | Acquire known row/resource locks in a stable order; retry a whole transaction if PostgreSQL aborts a deadlock |

The hierarchy lock is specific to hierarchy changes. Ordinary edits in the same team do not take it. In Everybody, document/block mutations need the same audit: document A and document B must not take an organization-wide application lock unless they actually change an organization-wide invariant.

Advisory locks require all participating application paths to follow the convention. Wheel cannot infer these dependencies from arbitrary SQL or its touched-table list. This is a deployment requirement, not an automatic guarantee for unaudited handlers. PostgreSQL explains both [row locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html).

### 5. Keep application dependencies explicit

The application awaits a successful mutation acknowledgment or puts dependent calls in one atomic group. Invocation order alone does not establish execution order. Independent commands from the same client remain concurrent; no blanket client or socket write queue is introduced.

The WebSocket transport retries explicit retryable server responses using the existing backoff utility. It retries the same command ID on the same socket, without blocking other commands. Socket loss wakes a delayed retry and returns control to the existing reconnect/outbox path. Closing the transport cancels backoff.

Do not retry business rejections. Anonymous external writes need application-owned idempotency to recover an uncertain commit. See [PostgreSQL retry guidance](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html).

## Alternatives considered

| Option | Decision |
|---|---|
| Increase `write_pool_size` only | Insufficient: the workspace writer still executes one callback at a time |
| Split organization workspaces into project workspaces | Changes application scope and leaves a bottleneck inside each workspace |
| Use `nextval()` for the sync sequence | Reject: allocation order need not match commit visibility, so catch-up can skip a late lower sequence |
| Set every transaction to `SERIALIZABLE` without changing the log | Reject for this design: every write updates the same counter row, creating retry conflicts even between unrelated application writes |
| Use one writer per document | Avoid: Wheel does not know what a document is, and transactions can touch several documents |
| Build a new conflict detector or SQL parser | Avoid: use database primitives and application-specific invariant tests |

The serializable-counter problem is an inference from Wheel's schema and PostgreSQL's snapshot/update rules, not a measured benchmark. A future transparent serializable design would need a different log publication design and separate evaluation. Sequence functions are nontransactional; see [PostgreSQL isolation rules](https://www.postgresql.org/docs/current/transaction-iso.html).

## Required checks

Use PostgreSQL ExUnit tests with explicit barriers, following the existing concurrency tests. Avoid sleep-based correctness assertions.

| Test | Required result |
|---|---|
| Stall A before sequence allocation; write B through another client | B commits and reaches subscribers while A remains blocked |
| Edit the same row concurrently | No lost read-modify-write update |
| Allocate numbers and change parent links concurrently | Unique numbers and no hierarchy cycle |
| Submit one mutation ID concurrently through two runtimes | One committed effect, one log row, identical successful sequence replies |
| Abort the first duplicate attempt | A waiting attempt can succeed; no permanent lock |
| Stall after sequence allocation | No higher sequence becomes visible before that transaction commits or aborts |
| Force reversed task replies and reconnect during commit | No skipped log entry or premature checkpoint; outbox replay remains correct |
| Explicitly group dependent calls | Calls execute in order within one transaction |
| Return overload/deadlock errors on a healthy socket | Command retries; independent commands can complete |
| Roll back a mutation group or external write | No partial data or sync-log change |
| Exhaust capacity, crash workers, disconnect and stop a workspace | Limits hold; capacity and replies do not leak |
| Saturate writes across workspaces and sources | Bounds hold; source invalidations publish when capacity returns |

Keep the existing read-isolation and multi-node tests. Runtime concurrency properties need database tests; ESLint cannot establish them from TSX or arbitrary Elixir SQL. Add structural checks only where they can prove a concrete rule without guessing SQL semantics.

## Performance proof and delivery

Extend the existing benchmark with simultaneous writers: 1, 10, and 50 clients, distinct documents, a shared document, and mixed reads/writes. Sweep write pools of 1, 2, 4, and 8. Include a controlled 800 ms pre-commit stall and a fixed offered load so growing queues are visible.

Record completed writes/second; p50/p95/p99 acknowledgment and subscriber latency; queue depth and wait; handler time; sequence-lock wait; retries; errors; and peak process memory. Use the existing telemetry dependency. Report row-lock waits and read-pool waits separately.

Acceptance requires the barrier-based independence test, all ordering and duplicate tests, and improved independent-write throughput over the one-writer baseline on the same database. Set production latency targets after measuring Everybody's actual handlers; no throughput multiplier is claimed here.

Implement in three reviewable steps, each keeping the product working:

1. Add connected retry tests, database duplicate protection, and application conflict tests/fixes while the current writer remains serial.
2. Introduce bounded concurrent dispatch for all write paths and pass the database concurrency/lifecycle tests.
3. Run the writer benchmark and Everybody handler audit; update Elixir API docs and generated reference docs before deployment.

Run focused unit/type/lint checks locally. Run PostgreSQL service tests and benchmarks in isolated CI jobs; do not run the full browser suite locally. Keep the regular CI path under two minutes by separating the benchmark job.

Relative size: L against the merged read-concurrency change (#17), because this also changes client ordering and application transaction assumptions. Start implementation with the stalled-A/independent-B regression test and the duplicate race test.
