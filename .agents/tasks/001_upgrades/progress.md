# Wheel upgrades progress

This file records phase state, validation evidence, decisions, and blockers for
[`plan.md`](plan.md). Update it during each phase so a later session can resume without relying
on chat history.

## Contents

- [Status](#status)
- [Scope](#scope)
- [Baseline](#baseline)
- [Validation record rules](#validation-record-rules)
- [Gate checklist](#gate-checklist)
- [Decision log](#decision-log)
- [Work log](#work-log)

## Status

| Phase | Size | State | Gate |
|---|---:|---|---|
| 0A. Evaluate TanStack ownership | `S` | Complete | Model rejected; dependency and prototype removed |
| 0B. Prove Wheel materializer | `M` | Complete | Proof scenarios, differential check, and local gates passed |
| 1. Correct protocol and servers | `M` | Complete | Both engines and shared protocol fixtures passed |
| 1B. Add atomic mutation groups | `L` | Complete | Client, TypeScript, Elixir, and shared wire gates passed |
| 2. Build Tracker proof slice | `L` | Complete | Tracker proof and current-client differential gates passed |
| 2B. Automate snapshot fingerprints | `L` | Complete | Local and Buildkite gates passed |
| 3. Add Elixir grouping and external writes | `M` | Complete | PostgreSQL grouping and external-write checks passed |
| 4. Move client state ownership | `L` | Complete | Materializer ownership and local behavior gates passed |
| 5. Expand query and source contracts | `L` | Complete | Shared dependencies and callback-source gates passed |
| 6. Rename APIs and enforce boundary | `M` | Ready | Final local and CI checks not run |
| 7. Add multi-node invalidation | `L` | Deferred | Scope not active |

Allowed phase states are `Not started`, `Ready`, `In progress`, `Blocked`, and `Complete`. Only
one phase may be `In progress`.

## Scope

- Stages 1 through 6 from [`wheel-upgrades-report.md`](../../../wheel-upgrades-report.md) are
  active.
- The report's TanStack ownership recommendation is superseded by the Phase 0A proof. Wheel will
  use its own focused materializer and will not copy TanStack source.
- Atomic mutation groups from [`issue_batch_mutations.md`](issue_batch_mutations.md) are active.
  Wheel owns the generic guarantee; the editor library owns its Tiptap integration test.
- Automatic snapshot fingerprints from [`wheel-version.md`](wheel-version.md) are active. Ordered
  application versions remain the rolling compatibility mechanism.
- Multi-node invalidation is deferred. Change Phase 7 to `Not started` when it enters scope.
- No phase preserves replaced APIs through aliases or fallback paths.

## Baseline

The review baseline ran before implementation. Existing user changes to `AGENTS.md` and the
untracked `wheel-upgrades-report.md` were present before this task and remain outside the task.

| Check | Result |
|---|---|
| Targeted TypeScript sync tests | 5 files and 36 tests passed |
| TypeScript SQLite wire conformance | 7 tests passed |
| Elixir tests | 5 tests passed |
| Elixir PostgreSQL test | 1 test excluded because `DATABASE_URL` was absent |

## Validation record rules

Each completed phase records:

1. The commit or worktree state that was tested.
2. Every command and its result.
3. The backend and required environment data.
4. The pass, failure, or skip count.
5. The Buildkite link for browser or multi-backend checks.
6. Each skipped check and the reason it does not apply.
7. The exit-gate decision.

A phase cannot be `Complete` while a required check is skipped or failing.

## Gate checklist

### Phase 0A

- [x] Test the exact TanStack version through public APIs.
- [x] Record the joined-update failure.
- [x] Record the hidden confirmed-base failure.
- [x] Record the delete replacement failure.
- [x] Record the missing cross-collection publication boundary.
- [x] Reject direct TanStack ownership.
- [x] Remove the dependency and prototype.

### Phase 0B

- [x] Add the internal materializer and focused unit tests.
- [x] Prove one publication for an entity and membership batch.
- [x] Prove semantic replay against a newer confirmed base.
- [x] Prove complete write-set replacement, including removal of an old delete.
- [x] Prove orphan, rejection, and rollback behavior.
- [x] Prove deterministic replay of two pending commands.
- [x] Prove atomic writes across several collections.
- [x] Prove ordered replay and one publication for a three-member group.
- [x] Prove one failed or orphaned member removes the whole group.
- [x] Prove a group with a non-invertible member fails before apply.
- [x] Prove overlapping query release and empty-result status.
- [x] Compare proof results with the current `SyncClient`.
- [x] Record allocation, replay, and publication counts.

### Phase 1

- [x] Pass TypeScript order-only delta tests.
- [x] Pass Elixir order-only delta tests.
- [x] Pass grouped rerun failure tests.
- [x] Pass stale-to-live recovery tests.
- [x] Pass changed, unchanged, and unrelated checkpoint tests.
- [x] Pass shared wire fixtures against both engines.
- [x] Confirm a rerun failure cannot retry a committed mutation.

### Phase 1B

- [x] Export `MutationCall` and add `mutateGroup` to `SyncClient` and `SyncService`.
- [x] Normalize `mutate` and `mutateGroup` to one command model.
- [x] Validate every member and the 128-member limit before optimistic apply.
- [x] Pass one-publication and no-partial-read client tests.
- [x] Pass ordered inverse capture and reverse grouped undo tests.
- [x] Pass non-invertible member preflight tests.
- [x] Pass whole-group rejection, failure, orphan, and rollback tests.
- [x] Pass single-entry outbox reload and retry tests.
- [x] Pass exactly-once group replay tests.
- [x] Pass TypeScript and Elixir one-transaction tests.
- [x] Pass grouped wire fixtures through in-process and WebSocket transports.
- [x] Pass old-server refusal without member-wise fallback.
- [x] Confirm pending and queued counts treat a group as one command.

### Phase 2

- [x] Pass overlapping query membership tests.
- [x] Pass release and entity collection tests.
- [x] Pass empty-result status tests.
- [x] Pass server order tests.
- [x] Pass aggregate and multi-collection action tests.
- [x] Pass the three-issue grouped update and grouped undo test.
- [x] Pass current-client and materializer differential tests.
- [x] Confirm no intermediate query result is observable.

### Phase 2B

- [x] Generate one canonical cached-row fingerprint from the schema contract.
- [x] Include table contracts and query-to-table mappings in the fingerprint input.
- [x] Generate matching server JSON and browser-safe TypeScript artifacts.
- [x] Add the standard cache-scope helper and preserve the outbox scope.
- [x] Replace manual snapshot version scopes in Tracker, demos, and examples.
- [x] Require the fingerprint in TypeScript, Cloudflare, and Elixir handshakes.
- [x] Pass ordered-version precedence and terminal mismatch tests.
- [x] Pass stale-snapshot retirement and outbox-survival tests.
- [x] Pass the already-open client and one-reload guard tests.
- [x] Pass the focused browser contract-upgrade test in Buildkite.

### Phase 3

- [x] Prove one execution for each matching Elixir query group.
- [x] Prove principals cannot share grouped results.
- [x] Pass isolated group failure tests.
- [x] Pass external-write rollback tests.
- [x] Pass external-write log and delta tests.
- [x] Pass external-write checkpoint tests.

### Phase 4

- [x] Pass pending-command reload tests.
- [x] Pass acknowledgement-before-checkpoint reconnect tests.
- [x] Pass server sequence reset tests.
- [x] Pass unchanged mutation tests.
- [x] Pass rejection, rebase, and orphan tests.
- [x] Pass multi-collection undo and redo tests.
- [x] Pass grouped reload, rebase, rollback, orphan, undo, and redo tests.
- [x] Pass state-machine fuzz tests.
- [x] Remove duplicate base, effective, and order state from `SyncClient`.

### Phase 5

- [x] Pass schema contract fixtures against TypeScript and Elixir without PostgreSQL.
- [x] Pass the query dependency auditor.
- [x] Pass external source start and cleanup tests with PostgreSQL.
- [x] Pass source invalidation protocol tests with PostgreSQL.
- [x] Remove obsolete expression-pushdown scope after the TanStack adapter was rejected.
- [x] Confirm each dependency list has one owner.

### Phase 6

- [ ] Remove obsolete public table names and the `virtual` flag.
- [ ] Pass schema generation checks with the new version.
- [ ] Enforce the materializer write boundary or record why a safe lint rule is not feasible.
- [ ] Pass `bun run typecheck` locally.
- [ ] Pass `bun run lint` locally.
- [ ] Pass `bun run test` locally.
- [ ] Pass backend, package, and Cloudflare checks in Buildkite.
- [ ] Pass Buildkite browser checks for SQLite and PostgreSQL.
- [ ] Confirm CI completes in less than two minutes.

### Phase 7

- [ ] Activate the phase scope.
- [ ] Pass two-supervisor live delivery tests.
- [ ] Pass missed-notification recovery tests.
- [ ] Pass restart catch-up tests.
- [ ] Pass duplicate suppression tests.

## Decision log

| Date | Phase | Decision | Reason |
|---|---:|---|---|
| 2026-08-30 | Plan | Defer Phase 7 | The report defers multi-node support and no active requirement overrides it. |
| 2026-08-30 | Plan | Treat Phase 0 proofs as hard gates | TanStack's public API does not state both required guarantees. |
| 2026-08-30 | Plan | Fix rerun errors in both engines | TypeScript can commit a mutation and then leave a subscription stale. |
| 2026-08-30 | Plan | Add connection checkpoints | Mutation acknowledgement and global sequence movement cannot identify authoritative application. |
| 2026-08-30 | 0 | Reject direct entity and membership live-query ownership | Joined updates fail, confirmed base rows are hidden under pending writes, and delete replacement is unsupported. |
| 2026-08-30 | 0 | Keep Phase 1 independent | Protocol and server corrections do not depend on the blocked client ownership model. |
| 2026-08-30 | 0A | Remove TanStack DB | The remaining safe role was a flat row store, which did not justify the runtime dependency. |
| 2026-08-30 | 0A | Do not copy TanStack source | Its query code depends on the collection and transaction rules that Wheel rejected. |
| 2026-08-30 | 0B | Prove a focused Wheel materializer | Wheel needs confirmed state, semantic replay, query membership, and one publication boundary. |
| 2026-08-30 | 0B | Gate Phases 2 and 4 on the proof | Tracker adoption and production extraction require the same replay and publication guarantees. |
| 2026-08-30 | Plan | Add Phase 1B for atomic mutation groups | The editor needs several existing handlers to share one client command and one server transaction. |
| 2026-08-30 | 0B | Include grouped commands in the materializer proof | Group rollback requires a private command fork and one publication boundary. |
| 2026-08-30 | 1B | Normalize single calls and groups to `calls[]` | One internal form prevents separate replay, outbox, and server paths. |
| 2026-08-30 | 1B | Store deterministic IDs per member | The server must replay each existing handler with the IDs generated by its optimistic handler. |
| 2026-08-30 | 1B | Reject a group when any member is not invertible | Every accepted group promises one complete undo entry; a partial inverse would leave writes applied. |
| 2026-08-30 | 1B | Keep permanent operations as single mutations | A hard delete may cascade through data that the client cannot restore completely, so it cannot join a group that promises undo. |
| 2026-08-30 | 1B | Reject groups above 128 members | One frame and transaction stay bounded without splitting atomic work. |
| 2026-08-30 | 1B | Replace the version 1 browser outbox | The old single-call row shape cannot preserve group atomicity, and this project does not keep compatibility paths. |
| 2026-08-30 | 1B | Classify replay orphans by server sequence | A matching sequence came from the command itself; an earlier sequence came from a peer delete. |
| 2026-08-30 | 2 | Preserve confirmed query order | The materializer sorts only when optimistic writes affect a scope; untouched rows keep the server order. |
| 2026-08-30 | 2 | Publish undo and redo through the command path | `mutateCommand` already publishes the optimistic result, so `undo` and `redo` must not notify again. |
| 2026-08-30 | 2B | Separate snapshot identity from release compatibility | Exact row-contract identity retires unsafe cache data; ordered versions still express accepted client releases. |
| 2026-08-30 | 2B | Include query-to-table mappings | A query can keep its name while changing the table that owns and validates its cached rows. |
| 2026-08-30 | 2B | Generate the fingerprint once | TypeScript writes the client and server artifacts; Elixir consumes the literal and cannot drift through a second hash implementation. |
| 2026-08-30 | 2B | Require the field in a new wire protocol | The repository removes obsolete paths, so new servers do not accept missing fingerprints or fall back to the old handshake. |
| 2026-08-30 | 0B | Keep the materializer proof internal | The standalone core passed its gate, but production ownership moves only in Phase 4. |
| 2026-08-30 | 2B | Use the built-in Web Crypto API | `node:crypto` broke browser worker bundles; `crypto.subtle` provides the same SHA-256 digest in Node, browsers, and Cloudflare without another dependency. |
| 2026-08-30 | 3 | Group by native Elixir terms | Map and struct equality gives exact `{query, params, principal}` groups without a second canonical serializer. |
| 2026-08-30 | 3 | Reuse `WheelSync.Tx` for external writes | The callback, touched tables, sequence, and log entry share one PostgreSQL transaction. |
| 2026-08-30 | 3 | Require one touched table | An external callback cannot commit application rows without naming the declared tables that Wheel must rerun. |
| 2026-08-31 | 4 | Make the materializer the only client row owner | One confirmed store and one replay path remove drift between base, effective, and query-order state. |
| 2026-08-31 | 4 | Require client sync modules | Reload needs registered mutation handlers and table schemas to validate and replay durable commands. |
| 2026-08-31 | 4 | Persist each command's optimistic preview | A reload can show pending work before confirmed subscriptions finish loading. |
| 2026-08-31 | 4 | Release durable commands only after a current-generation checkpoint | An acknowledgement alone can race a disconnect before the server publishes authoritative query state. |
| 2026-08-31 | 4 | Keep provenance in `SyncClient` | Provenance describes transport and lifecycle causes; the materializer only owns row computation and publication. |
| 2026-08-31 | 5 | Put `dependsOn` on the shared query declaration | TypeScript, generated contracts, and Elixir now read one dependency list. |
| 2026-08-31 | 5 | Keep dependencies as validated table names | String names avoid cross-module import cycles, and both registries reject undeclared names at startup. |
| 2026-08-31 | 5 | Do not add expression pushdown | Phase 0A removed the TanStack adapter, and Wheel has no expression consumer. A mapper would be unused public surface. |
| 2026-08-31 | 5 | Sequence source invalidations before reruns | External source deltas and status changes must share the normal workspace order and checkpoint path. |

## Work log

Add new entries at the top of this section. Keep prior entries unchanged.

### 2026-08-31: Complete Phase 5

**State:** Complete

**Worktree**

- Branch `wheel-upgrades`, based on commit `e531e2d`, with Phase 5 changes not yet committed.
- Existing changes to `AGENTS.md`, `wheel-version.md`, and `wheel-upgrades-report.md` remain outside
  this phase.

**Changes**

- Added `dependsOn` to shared query declarations. Physical queries default to their target table;
  virtual queries must name physical dependencies or use `[]` for a push-only source.
- Removed `rerunOn` from TypeScript server bindings and query handlers.
- Generated `dependsOn` in schema specification version 3 and updated both checked-in contracts.
- Moved TypeScript reruns, diagnostics, and SQLite dependency audits to the shared declaration.
- Added Elixir `run/2` callback queries beside the existing `sql/2` fast path.
- Added optional Elixir `subscribe/3` sources grouped by exact query, parameters, and principal.
- Started one source per exact group and ran its cleanup after the last matching subscription.
- Routed source invalidations through the Workspace loop. Each invalidation now receives a sequence
  and log row before any delta or status event, followed by a checkpoint.
- Added a shared wire-contract source fixture and PostgreSQL coverage for callback rows, shared
  source lifetime, changed and unchanged results, stale/live status, logs, and checkpoints.
- Updated TypeScript, Elixir, Tracker, examples, public guides, and generated API docs.
- Removed the planned expression-pushdown mapper. Phase 0A removed its TanStack consumer, so the
  mapper would have been unused public surface.

**Validation**

- `bun run check:static`: passed lint, generated schema and fingerprint checks, generated docs,
  type checks, service checks, Cloudflare types, and package validation.
- `bun run test`: 155 component files passed with 1,882 tests passed and 26 existing skips; 105
  node files passed with 815 tests passed and no type errors.
- Final focused dependency, handler, schema, and World tests: 4 files and 32 tests passed with no
  type errors.
- Docs tests: 4 files and 255 tests passed.
- SQLite backend tests: 16 passed.
- TypeScript SQLite wire tests: 12 passed.
- Cloudflare tests: 3 files and 27 tests passed.
- Elixir PostgreSQL suite: 10 tests passed with no exclusions against the Solo-managed Postgres 17
  process. The source test covered one start, last-subscriber cleanup, sequences 1 through 3,
  deltas, stale/live status, source log rows, and checkpoints.
- `mix test --exclude postgres --warnings-as-errors`: 10 tests passed with 5 PostgreSQL exclusions
  after the managed database was stopped. `bun run test:elixir` also compiled the Tracker Elixir
  application with warnings treated as errors.
- `git diff --check`: passed.
- Browser tests were not run locally. Phase 5 changes no browser behavior, and the repository guide
  reserves full browser suites for Buildkite after a push.

**Decisions**

- Keep dependency names as strings in the shared declaration. Both registries validate them, and
  strings avoid cross-module imports between sync modules.
- Require virtual queries to declare dependencies explicitly because their target has no physical
  invalidation source.
- Keep SQL and callback execution as the only Elixir query paths.
- Use exact native Elixir terms for source grouping, matching Phase 3 query grouping.
- Record every source invalidation before rerunning, including no-op and failed reruns.
- Keep named queries explicit until a real expression consumer exists.

**Blockers**

- None.

**Exit gate**

- Passed. One declaration owns each dependency list, and SQL and external callbacks use the same
  snapshot, delta, status, sequence, and checkpoint protocol.

### 2026-08-31: Complete Phase 4

**State:** Complete

**Worktree**

- Branch `wheel-upgrades`, based on commit `5fc324d`, with Phase 4 changes not yet committed.
- Existing changes to `AGENTS.md`, `wheel-version.md`, and `wheel-upgrades-report.md` remain outside this phase.

**Changes**

- Made `WheelMaterializer` the only owner of confirmed rows, pending replay, query membership,
  query order, query status, and the published effective view.
- Routed hydration, snapshots, deltas, subscription release, settlement, rejection, rollback,
  rebase, orphan handling, undo, and redo through materializer inputs.
- Added a client declaration registry from shared sync modules.
- Persisted validated optimistic previews with outbox commands and restored them before confirmed
  rows load.
- Replayed restored handlers with their original deterministic IDs after confirmed hydration.
- Kept acknowledged commands in the outbox until a checkpoint arrives in the same connection
  generation. Reconnects resend acknowledged but uncheckpointed commands.
- Added reload, grouped reload, current-generation checkpoint, sequence-reset, and
  multi-collection undo and redo coverage.
- Removed Phase 0B's recorded runtime counters, the unused query registry, and the client's copy
  of materializer write sets after a ponytail simplification pass.
- Updated applications, examples, architecture docs, live-state docs, and generated API docs for
  the required client sync-module registry and new ownership model.

**Validation**

- `bun run lint`: passed.
- `bun run typecheck`: passed.
- `bun run test`: 155 component files passed with 1,882 tests passed and 26 existing skips; 105
  node files passed with 815 tests passed and no type errors. No Phase 4 sync test was skipped.
- `bun run docs:robots:check`: passed after regenerating the API reference.
- `git diff --check`: passed.
- The ownership search found no `base`, `effective`, or subscription-order store in
  `SyncClient`.
- Browser tests were not required for this phase. The repository guide reserves the full browser
  suite for Buildkite after a push.

**Decisions**

- Keep transport, persistence, mutation lifecycle, undo history, and provenance in `SyncClient`.
- Keep row computation and publication inside the materializer.
- Treat a current-generation checkpoint as the only durable release signal.

**Blockers**

- None.

**Exit gate**

- Passed. `SyncClient` has no duplicate row or query-order state, and all required local behavior
  gates pass.

### 2026-08-30: Implement Phase 3

**State:** Complete

**Changes**

- Grouped invalidated Elixir subscriptions by exact query, parameter, and principal terms.
- Ran and validated each query group once, then diffed and emitted results for each subscriber.
- Kept query failure status, telemetry, and recovery events per subscriber.
- Added `WheelSync.external_write/3` and `WheelSync.external_write/4`.
- Ran each external callback through the Workspace process with the existing `WheelSync.Tx`.
- Committed application writes, touched tables, sequence, and log metadata in one PostgreSQL
  transaction.
- Reused the mutation rerun and checkpoint path after an external commit.
- Generalized `WheelSync.Storage.append_log!/4` for client and external log entries.

**Validation**

- Tested the uncommitted worktree based on commit `967f541`.
- Focused PostgreSQL workspace suite: 4 tests passed. Three subscribers caused two query runs:
  one for the shared principal and one for the isolated principal.
- `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/wheel_sync bun run
  test:elixir`: 8 tests passed with no exclusions; Tracker compiled with warnings treated as
  errors.
- `bun run check:static`: passed lint, generation, type, package, and Cloudflare checks.
- `bun run test:wire`: all 12 TypeScript SQLite fixtures passed.
- One-shot Elixir PostgreSQL wire server on a free local port: all 12 shared fixtures passed.
- `mix format --check-formatted` and `mix compile --warnings-as-errors`: passed.
- `git diff --check`: passed.

**Decisions**

- Use native Elixir term equality for group keys. Validated parameter maps compare by value and
  principal structs include actor, workspace, and session identity.
- Require callbacks to return `{:ok, value}` to commit or `{:error, reason}` to roll back.
- Require callbacks to call `WheelSync.Tx.touch!/2` for at least one declared table.
- Use `external.write`, `system:external`, and `server:external` as default log metadata.

**Blockers**

- None.

**Exit gate:** Passed. PostgreSQL proves one execution per exact query group, principal isolation,
failure isolation, atomic external logging, rollback, delta delivery, and checkpoints.

### 2026-08-30: Start Phase 3

**State:** In progress

**Changes**

- Started Elixir query grouping and the atomic external-write path.

**Validation**

- Pending.

**Decisions**

- Pending.

**Blockers**

- PostgreSQL integration checks require `DATABASE_URL`.

### 2026-08-30: Implement Phase 2B

**State:** Complete

**Changes**

- Added a canonical SHA-256 fingerprint over table names, virtual state, JSON Schemas, ordered row
  keys, and query-to-table mappings.
- Added the fingerprint to schema specification version 2 and generated browser-safe TypeScript
  literals for the wire fixture, Tracker, all demos, and the getting-started example.
- Added stale-artifact checks to the static gate.
- Added `createCacheScopes()` so snapshots use the exact fingerprint while existing outbox scopes
  remain stable.
- Added `createRowSchemaReloadGuard()` so apps reload once for each new server fingerprint and
  stop a persistent mismatch loop.
- Bumped the sync protocol to version 3 and required the fingerprint in TypeScript, Cloudflare,
  and Elixir handshakes.
- Added terminal `row_schema_mismatch` frames with both fingerprints after protocol and ordered
  application-version checks.
- Stored the fingerprint in Cloudflare hibernation attachments and refused restored sockets from
  another row contract.
- Updated Tracker, demos, getting-started, public guides, Elixir setup, and generated API docs.
- Added a real IndexedDB browser proof. It retires a versioned snapshot, preserves a queued
  mutation, reconnects, and observes the normal replay.
- Fixed Tracker's trusted Vite WebSocket proxy to rewrite both host and origin. This keeps the
  server's same-origin check valid behind the local HTTPS route.
- Added the required excerpt labels to two Phase 1B examples found by the complete docs gate.
- Replaced the Node-only SHA-256 call with the built-in Web Crypto API. Schema generation is now
  async and browser bundles need no hash dependency.

**Validation**

- `bun run check:static`: passed lint, schema and fingerprint generation checks, generated docs,
  type checks, service checks, Cloudflare types, and package validation.
- Component unit suite: 155 files passed; 1,882 tests passed and 26 skipped.
- Node unit suite: 105 files and 810 tests passed with no type errors.
- Docs suite: 4 files and 255 tests passed.
- SQLite backend suite: all 16 tests passed.
- TypeScript SQLite shared wire suite: all 12 fixtures passed.
- `bun run test:elixir`: 6 tests passed; 2 PostgreSQL tests were excluded because no database was
  available. The Tracker Elixir application compiled with warnings treated as errors.
- Cloudflare suite: 3 files and 27 tests passed.
- Focused Tracker Chromium upgrade proof: 1 test passed in 2.3 seconds against the Solo SQLite
  server.
- [Buildkite build 121](https://buildkite.com/cannoneyed/wheel/builds/121) passed the static,
  unit, Cloudflare, website, SQLite browser, PostgreSQL/Elixir browser, component browser, demo
  browser, and branch deployment gates for commit `b4f5c86`.
- The package, release staging, nightly fuzz, and cleanup jobs did not run because their branch or
  schedule conditions did not apply to this feature-branch build.
- `git diff --check`: passed.

**Decisions**

- Keep each existing store identity unchanged so the first fingerprint release can retire the
  old `snapshots:v1` rows and find the existing outbox.
- Compute the hash only in TypeScript. Elixir validates and consumes the generated literal.
- Use `globalThis.crypto.subtle` so the public schema helpers work in Node, browsers, and
  Cloudflare without a runtime hash dependency.
- Treat a row mismatch as terminal. App code owns one asset reload through the shared guard.
- Keep the proxy origin rewrite limited to the trusted Vite sync target.

**Blockers**

- None.

**Exit gate:** Passed. Generated artifacts, cache behavior, shared TypeScript and Elixir fixtures,
and the browser contract-upgrade proof pass on the feature branch.

### 2026-08-30: Start Phase 2B

**State:** In progress

**Changes**

- Started canonical fingerprint generation, cache-scope helpers, protocol negotiation, and
  cross-runtime validation.

**Validation**

- Pending.

**Decisions**

- Keep the implementation order from the phase plan: generation, cache scopes, handshake, then
  application and browser checks.

**Blockers**

- None.

**Exit gate:** Pending.

### 2026-08-30: Add Phase 2B snapshot fingerprints

**State:** Ready

**Changes**

- Reviewed the automatic snapshot fingerprint proposal against the schema generator, browser
  cache, TypeScript socket server, Cloudflare attachments, and Elixir endpoint.
- Confirmed that Wheel already separates snapshot and outbox scopes and supports ordered release
  versions.
- Confirmed that Wheel does not generate a row fingerprint, negotiate it, or provide the standard
  cache-scope helper.
- Added Phase 2B before production materializer ownership moves in Phase 4.
- Added query-to-table mappings to the fingerprint input because they control cached row
  ownership and validation.
- Chose one TypeScript generator for both browser and external-server artifacts.

**Validation**

- Planning document links and Markdown structure checked locally.
- No code tests run because this entry changes the rollout plan only.

**Decisions**

- Keep ordered application versions for compatibility ranges.
- Use the generated fingerprint only for exact cached-row identity and handshake equality.
- Bump the schema specification and wire protocol without a missing-field fallback.
- Gate Phase 4 on generated cache scopes and cross-runtime mismatch tests.

**Blockers**

- None.

**Exit gate:** The proposal is accepted with the query-mapping and single-generator refinements.
Phase 2B is ready to start.

### 2026-08-30: Complete Phase 2

**State:** Complete

**Changes**

- Added a Tracker proof using the real `issues.byTeam`, `issues.byProject`,
  `issue_labels.byTeam`, and `project_counts.all` declarations.
- Proved membership replacement, overlapping claims, final-claim pruning, empty live scopes,
  and server-owned order.
- Proved `issues.create` publishes its issue and label links together.
- Proved a related issue move and aggregate count replacement publish in one server batch.
- Proved three `issues.update` calls apply, settle, and undo as one command in both the
  materializer and the real client.
- Added a scripted differential test for pooled rows, query order, optimistic replay, rejection
  rollback, and stale query state.
- Preserved confirmed server order until an optimistic write affects the query scope.
- Removed duplicate `undo` and `redo` notifications. The shared command path already publishes
  their optimistic result.
- Kept the materializer internal. Production `SyncClient` still owns application reads.

**Validation**

- Tracker Phase 2 proof: 1 file and 6 tests passed with no type errors.
- Tracker proof plus the Phase 0B materializer suite: 2 files and 19 tests passed.
- `bun run test:unit:node`: 104 files and 806 tests passed with no type errors.
- `bun run check:static`: passed lint, generated schema checks, generated API checks, type checks,
  service checks, Cloudflare types, and package validation.
- `git diff --check`: passed.

Browser tests were not run. Phase 2 adds a headless proof and changes no UI or browser-only path.

**Decisions**

- Keep Tracker proof helpers in the Tracker test tree and import the internal materializer
  directly.
- Keep aggregate rows server-owned because `project_counts.all` has no optimistic projection.
- Move production state ownership only in Phase 4.

**Blockers**

- None.

**Exit gate:** Passed. The Tracker slice matches the current client after confirmed, optimistic,
replayed, stale, and rejected inputs. Every materializer input publishes one final view.

### 2026-08-30: Start Phase 2

**State:** In progress

**Changes**

- Started the Tracker query, mutation, service, and materializer proof inventory.

**Validation**

- Pending.

**Decisions**

- Keep the proof in Tracker tests. Production client ownership remains a Phase 4 change.

**Blockers**

- None.

**Exit gate:** Pending.

### 2026-08-30: Complete Phase 1B

**State:** Complete

**Changes**

- Added `MutationCall`, `SyncClient.mutateGroup`, and the protected `SyncService` wrapper.
- Normalized plain mutations and groups to one ordered `calls[]` command in memory, IndexedDB,
  transports, debug records, and provenance.
- Added private group preflight, per-member deterministic IDs, one optimistic publication, and
  reverse grouped undo.
- Replaced the single-mutation wire frame with `mutateGroup` and removed the old transport and
  server paths.
- Added one-transaction group execution, validation, deduplication, logging, reruns, and
  checkpoints to SQLite, Cloudflare, and Elixir/Postgres.
- Added terminal `server_too_old` handling without member-wise fallback.
- Used the command sequence to distinguish a command's own delete from a peer delete during
  optimistic replay.
- Replaced version 1 IndexedDB outbox rows instead of adding a compatibility conversion.
- Updated shared wire fixtures, generated API documents, and the public live-state, undo, and
  transport guides.
- Made the Elixir backend CI shell stop when an inner test or compile command fails.

**Validation**

- `bun run check:static`: passed lint, generated schema checks, generated API checks, type checks,
  service checks, Cloudflare types, and package validation.
- `bun run test:unit:node`: 103 files and 800 tests passed with no type errors.
- `bun run test:unit:components`: 155 files passed; 1,882 tests passed and 26 skipped.
- `bun run test:backends`: all 16 SQLite backend tests passed.
- `bun run test:cloudflare`: 3 files and 26 tests passed.
- TypeScript SQLite shared wire gate: all 12 fixtures passed.
- Docker PostgreSQL gate: all 6 Elixir tests passed, including grouped commit and rollback.
- Elixir/Postgres shared wire gate: all 12 fixtures passed.
- Tracker Elixir server compiled and formatted without warnings.
- `git diff --check`: passed.

Browser UI tests were not run. Phase 1B changes the headless sync and WebSocket contracts. The
direct TypeScript and Elixir WebSocket fixture suites cover those paths.

**Decisions**

- Keep `mutate` as the public one-call helper, but send it through the group command path.
- Require a complete inverse for every non-empty group member before visible state changes.
- Keep permanent deletes as non-invertible single mutations.
- Refuse groups above 128 calls on both client and server.

**Blockers**

- None.

**Exit gate:** Passed. Both engines commit, reject, fail, deduplicate, and replay one command.
The client publishes, persists, settles, orphans, and undoes the command as one unit.

### 2026-08-30: Start Phase 1B

**State:** In progress

**Changes**

- Started the client command, outbox, protocol, TypeScript server, Elixir server, and shared
  fixture inventory.

**Validation**

- Pending.

**Decisions**

- Keep `mutate` and `mutateGroup` on one internal command path.
- Require every grouped member to provide an inverse before optimistic apply.

**Blockers**

- None.

**Exit gate:** Pending.

### 2026-08-30: Start Phase 1

**State:** Complete

**Changes**

- Bumped the wire protocol from version 1 to version 2.
- Added snapshot status, query status events, and connection checkpoints.
- Added client handling for `error`, `stale`, and `live` query states.
- Kept confirmed optimistic state until a delta, snapshot, or checkpoint proves the rerun pass
  finished.
- Fixed order-only deltas in both engines.
- Isolated TypeScript query-group failures and retried failed batches by group.
- Kept last valid rows after rerun failures and restored `live` after recovery.
- Added safe wire errors, detailed server logs, and Elixir failure and recovery telemetry.
- Expanded the shared fixtures with order-only, unchanged, unrelated, failure, and recovery
  cases.
- Updated schema fixtures, public exports, and generated API documents for protocol version 2.
- Kept Phase 0 changes isolated in commit `8562e5e`.

**Validation**

- `bun run test:unit:node`: 102 files and 782 tests passed.
- `bun run test:unit:components`: 155 files passed; 1,882 tests passed and 26 skipped.
- `bun run test:wire`: TypeScript SQLite passed all 10 shared fixture cases.
- `bun run test:backends`: 14 SQLite backend tests passed.
- `bun run test:cloudflare`: 3 files and 24 tests passed.
- `bun run test:elixir`: 6 Elixir tests passed; 2 Postgres tests were excluded because
  `DATABASE_URL` was absent. The Tracker Elixir server compiled.
- One-shot Docker Postgres gate: all 6 Elixir tests passed, including both Postgres tests. The
  Tracker Elixir server compiled without warnings.
- Shared Elixir/Postgres wire gate: all 10 fixture cases passed.
- `bun run schema:wire:check` and `bun run schema:tracker:check`: passed.
- `bun run typecheck`: passed for Wheel, apps, and Cloudflare.
- `bun run lint`: passed.
- `bun run docs:robots:check`: passed.
- `git diff --check`: passed.

**Decisions**

- Treat query execution failures as subscription state, not request failure.
- Return an `error` snapshot on initial failure. Preserve rows and return `stale` after a later
  failure.
- Send one checkpoint to every connection after each committed rerun pass, including passes
  with no changed rows or affected queries.
- Keep full query errors in server logs and send one stable `query_error` payload on the wire.

**Blockers**

- None.

**Exit gate:** Passed. Both engine suites and the same 10 protocol fixtures passed.

### 2026-08-30: Complete Phase 0B

**State:** Complete

**Changes**

- Added an internal `WheelMaterializer` with separate confirmed state, query scopes, pending
  commands, and published effective state.
- Added private command forks so a failed or orphaned group leaves no member writes behind.
- Added per-member deterministic ID replay and reverse-ordered group inverses.
- Added explicit query membership, order, and status state, including empty results.
- Added one final publication after each accepted server batch, command, rollback, or query
  release.
- Added 13 focused tests for every Phase 0B scenario.
- Kept production `SyncClient` reads and public Wheel exports unchanged.

**Validation**

| Command or build | Environment | Result |
|---|---|---|
| `bun run test:unit:node -- packages/wheel/src/sync/client/materializer.test.ts` | Local Node | Passed: 1 file and 13 tests; no type errors |
| `bun run test:unit:node` | Local Node | Passed: 101 files and 774 tests; no type errors |
| `bun run typecheck` | Local worktree | Passed |
| `bun run lint` | Local worktree | Passed |
| `git diff --check` | Local worktree | Passed |

Browser tests were not run. Phase 0B adds an internal Node proof and does not change browser or
production behavior.

**Measurements**

The representative queue contains a create command followed by an edit command. A later server
batch forces both commands to replay.

| Counter | Result |
|---|---:|
| Accepted inputs, including initial server state | 4 |
| Command preflights | 2 |
| Full rebuilds | 4 |
| Table-map clones | 13 |
| Command replays | 5 |
| Member replays | 5 |
| Materializer publications | 4 |

The differential test observes three post-seed changes: optimistic apply, peer delta, and
rejection rollback. The current `SyncClient` and the materializer each notify three times and
return the same pooled and query rows after every change. The clone count is the Phase 4 cost
baseline, not a target.

**Decisions**

- Use the standalone boundary for the later Tracker proof and production migration.
- Preserve server-owned membership and order. Apply optimistic projection only to rows touched
  by pending commands.
- Require one complete inverse before a group can enter pending state.
- Keep non-invertible permanent deletion available through single `mutate` calls.

**Blockers**

- None.

**Exit gate:** Passed. Phase 1 is ready for approval. Phases 2 and 4 may rely on this proof, but
the production ownership move remains gated on their own checks.

### 2026-08-30: Start Phase 0B

**State:** In progress

**Changes**

- Tightened the group contract so every accepted non-empty group has one complete inverse.
- Documented permanent deletion as a valid single mutation that groups reject.
- Started the internal Wheel materializer proof.

**Validation**

- Pending.

**Decisions**

- Phase 0B proves grouped replay and atomic publication without changing production reads.

**Blockers**

- None.

**Exit gate:** Pending.

### 2026-08-30: Add atomic mutation groups to the plan

**State:** Ready

**Changes**

- Mapped the editor requirement to the Phase 0B materializer boundary.
- Added Phase 1B for the public API, outbox, wire, TypeScript, Elixir, and undo work.
- Added Tracker and Phase 4 regression cases for grouped commands.
- Defined one normalized `calls[]` command shape for single calls and groups.
- Defined per-member ID streams, a 128-member cap, whole-group outcomes, and grouped undo rules.

**Validation**

| Command or build | Environment | Result |
|---|---|---|
| Source requirement and current mutation-path review | Local worktree | Passed |
| Markdown whitespace and local-link checks | Local worktree | Passed |

**Decisions**

- Wheel provides the generic three-row conformance case.
- The editor library provides the Tiptap integration case.
- Phase 0B remains ready because its proof contract now includes grouped commands.

**Blockers**

- None for Phase 0B. Phase 1B starts only after Phases 0B and 1 pass.

**Exit gate:** Pending. No mutation-group implementation has started.

### 2026-08-30: Prepare the Wheel materializer proof

**State:** Ready

**Changes**

- Removed `@tanstack/db` from `packages/wheel/package.json` and `bun.lockb`.
- Removed the Phase 0A adapter and characterization tests.
- Added the TanStack deficiency findings and Wheel ownership decision to the phase plan.
- Added the Phase 0B boundary, scenarios, measurements, and exit gate.
- Revised Phases 2, 4, and 6 to use the Wheel materializer.

**Validation**

| Command or build | Environment | Result |
|---|---|---|
| `bun install` | Local worktree | Passed: no dependency changes |
| Active package and source TanStack reference search | Local worktree | Passed: no dependency or import |
| Markdown whitespace and local-link checks | Local worktree | Passed |
| `bun run typecheck` | Local worktree | Passed |
| `bun run lint` | Local worktree | Passed |
| `bun run test:unit:node -- packages/wheel/src/sync/server/engine.test.ts packages/wheel/src/sync/client/outbox.test.ts packages/wheel/src/sync/client/rebase-errors.test.ts packages/wheel/src/sync/client/reconnect.test.ts packages/wheel/src/sync/sync-service.test.ts` | Local Node | Passed: 5 files and 36 tests |

**Decisions**

- Keep Phase 0B internal until its proof gate passes.
- Use the current `SyncClient` as the behavior oracle for the standalone proof.
- Add no runtime dependency and copy no external implementation.

**Blockers**

- None. Phase 0B awaits approval to start.

**Exit gate:** Pending. The Phase 0B implementation has not started.

### 2026-08-30: Phase 0 reaches a blocked gate

**State:** Blocked

**Changes**

- Pinned `@tanstack/db@0.8.6` and updated `bun.lockb`.
- Added one internal adapter proof. Production `SyncClient` state and public exports are unchanged.
- Added entity, membership, query status, joined result, optimistic action, rollback, and orphan
  probes.

**Validation**

| Command or build | Environment | Result |
|---|---|---|
| `bun run test:unit:node -- packages/wheel/src/sync/client/tanstack-adapter.test.ts` | Local Node | Passed: 9 tests |
| Targeted adapter and existing sync tests | Local Node | Passed: 6 files and 45 tests |
| `bun run typecheck` | Local worktree | Passed |
| `bun run lint` | Local worktree | Passed |

The passing proof covers:

- One entity and membership insert produces one joined result.
- Query status survives an empty result.
- Inserted membership writes can move during re-execution.
- One action writes two collections and confirms through sync receipts.
- Rollback and explicit orphan handling remove all optimistic writes.

The proof uses `createCollection`, `SyncConfig` controls, `createLiveQueryCollection`,
`BasicIndex`, `eq`, `createTransaction`, and documented `Transaction` members. It imports no
TanStack internal module.

The characterization tests prove these blockers:

- Updating an entity used by a joined membership query throws
  `Query contributors with the same row key are not congruent`.
- The error occurs through an explicit transaction and through normal per-collection sync.
- A remote update under a pending local update leaves the public row view optimistic and leaves
  `transaction.mutations[0].original` at the old confirmed value.
- Replacing an optimistic delete with no delete requires a `delete-insert` merge, which the public
  transaction API rejects.

**Decisions**

- Do not move client ownership to the direct normalized collection model in the current plan.
- Revise Phases 2 and 4 before they start.
- Phase 1 can proceed because its protocol and server fixes do not depend on TanStack ownership.

**Blockers**

- Choose and prove a model that owns confirmed state separately, replays complete Wheel commands,
  and publishes joined results after one Wheel batch boundary.

**Exit gate:** Failed. The direct model does not preserve atomic joined updates or general
re-execution with public TanStack APIs.

### 2026-08-30: Start Phase 0

**State:** In progress

**Changes**

- Started the TanStack behavior proof.

**Validation**

- Pending.

**Decisions**

- Keep the proof outside production client ownership until its exit gate passes.

**Blockers**

- None.

**Exit gate:** Pending.

### Entry template

```markdown
### YYYY-MM-DD: Phase N, short result

**State:** Ready | In progress | Blocked | Complete

**Changes**

- Concrete code or contract change.

**Validation**

| Command or build | Environment | Result |
|---|---|---|
| `bun run ...` | Local SQLite | Passed: N tests |

**Decisions**

- Decision and reason, or `None`.

**Blockers**

- Blocking fact and required next action, or `None`.

**Exit gate:** Passed | Failed. State the reason.
```

### 2026-08-30: Record the phase plan

**State:** Not started

**Changes**

- Added the phased implementation plan and this validation record.
- Recorded the pre-implementation test baseline.

**Validation**

| Check | Environment | Result |
|---|---|---|
| Markdown structure review | Local worktree | Passed |

**Decisions**

- Phase 7 remains deferred until multi-node support enters scope.

**Blockers**

- None.

**Exit gate:** Not applicable. Implementation has not started.
