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
| 2. Build Tracker proof slice | `L` | Not started | Differential checks not run |
| 3. Add Elixir grouping and external writes | `M` | Not started | PostgreSQL checks not run |
| 4. Move client state ownership | `L` | Not started | Ownership checks not run |
| 5. Expand query and source contracts | `L` | Not started | Contract checks not run |
| 6. Rename APIs and enforce boundary | `M` | Not started | Final local and CI checks not run |
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

- [ ] Pass overlapping query membership tests.
- [ ] Pass release and entity collection tests.
- [ ] Pass empty-result status tests.
- [ ] Pass server order tests.
- [ ] Pass aggregate and multi-collection action tests.
- [ ] Pass the three-issue grouped update and grouped undo test.
- [ ] Pass current-client and materializer differential tests.
- [ ] Confirm no intermediate query result is observable.

### Phase 3

- [ ] Prove one execution for each matching Elixir query group.
- [ ] Prove principals cannot share grouped results.
- [ ] Pass isolated group failure tests.
- [ ] Pass external-write rollback tests.
- [ ] Pass external-write log and delta tests.
- [ ] Pass external-write checkpoint tests.

### Phase 4

- [ ] Pass pending-command reload tests.
- [ ] Pass acknowledgement-before-checkpoint reconnect tests.
- [ ] Pass server sequence reset tests.
- [ ] Pass unchanged mutation tests.
- [ ] Pass rejection, rebase, and orphan tests.
- [ ] Pass multi-collection undo and redo tests.
- [ ] Pass grouped reload, rebase, rollback, orphan, undo, and redo tests.
- [ ] Pass state-machine fuzz tests.
- [ ] Remove duplicate base, effective, and order state from `SyncClient`.

### Phase 5

- [ ] Pass schema contract fixtures against TypeScript and Elixir.
- [ ] Pass the query dependency auditor.
- [ ] Pass external source start and cleanup tests.
- [ ] Pass source invalidation protocol tests.
- [ ] Pass supported and rejected pushdown tests.
- [ ] Confirm each dependency list has one owner.

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
| 2026-08-30 | 0B | Keep the materializer proof internal | The standalone core passed its gate, but production ownership moves only in Phase 4. |

## Work log

Add new entries at the top of this section. Keep prior entries unchanged.

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
