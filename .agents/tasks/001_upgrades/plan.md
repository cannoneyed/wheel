# Wheel upgrades phase plan

This plan turns the findings in [`wheel-upgrades-report.md`](../../../wheel-upgrades-report.md)
and the Phase 0 client proof into gated phases. Each phase keeps Wheel working and records its
validation in [`progress.md`](progress.md) before the next phase starts.

Stages 1 through 6 from the report, the atomic mutation-group requirement in
[`issue_batch_mutations.md`](issue_batch_mutations.md), and the automatic snapshot fingerprint
requirement in [`wheel-version.md`](wheel-version.md) are in scope. Multi-node invalidation remains
limited to Phase 7A. Phase sizes use Phase 1 as the `M` reference.

## Contents

- [Delivery rules](#delivery-rules)
- [Client ownership decision](#client-ownership-decision)
- [Fixed design choices](#fixed-design-choices)
- [Atomic mutation groups](#atomic-mutation-groups)
- [Phase 0A: Evaluate TanStack ownership](#phase-0a-evaluate-tanstack-ownership)
- [Phase 0B: Prove the Wheel materializer](#phase-0b-prove-the-wheel-materializer)
- [Phase 1: Correct the protocol and server engines](#phase-1-correct-the-protocol-and-server-engines)
- [Phase 1B: Add atomic mutation groups](#phase-1b-add-atomic-mutation-groups)
- [Phase 2: Build the Tracker proof slice](#phase-2-build-the-tracker-proof-slice)
- [Phase 2B: Automate snapshot fingerprints](#phase-2b-automate-snapshot-fingerprints)
- [Phase 3: Add Elixir grouping and external writes](#phase-3-add-elixir-grouping-and-external-writes)
- [Phase 4: Move client state ownership](#phase-4-move-client-state-ownership)
- [Phase 5: Expand query and source contracts](#phase-5-expand-query-and-source-contracts)
- [Phase 6: Rename APIs and enforce the boundary](#phase-6-rename-apis-and-enforce-the-boundary)
- [Phase 7A: Add tracked multi-node invalidation](#phase-7a-add-tracked-multi-node-invalidation)
- [Final validation](#final-validation)

## Delivery rules

1. Mark one phase `In progress` in [`progress.md`](progress.md).
2. Add or update tests with each behavior change.
3. Run the phase checks and record the command, environment, and result.
4. Resolve every failed exit condition before starting the next phase.
5. Run browser checks in Buildkite unless local browser work is needed to debug that phase.
6. Keep the full CI path below two minutes.
7. Remove replaced code. Do not add compatibility aliases or fallback paths.
8. Add a lint rule in the same phase when static analysis can prevent a new failure.

## Client ownership decision

Phase 0A rejected TanStack DB as Wheel's client state owner. The proof found four blocking
deficiencies in `@tanstack/db@0.8.6`:

1. Updating an entity used by a joined membership query throws
   `Query contributors with the same row key are not congruent`.
2. A pending optimistic update hides a newer confirmed row from the public read API. Wheel
   cannot re-run the command against current server truth.
3. Re-execution cannot remove an earlier optimistic delete. The required delete-to-insert
   replacement is rejected by the public transaction merge rules.
4. Separate collection sync commits do not provide one atomic publication boundary for an
   entity and its query membership.

The first deficiency may be a version-specific defect. The remaining deficiencies conflict
with Wheel's command model. Fixing the join would not provide semantic re-execution, orphan
detection, or atomic server-query publication.

Wheel will not copy TanStack's collection or incremental-query code. Those parts depend on its
transaction, collection lifecycle, and query compiler rules. Wheel instead keeps the smaller
state materializer required by its named server queries and semantic command replay.

## Fixed design choices

These choices define the Phase 0B proof and later client work.

| Choice | Rule |
|---|---|
| State owner | A Wheel materializer owns confirmed state, pending command replay, and the published effective view. |
| Dependencies | Do not add TanStack DB or copy its source. Use existing Wheel and platform primitives. |
| Publication | Build a complete next view, then swap it and notify subscribers once. |
| Membership | Keep server query membership and order as explicit state keyed by query scope. |
| Query identity | Derive a stable key from the query name and canonical parameters. |
| Query state | Store query scope and status separately because empty results have no row membership. |
| Command unit | One pending command contains one or more ordered mutation calls. Empty groups settle locally and never become pending. |
| Mutations | Preserve semantic re-execution, rollback, orphan detection, undo, and redo for single calls and groups. |
| Group atomicity | Validate every inverse, apply, persist, send, commit, publish, settle, and undo a group as one command. |
| Reads | Application reads use the published effective view. Replay reads use a temporary working view. |
| Provenance | Keep the bounded Wheel provenance log beside the materializer, not inside row values. |
| Snapshot identity | Generate an exact cached-row fingerprint and keep the mutation outbox outside that scope. |
| Release compatibility | Keep ordered application versions separate from the exact snapshot fingerprint. |
| Query expressions | Keep named queries explicit. Do not add expression pushdown without a real consumer. |
| Compatibility | Rename and remove old APIs without aliases. |

## Atomic mutation groups

The editor requires several existing mutation declarations to run as one user action. A single
handler that writes several collections does not meet this requirement because it forces each
consumer to declare a new batch handler.

Both public entry points normalize to one internal command shape:

```text
mutate(declaration, args)  ─┐
                            ├─> command { mutationId, calls[] }
mutateGroup(calls)         ─┘          │
                                       ├─ one outbox entry
                                       ├─ one wire frame
                                       ├─ one server transaction and log row
                                       ├─ one materializer publication
                                       └─ one undo entry
```

The normalized design resolves details that the source requirement leaves implicit:

- Each member carries its own `name`, validated `args`, and deterministic `ids` stream.
- A group runs inside one `SyncClient` and one server workspace.
- Groups cannot contain groups.
- `mutateGroup([])` returns a confirmed handle without adding history, provenance, outbox, or
  wire state.
- A command contains at most 128 members. Client and server validation reject larger groups.
- `mutate` uses the same internal and wire path as a one-member group.
- `MutationInfo` carries `mutations: readonly string[]`; a single call produces a one-item list.
- `mutationState(declaration)` includes any group containing that declaration.
- Every non-empty group member must yield an inverse. A missing or `null` inverse settles the
  group as `failed` before optimistic apply, outbox persistence, or sending.
- Inverses capture before each member applies and execute in reverse member order.
- A terminal protocol mismatch settles queued group handles as `failed` with
  `server_too_old`. The client never sends members separately.

The editor library keeps its Tiptap integration test. Wheel adds a generic three-row conformance
case so the core guarantee does not depend on an editor package.

Permanent operations remain valid single mutations. For example, an archived issue can be
permanently deleted without an inverse because restoring it would also require restoring every
cascaded relation and dependent row. `mutateGroup` rejects that mutation because an accepted
group always promises one complete undo entry.

## Phase 0A: Evaluate TanStack ownership

**Size:** `S`

This investigation is complete. Its failed acceptance checks produced the client ownership
decision above.

### Changes

1. Pin and test `@tanstack/db@0.8.6` through public APIs.
2. Model entity rows, query membership, status, joined results, and multi-collection actions.
3. Test remote batches, optimistic re-execution, rollback, and orphan detection.
4. Record the failed guarantees in [`progress.md`](progress.md).
5. Remove the prototype and dependency after rejecting the model.

### Validation

- The proof records both passing and failing behaviors.
- The dependency and prototype do not remain in production code.
- Later phases contain no TanStack ownership or import work.

### Exit gate

The investigation is closed when its findings, decision, and dependency removal are recorded.
The failed model does not block the Wheel materializer proof or Phase 1.

## Phase 0B: Prove the Wheel materializer

**Size:** `M`, using Phase 1 as the reference

Prove a standalone Wheel state core before extracting state ownership from `SyncClient`. The
prototype remains internal and does not change public exports or production reads.

### Candidate boundary

The proof accepts these inputs:

- Confirmed row batches with full-row puts and deletes.
- Complete membership, order, and status for each affected query scope.
- Pending commands containing ordered mutation calls, arguments, and per-member deterministic
  ID streams.
- Command confirmation, rejection, failure, and removal events.

It publishes one immutable view containing:

- Effective rows after replaying every pending command in order.
- Effective rows for each active query scope.
- Query loading, live, stale, or error status, including empty results.
- The changed collection set and one publication revision.

### Changes

1. Add an internal materializer prototype and focused unit test file.
2. Reuse `OverlayCache`, row validation, frozen rows, and declaration types where they fit.
3. Store confirmed rows and query scopes separately from the published effective view.
4. Clone confirmed rows into a temporary working view for each rebuild.
5. Re-run pending commands in queue order against that working view.
6. Apply every member of a group in order on a private command fork, then promote the fork only
   when every member succeeds.
7. Derive each command's full next write set instead of editing an older recorded write set.
8. Replay each member with its original deterministic ID stream.
9. Build query results from server membership plus optimistic projections for touched rows.
10. Swap the complete view and notify once after a successful rebuild.
11. Drop a failed or orphaned group and rebuild the surviving queue from confirmed state.
12. Record allocation, replay, and publication counts against the current `SyncClient` behavior.

The proof adds no runtime dependency and copies no external source.

### Validation

- One server batch changes an entity and its membership with one subscriber notification.
- A local move from team A to B re-runs after a peer confirms a move from A to C.
- Re-execution removes writes that the new handler run no longer produces.
- A peer deletion produces `orphaned` and leaves no partial optimistic writes.
- Rejection and rollback restore the latest confirmed rows.
- Two pending commands replay in queue order with the original deterministic IDs.
- One command can update rows from several collections without an intermediate view.
- One three-member group publishes once, and each member reads prior members' writes.
- A group re-runs every member against a newer confirmed base.
- A failed or orphaned member removes the whole group without leaving earlier member writes.
- Later pending commands replay after a failed group from the last successful working view.
- Overlapping queries retain shared rows until the final claim is released.
- An empty query retains its scope and status.
- A query without an optimistic projection does not invent membership for a new row.
- Listener assertions observe one revision per accepted input batch.
- The current `SyncClient` and prototype return the same rows for the proof scenarios.

### Exit gate

Record every scenario and measurement in [`progress.md`](progress.md). If semantic replay or
atomic publication fails, stop Phases 2 and 4 and revise the boundary. Passing this gate
authorizes the Tracker proof slice; it does not authorize the Phase 4 production migration.

## Phase 1: Correct the protocol and server engines

**Size:** `M`

Fix existing order, checkpoint, and query failure bugs before replacing client storage.

### Changes

1. Bump the wire protocol version.
2. Add query status events for `error`, `stale`, and `live` states.
3. Add a checkpoint event after every rerun pass.
4. Detect order changes when no row was inserted, changed, or deleted.
5. Isolate TypeScript rerun failures by query group.
6. Retry failed TypeScript batches per group to find the failed groups.
7. Apply the same failure behavior in Elixir.
8. Log detailed server errors and send safe wire errors.
9. Emit Elixir telemetry for query failure and recovery.

An initial query failure returns `error`. A rerun failure keeps the last valid rows and returns
`stale`. A later successful rerun returns `live`.

### Validation

- TypeScript and Elixir emit order-only deltas.
- One failed group does not block unrelated groups.
- A committed mutation stays committed when a query rerun fails.
- Failed queries keep their last valid rows.
- Recovery changes the query from `stale` to `live`.
- Changed, unchanged, and unrelated mutation results all produce a checkpoint.
- TypeScript and Elixir pass the same wire fixtures.

### Exit gate

All protocol fixtures and both engine suites pass. No mutation retry path can hide a stale
subscription.

## Phase 1B: Add atomic mutation groups

**Size:** `L`, using Phase 1 as the `M` reference

Add the public group API and carry one normalized command through optimistic state, durable
storage, the wire, both server engines, and undo history.

### Changes

1. Export `MutationCall` and add `SyncClient.mutateGroup` plus the protected `SyncService`
   wrapper.
2. Replace the internal single-mutation entry with a command containing `calls[]`.
3. Make `mutate` delegate to the same command path with one call.
4. Validate every member and the 128-member limit before allocating optimistic state.
5. Capture member inverses against one private working view and fail before apply when any member
   lacks an inverse.
6. Store the reversed inverses as one undo entry.
7. Apply the whole optimistic group, append one pending command, and notify once.
8. Store all calls and their per-member ID streams in one outbox record.
9. Replace the single-mutation wire request with `mutateGroup`, using the protocol version
   introduced in Phase 1.
10. Surface a terminal old-server version mismatch to the command lifecycle as
   `server_too_old`.
11. Validate every member on the TypeScript server before opening the write transaction.
12. Run every TypeScript member handler against one backend transaction and append one sync-log
    row with the union of touched collections.
13. Add the same validation, transaction, rejection, log, and result behavior to Elixir.
14. Rerun affected query groups once after commit and emit one checkpoint for the group.
15. Update wire fixtures, schema generation, debug records, provenance, and mutation-state
    reads for the normalized command shape.

No member handler or declaration format changes. The server resolves each member through the
existing mutation registry.

### Validation

- A three-member group produces one local publication and no partial reader state.
- Every server validates all members before running the first handler.
- Members run in list order and later members see earlier writes.
- One invalid member applies, persists, and sends nothing.
- One rejection rolls back every server and optimistic write.
- One failed or orphaned member settles the whole group with that terminal outcome.
- Inverses capture in member order and undo in reverse order as one group.
- A group with any missing or `null` inverse fails before apply and creates no undo entry.
- The outbox restores and resends a group as one command after reload.
- Exactly-once replay uses the group mutation ID and returns the original sequence.
- `pendingMutations()` and `queuedMutations()` count one per group.
- A 129-member group fails local and server validation without splitting.
- A one-member group and `mutate` pass the same behavior fixtures.
- An old server settles the group as `failed`; no member-wise frame is sent.
- TypeScript, Elixir, in-process, and WebSocket paths pass the same group wire fixtures.

### Exit gate

Both engines commit, reject, deduplicate, and replay the group as one transaction. The client
publishes, persists, settles, and undoes it as one command. The generic three-row conformance
test passes before the editor library consumes the API.

## Phase 2: Build the Tracker proof slice

**Size:** `L`

Run the materializer against overlapping, ordered, aggregate, and multi-collection Tracker data.

### Changes

1. Drive `issues.byTeam` and `issues.byProject` through the materializer using
   [`issues.sync.ts`](../../../packages/tracker/src/sync/issues.sync.ts).
2. Drive `project_counts.all` through the materializer using
   [`projects.sync.ts`](../../../packages/tracker/src/sync/projects.sync.ts).
3. Drive the multi-collection `issues.create` action through semantic replay.
4. Apply three existing `issues.update` calls as one mutation group.
5. Replace membership for each snapshot and delta.
6. Delete an entity only when no active query claims it.
7. Preserve server-owned result order.
8. Update private membership during each optimistic re-execution.
9. Run the current client and the materializer against the same scripted events.

Queries without an optimistic projection do not show new optimistic inserts. This phase does
not add generic query pushdown.

### Validation

- Overlapping queries share entity rows without deleting each other's results.
- Releasing one query removes only its membership claims.
- Empty query results retain their scope and status.
- Ordered results match the server order.
- Aggregate counts update with the related issue change.
- Issue creation updates `issues` and `issue_labels` as one observed result.
- Three issue updates publish once, settle once, and undo once.
- The current client and materializer produce the same confirmed rows, order, optimistic rows,
  and query state.

### Exit gate

The Tracker slice passes differential tests and the atomic publication proof under real query
shapes.

## Phase 2B: Automate snapshot fingerprints

**Size:** `L`, using Phase 1 as the `M` reference

Generate an exact identity for cached subscription rows. Keep ordered application versions for
rolling compatibility and keep the durable mutation outbox stable across row-contract changes.

Wheel already splits snapshot and outbox scopes in `IndexedDbCache`. Its cache tests prove that a
manual fingerprint retires snapshots without removing pending mutations. The missing work is
fingerprint generation, client artifacts, runtime negotiation, and the standard scope helper.

### Fingerprint contract

The canonical fingerprint input contains:

- Every collection name, JSON Schema, and ordered row-key rule.
- Every query name and its `into` collection.

The query mapping is required because a query can keep its name while changing which collection owns
its cached rows. Query parameter schemas, mutation argument schemas, invalidation hints, and
presence do not change cached row interpretation and stay outside this fingerprint.

The schema-specific canonicalizer sorts collections and queries by name, recursively sorts object
keys, and sorts set-valued JSON Schema arrays such as `required`. It preserves arrays whose order
changes meaning, including composite key fields and tuple items. SHA-256 over the canonical UTF-8
document produces a lowercase value prefixed with `wheel-rows-sha256:`.

Only Wheel's TypeScript contract generator computes the hash. Generated JSON and a small
browser-safe TypeScript module carry the same literal value. Elixir loads and validates that
literal from the generated contract instead of implementing a second canonicalizer.

### Changes

1. Add `rowSchemaFingerprint` to the generated schema specification and bump its format version.
2. Generate a small client module containing the fingerprint beside each checked-in contract.
3. Make generation checks fail when either artifact is stale.
4. Add `createCacheScopes({ storeScope, rowSchemaFingerprint })` to produce the snapshot scope,
   stable outbox scope, and application-owned retirement predicate.
5. Replace manual application-version snapshot scopes in Tracker, demos, and getting-started
   examples with the generated fingerprint and helper.
6. Require the fingerprint in `createWebSocketTransport`, `SyncSocketHandshake`,
   `SyncSocketServer`, Cloudflare, and the Elixir runtime.
7. Bump the wire protocol and require the new handshake field. Do not accept a missing field or
   add a protocol fallback.
8. Compare protocol and ordered application versions before comparing the fingerprint.
9. Return terminal `row_schema_mismatch` details containing both non-secret fingerprints before
   any subscription starts.
10. Stop reconnecting after a fingerprint mismatch. Update application reload handlers to reload
    once for a new server fingerprint and surface a persistent mismatch without a reload loop.
11. Store the fingerprint in hibernation attachments and close restored sockets when their
    deployment fingerprint differs.
12. Update the cache, transport, contract, Elixir, and generated-contract documentation.

### Validation

- Declaration and object insertion order do not change the fingerprint.
- A collection name, row field, required field, key rule, or query `into` change does.
- A mutation argument, query parameter, invalidation hint, or presence-only change does not.
- Generated client and server artifacts contain the same fingerprint.
- TypeScript and Elixir consume the same shared fixture value.
- A new fingerprint loads no old snapshots and retires only application-owned snapshot scopes.
- The stable outbox survives the fingerprint change and replays through normal validation.
- Protocol, `server_updating`, and `client_outdated` results take precedence over
  `row_schema_mismatch`.
- Neither server starts a subscription before the fingerprint check passes.
- An already-open old client reloads once, then connects with the new fingerprint.
- An inconsistent deployment stops reconnecting and does not create a reload loop.
- A browser upgrade test proves that contract-A rows never materialize under contract B while a
  queued mutation survives.

### Exit gate

Generated artifacts, cache tests, shared TypeScript and Elixir wire fixtures, and the focused
browser upgrade test pass. Phase 4 cannot start until applications use generated snapshot scopes
and an old open client cannot subscribe under a different row contract.

## Phase 3: Add Elixir grouping and external writes

**Size:** `M`

Remove repeated query work and give external writers the same log and rerun path as clients.

### Changes

1. Group subscriptions by exact `{query, params, principal}` terms.
2. Run and validate each group once.
3. Diff and emit results per subscriber.
4. Add a public external-write callback through the Workspace process.
5. Commit the application write, touched collections, sequence, and log in one PostgreSQL
   transaction.
6. Rerun affected subscriptions after commit.
7. Generalize storage logging for client and external mutations.

### Validation

- Matching subscriptions execute their query once.
- Different principals never share a result.
- One failed group does not block another group.
- A callback rollback leaves no application row or log row.
- A successful callback records metadata and emits a delta.
- External writes use the same status and checkpoint rules as client mutations.

### Exit gate

PostgreSQL integration tests prove atomic logging and result delivery. Grouping tests prove the
execution count and principal boundary.

## Phase 4: Move client state ownership

**Size:** `L`

Move row replay and query materialization out of `SyncClient` into the proven Wheel materializer.
`SyncClient` keeps transport and command lifecycle work but stops owning duplicate row state.

### Changes

1. Extract the proven materializer behind an internal `SyncClient` boundary.
2. Derive a declaration and mutation registry from client sync modules.
3. Persist optimistic seed data with each outbox command.
4. Restore the preview before confirmed rows finish loading.
5. Re-execute registered handlers after confirmed state hydration.
6. Keep each outbox command until a checkpoint arrives in the current connection generation.
7. Increment the generation on reconnect.
8. Resend confirmed but uncheckpointed commands after reconnect.
9. Route snapshots, deltas, subscription release, and single or grouped command settlement
   through materializer batches.
10. Keep the public `SyncService` surface stable while its internal state owner changes.
11. Port rejection, rebase, orphan, undo, redo, and provenance behavior.
12. Remove base, effective, and order state from `SyncClient` after differential tests pass.

### Validation

- Reload restores a pending optimistic preview.
- Disconnect after acknowledgement and before checkpoint does not lose the command.
- Reconnect works when the server sequence restarts.
- An unchanged mutation result still clears after its checkpoint.
- Business rejection restores confirmed state.
- Rebase can change the optimistic write set.
- Orphan detection, undo, and redo work across multiple collections.
- Group reload, rebase, rollback, orphan, undo, and redo retain one-command semantics.
- Existing state-machine fuzz tests pass against the new owner.

### Exit gate

`SyncClient` contains no duplicate row or query-order store. Tracker services and existing
public APIs use the materializer with no behavior difference outside the planned protocol
changes.

## Phase 5: Expand query and source contracts

**Size:** `L`

Make query dependencies shared data and route non-SQL invalidation through the Workspace loop.

### Changes

1. Add dependency data such as `dependsOn` to the shared query declaration.
2. Remove duplicate `rerunOn` data from server handlers.
3. Generate dependencies through the schema contract.
4. Add a fast SQL path and a general callback path to the Elixir query behavior.
5. Add optional source invalidation subscription and last-subscriber cleanup.
6. Mint sequence and log entries when source invalidation enters the Workspace loop.

Query-expression pushdown is no longer part of this phase. Phase 0A removed the TanStack adapter,
and Wheel has no local expression API to map. An allowlist now would be unused public surface.
Named queries remain the explicit boundary until a concrete consumer requires another shape.

### Validation

- TypeScript and Elixir pass the same schema contract fixtures.
- The dependency auditor rejects missing or inconsistent dependencies.
- A fake source starts once and cleans up after its last matching subscription.
- Source invalidation uses the normal sequence, delta, status, and checkpoint path.

### Exit gate

One declaration owns each dependency list. SQL and external sources pass the same client-facing
protocol tests.

## Phase 6: Rename APIs and enforce the boundary

**Size:** `M`

Apply the final public naming and enforce the internal materializer write boundary.

### Changes

1. Rename `table` to `collection`.
2. Rename `TableDecl` to `CollectionDecl`.
3. Rename schema contract fields from `tables` to `collections`.
4. Bump the schema specification version.
5. Update the Elixir contract reader, Tracker, demos, tests, and docs.
6. Remove the public `virtual` flag and derive physical invalidation sources.
7. Add an ESLint rule if static analysis can prevent direct materializer writes outside the
   approved sync client modules.
8. When the rule is feasible, add Linter API good and bad cases, registration, root
   configuration, and a linting doc row. Otherwise record the false-positive blocker where the
   rule would be documented.
9. Update package validation and generated robot docs.
10. Replace the old client ownership description in
    [`live-state.mdx`](../../../content/docs/live-state.mdx).

### Validation

- `rg` finds no obsolete public names outside history or the task report.
- Schema fixtures use the new specification version.
- The materializer write boundary has an enforced lint rule or a recorded static-analysis
  blocker.
- Package, docs, lint, type, unit, backend, and wire checks pass.

### Exit gate

No compatibility alias remains. Published types, generated contracts, docs, and package output
use collection terms and the documented materializer boundary.

## Phase 7A: Add tracked multi-node invalidation

**Size:** `M`

Multiple Elixir supervisors that share one PostgreSQL database converge after every change already
recorded in `wheel_sync_log`. PostgreSQL notifications wake each node. The log remains the durable
source when a notification is lost.

### Changes

1. Start one `Postgrex.Notifications` connection per supervisor and listen on one fixed channel.
2. Call `pg_notify` in the transaction that appends the sync-log row. PostgreSQL sends the
   notification only after commit.
3. Route notifications with a SHA-256 workspace key so payload size does not depend on workspace
   id length.
4. Read log rows after the local workspace sequence on notification, local commit, subscription,
   listener restart, and a periodic check.
5. Coalesce missed rows into one rerun at the highest sequence. Current PostgreSQL state cannot
   reproduce intermediate row states from earlier log entries.
6. Union touched collections, rerun each affected SQL query group once, and rerun each affected
   source query group once.
7. Ignore notifications when no newer log row exists.

Phase 7A does not capture raw SQL writes that lack a sync-log row. It does not add PostgreSQL
triggers, WAL consumption, logical replication, cross-node presence, global client ownership,
shared query caches, multiple-database coordination, or an event-history API.

### Validation

- Two supervisors receive one committed change.
- A missed notification is recovered from the mutation log.
- Listener restart catches up at the highest unseen sequence.
- A local commit cannot skip an earlier unseen remote sequence.
- Source invalidation reaches matching subscriptions on both supervisors.
- Duplicate notifications do not rerun queries or emit events.

### Exit gate

Two-node PostgreSQL integration tests pass for live delivery, periodic recovery, listener restart,
interleaved commits, source invalidation, and duplicate suppression. TypeScript, lint, unit, and
Elixir checks pass.

## Final validation

Run the smallest relevant checks during each phase. Run TypeScript, lint, and unit checks locally
after Phase 6.

```bash
bun run typecheck
bun run lint
bun run test
```

Buildkite runs backend, package, Cloudflare, and browser checks, including the SQLite and
PostgreSQL browser matrix. Record the build link, backend matrix, run time, and result in
[`progress.md`](progress.md).
