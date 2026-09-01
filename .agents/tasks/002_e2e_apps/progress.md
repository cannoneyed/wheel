# Real-world e2e app portfolio progress

Validation record for [`plan.md`](plan.md). Every phase records its commands, environment,
behavior IDs, and results here before the next phase starts.

## Contents

- [Status](#status)
- [Validation record rules](#validation-record-rules)
- [Gate checklist](#gate-checklist)
- [Decision log](#decision-log)
- [Wheel library changes](#wheel-library-changes)
- [Work log](#work-log)

## Status

| Phase | Size | State | Gate |
|---|---:|---|---|
| 1. Axle Durable Object browser leg | `S` | Complete | [Build 142](https://buildkite.com/cannoneyed/wheel/builds/142) |
| 2. Behavior catalog and multi-client harness | `M` | In progress | — |
| 3. Rounds app and durability behaviors | `L` | Not started | — |
| 4. Rounds upgrade and restart configurations | `M` | Not started | — |
| 5. Promote the editor into Chalk | `L` | Not started | — |
| 6. Spoke app and authorization behaviors | `L` | Not started | — |
| 7. Spoke backend configurations | `L` | Not started | — |
| 8. Runtime coverage gate and CI matrix | `M` | Not started | — |

Allowed phase states are `Not started`, `Ready`, `In progress`, `Blocked`, and `Complete`.
Only one phase may be `In progress`.

## Validation record rules

1. Record each command, its environment, and its result.
2. Use `local` or a Buildkite build link as the environment.
3. Record the behavior IDs proven by each phase.
4. Record a cross-backend failure as an issue. Do not fork the behavior spec.
5. Record each `solo.yml` change and whether the human Sync happened.
6. Use absolute dates.

## Gate checklist

### Phase 1

- [x] `TRACKER_BROWSER_BACKEND=do` runs the unchanged Axle smoke spec against `wrangler dev`.
- [x] Worker demo seeding is confirmed or added.
- [x] `test:browser:tracker:all` covers SQLite, Postgres, and Durable Objects.
- [x] The Buildkite Durable Object browser step is green and linked.

### Phase 2

- [x] `test/behaviors/catalog.ts` matches all 32 rows in the plan.
- [x] `scripts/behavior-coverage.ts --check` runs in `check:static`.
- [x] Static coverage and runtime pass coverage are kept distinct.
- [x] The shared separate-context helper extends `wheel/testing/playwright`.
- [x] Axle proves `conv-basic` and `conv-overlap` on SQLite.
- [x] Peer convergence assertions do not use `settle()` as proof of delivery.

### Phase 3

- [ ] `packages/rounds` follows Axle's package, sync, seed, and Playwright patterns.
- [ ] Rounds uses Bun and SQLite only.
- [ ] The test-only server supports restart, storage reset, and one-shot query failure.
- [ ] The external controller survives server restarts and waits for readiness.
- [ ] A lint rule blocks production imports from browser support and the controller.
- [ ] All Phase 3 behavior IDs pass on SQLite.
- [ ] The Buildkite Rounds SQLite step is green and linked.

### Phase 4

- [ ] Contract B is generated from source and never hand-written.
- [ ] `contract-retire`, `contract-outbox`, and `contract-reload` pass.
- [ ] `dur-epoch` passes with preserved browser storage and reset server storage.
- [ ] The upgrade suite is excluded from the default Rounds browser command.

### Phase 5

- [ ] Chalk owns the editor implementation; the demos route is a thin host.
- [ ] No copied editor implementation remains.
- [ ] Chalk supports documents, metadata, comments, save state, and the planned groups.
- [ ] All Chalk primary behavior IDs pass on SQLite.
- [ ] The same Chalk spec files pass on Durable Objects in the nightly leg.
- [ ] The bridge proves order-only changes without a row-value change.

### Phase 6

- [ ] Spoke contains two workspaces and principals with different private visibility.
- [ ] Aggregate, authorization, and presence behavior IDs pass on SQLite.
- [ ] `externalWrite` is exposed by the smallest test or bot endpoint needed for Phase 7.

### Phase 7

- [ ] The same Spoke spec files run on Durable Objects and Postgres.
- [ ] `ws-isolation` passes on Durable Objects.
- [ ] `conv-external` passes on Postgres.
- [ ] The two-node script starts one Postgres service and two Elixir nodes on explicit ports.
- [ ] `node-delivery` and `node-recovery` pass.
- [ ] The Elixir test-only path writes one durable log row without sending a notification.
- [ ] Existing forced hibernation and stale-attachment worker tests remain required.
- [ ] Deployed `ws-hibernate` is recorded as pass, fail, or unrun stretch work.

### Phase 8

- [ ] Static coverage proves 31 required primary tags and their CI legs exist.
- [ ] Playwright JSON results prove all 31 required primary tests passed.
- [ ] Missing, skipped, failed, or duplicate required proofs fail aggregation.
- [ ] Pull-request and nightly paths stay separate.
- [ ] The pull-request path remains near the two-minute soft target.
- [ ] Docs describe the apps, primary proofs, backend legs, and stretch hibernation proof.

## Decision log

Record dated decisions that change the plan. Update the plan in the same change.

- 2026-08-31: Use multiple apps to force realistic Wheel shapes, not to repeat every test on
  every backend.
- 2026-08-31: Give each behavior one primary browser proof. Run unchanged app suites on other
  backends only for backend or sync risks.
- 2026-08-31: Keep deployed Durable Object hibernation as a stretch browser proof. Keep forced
  worker hibernation tests required.
- 2026-08-31: Give Rounds an external test controller. It owns restart, storage reset, and
  one-shot query failure while Playwright owns browser network faults.
- 2026-08-31: Build Rounds on Bun and SQLite only. Its extra backends would not answer a new
  question.
- 2026-08-31: Promote the existing demos editor into Chalk. Chalk becomes the source of truth,
  and the demos route becomes a thin host.
- 2026-08-31: Add documents, metadata, comments, save state, and real mutation groups to Chalk.
  Defer version history, mentions, attachments, access controls, and publishing.
- 2026-08-31: Give Chalk a nightly Durable Object leg because groups and ordering cross a
  distinct transaction and storage backend.
- 2026-08-31: Treat the two-minute CI figure as a soft target. Move backend variants to nightly
  before extending the required path.
- 2026-08-31: Do not tag the single-client Tracker smoke as `conv-basic`. Phase 2 adds the real
  two-client proof and runs it on SQLite and Durable Objects.

## Wheel library changes

Record each framework or tooling change discovered while an app proves a behavior. Keep app-only
changes out of this table.

| Phase | Finding | Wheel change | State |
|---|---|---|---|
| 2 | Separate Playwright contexts needed repeated page and driver wiring. | Added the structurally typed `openWheelClients` helper to `wheel/testing/playwright`. | Complete locally; CI pending. |
| 2 | Query release is not visible through component state or row output alone. | Added the read-only `subscriptions()` bridge and driver method. | Complete locally; CI pending. |
| 2 | Preview builds remove the debug bridge, but browser proofs need it while deployed artifacts must not expose it. | Added `wheelDevTools({ devModeInBuild: true })` for test builds and restored a normal Tracker build before CI artifact upload. | Complete locally; CI pending. |
| 1 | Workerd rejects runtime data exported from a Worker entry, but TypeScript and Wrangler's dry run accept it. | Added `wheel/no-worker-data-exports`, its Linter API proof, repository wiring, and lint docs. | Complete in [Build 142](https://buildkite.com/cannoneyed/wheel/builds/142). |

## Work log

Newest entry first.

### 2026-08-31: Phase 2, local behavior coverage and multi-client proof

- Commands: `bun scripts/behavior-coverage.ts --check`; targeted Vitest suites; `bun run
  typecheck`; `bun run lint`; `bun run test:browser:tracker:sqlite`; `bun run
  test:browser:tracker:do`.
- Environment: local.
- Behaviors proven: `conv-basic`, `conv-overlap`.
- Result: the catalog reports 31 required rows and one stretch row. Both separate-context
  proofs pass in the five-test SQLite and Durable Object suites. Typecheck, lint, and 37
  targeted tests pass.
- Follow-ups: run and link the full Buildkite phase gate.

### 2026-08-31: Phase 1, local Durable Object browser leg

- Commands: `bun run typecheck`; `bun run lint`; `bun run test`; `bun run test:cloudflare`;
  `bun run test:browser:tracker:do`; `node node_modules/wrangler/bin/wrangler.js deploy
  --dry-run --config wrangler.tracker.jsonc`.
- Environment: local and [Buildkite build 142](https://buildkite.com/cannoneyed/wheel/builds/142).
- Behaviors proven: backend risk leg only; `conv-basic` waits for the Phase 2 two-client proof.
- Result: all 3 Tracker browser tests, 2,707 unit tests, 27 Cloudflare tests, typecheck, lint, and
  the Worker dry run pass. The Durable Object job finished in 29 seconds and did not extend the
  critical path. The full build passed in 134 seconds; the existing Postgres and deploy jobs
  remained the path.
- Follow-ups: Phase 2.

### Entry template

```markdown
### YYYY-MM-DD: Phase N, short result

- Commands: ...
- Environment: local | Buildkite <link>
- Behaviors proven: ...
- Result: ...
- Follow-ups: ...
```
