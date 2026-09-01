# Real-world e2e app portfolio plan

This plan adds browser proof for the sync guarantees shipped in Wheel 0.2. Three real-world
apps exercise different state shapes: Rounds for client durability, Chalk for collaborative
documents, and Spoke for principals, workspaces, and multiple server nodes.

Each required catalog behavior needs one primary browser proof. Complete app suites run on another
backend only when that backend changes the behavior under test. Each phase records its checks
in [`progress.md`](progress.md) before the next phase starts. Phase sizes use
`001_upgrades` Phase 1 as the `M` reference.

## Contents

- [Coverage gaps](#coverage-gaps)
- [Delivery rules](#delivery-rules)
- [Fixed design choices](#fixed-design-choices)
- [Backend browser legs](#backend-browser-legs)
- [The app portfolio](#the-app-portfolio)
- [The behavior catalog](#the-behavior-catalog)
- [Ports](#ports)
- [Phase 1: Add the Durable Object browser leg for Axle](#phase-1-add-the-durable-object-browser-leg-for-axle)
- [Phase 2: Build the catalog and multi-client harness](#phase-2-build-the-catalog-and-multi-client-harness)
- [Phase 3: Build Rounds and its durability behaviors](#phase-3-build-rounds-and-its-durability-behaviors)
- [Phase 4: Add the Rounds upgrade and restart configurations](#phase-4-add-the-rounds-upgrade-and-restart-configurations)
- [Phase 5: Promote the editor into Chalk](#phase-5-promote-the-editor-into-chalk)
- [Phase 6: Build Spoke and its authorization behaviors](#phase-6-build-spoke-and-its-authorization-behaviors)
- [Phase 7: Add the Spoke backend configurations](#phase-7-add-the-spoke-backend-configurations)
- [Phase 8: Add the runtime coverage gate and CI matrix](#phase-8-add-the-runtime-coverage-gate-and-ci-matrix)
- [Final validation](#final-validation)

## Coverage gaps

Four gaps remain after Wheel 0.2.

1. The Cloudflare Durable Object backend has worker and backend tests, but Axle never runs
   against it in a browser.
2. Axle has no two-context browser test. The demos contain multi-page patterns, but they do
   not exercise separate storage, sessions, or principals.
3. Browser coverage is uneven. Tracker already proves snapshot retirement and stable-outbox
   replay, and the Cloudflare worker tests force hibernation and stale-attachment refusal.
   Mutation groups, query status, checkpoint timing, pending-preview restore, and multi-node
   delivery still lack a real-app browser proof.
4. No app-level browser test proves principal or workspace isolation.

The apps are test vehicles and product examples. A feature belongs in an app when it makes
the scenario credible. A reusable runtime gap belongs in Wheel. Artificial failures and
process control remain test-only.

## Delivery rules

1. Mark one phase `In progress` in [`progress.md`](progress.md).
2. Add or update tests with each behavior change.
3. Run the phase checks and record the command, environment, and result.
4. Resolve every required exit condition before starting the next phase.
5. Run browser checks in Buildkite unless local browser work is needed to debug that phase.
6. The two-minute CI figure is a soft target. Add parallel or nightly legs before extending
   the required path.
7. Remove replaced code. Do not add compatibility aliases or fallback paths.
8. Add a lint rule in the same phase when static analysis can prevent the failure.
9. Machine-run processes use explicit ports from `scripts/test-ports.ts`. They never resolve
   portless routes.
10. Changes to `solo.yml` need a human to click **Sync** in Solo. Batch and record them.
11. A backend difference creates an issue or a shared fix, never a forked app behavior spec.

## Fixed design choices

| Choice | Rule |
|---|---|
| Primary proof | Every required catalog behavior has one passing browser test in its named app and backend. |
| Backend risk | An app's unchanged browser suite runs on an additional backend only when the backend changes routing, transactions, authentication, storage, or delivery. |
| Existing test code | Extend `wheel/testing/playwright`, the demos behavior-ID checks, and current multi-page patterns. Do not create a second general Playwright framework. |
| Test surface | Assert user-visible state through `data-testid` and engine state through `window.__wheel` and `wheelDriver`. Add the smallest read-only bridge field when a behavior cannot otherwise be observed. |
| Convergence | `settle()` proves only that one client is connected with no pending command. Peer convergence uses a retried assertion for the expected row, sequence, query state, or DOM result. |
| Multi-client | A shared fixture opens separate browser contexts against one server and gives each page a `wheelDriver`. Separate contexts isolate IndexedDB, local storage, and sessions. |
| Browser faults | Use Playwright's native offline and WebSocket routing APIs for disconnects, dropped frames, and reconnects. |
| Server faults | Rounds owns a test-only server and an external controller. The controller survives child-server restarts and waits for readiness. |
| Production boundary | Production server and worker entries cannot import browser support or test controllers. A lint rule enforces the boundary. Runtime environment checks are not the boundary. |
| App structure | New apps follow Axle's sync module, server module, generated contract, seed, browser spec, and Playwright config conventions. |
| Server sharing | Bun and Cloudflare entries share TypeScript domain bindings. Elixir is a second implementation only where its behavior is under test. |
| Workspaces | Spoke routes one workspace to one Durable Object and one Elixir workspace process. Rounds and Chalk use one workspace per test server. |
| Hibernation | Existing forced-eviction worker tests remain required. A deployed browser hibernation run is a stretch goal because `wrangler dev` does not evict the object from memory. |
| CI results | Static checks prove that catalog tags and jobs exist. Playwright JSON results prove that tagged tests passed. |

## Backend browser legs

| App | Backend | Path | Reason |
|---|---|---|---|
| Axle | Bun/SQLite | Required | Existing real-app baseline. |
| Axle | Elixir/Postgres | Required | Existing second server implementation. |
| Axle | Durable Object | Required | First browser-to-DO route, asset, seed, socket, and SQLite proof. |
| Rounds | Bun/SQLite | Required | Client durability and controlled process failure need one deterministic server. |
| Chalk | Bun/SQLite | Required | Primary group, ordering, save-state, comment, and presence proof. |
| Chalk | Durable Object | Nightly | Atomic group transactions and server-owned ordering cross a different storage backend. |
| Spoke | Bun/SQLite | Required | Primary principal, workspace, aggregate, external-write, and presence proof. |
| Spoke | Durable Object | Nightly | Workspace-to-object routing and isolation are backend behavior. |
| Spoke | Elixir/Postgres | Nightly | Principal grouping and external writes use a second server implementation. |
| Spoke | Two Elixir nodes | Nightly | Notification delivery and durable-log recovery require two nodes. |

Rounds has no DO worker or Elixir server. Its required behaviors are client and protocol
behaviors already covered across backends by conformance and wire tests. Chalk has no Elixir
server because mutation-group protocol parity already runs through the shared Elixir wire
fixtures.

## The app portfolio

### Rounds — offline inspections

Rounds has a small UI and a server designed to restart. Its domain makes pending edits,
rejection, orphaning, reload, and query status visible without unrelated product code.

- Collections: `sites`, `checklists`, `items`; derived `site_progress`.
- Queries: `sites.all`, `checklists.bySite`, `items.byChecklist`, `site_progress.all`.
- Mutations: `item.setStatus`, `item.setNote`, `checklist.complete`, `site.archive`.
- UI state: per-query status and one connection/save indicator.

`checklist.complete` groups the remaining item updates with the checklist status change.
`site.archive` can orphan a field worker's pending item edit.

### Chalk — collaborative documents

Chalk promotes the demos Tiptap editor into a document workflow. It is the source of truth
for the editor implementation; the demos route becomes a thin host for one seeded document.
No copied editor implementation remains.

- Collections: `docs`, `blocks`, `comments`; derived `doc_summaries`.
- Queries: `docs.all`, `docs.recent`, `blocks.byDoc`, `comments.byDoc`,
  `doc_summaries.all`.
- Mutations: document metadata and archive actions; block insert, update, move, and delete;
  comment add, reanchor, resolve, and delete.
- Groups: commented-block split and merge, plus multi-block indent and move.
- Presence: caret, selection, typing preview, and active document.
- UI state: `Saving`, `Saved locally`, and `Saved` based on connection, pending commands,
  and checkpoints.

A commented-block split updates the original block, inserts the new block, reanchors affected
comments, and advances document metadata as one group. A peer sees one publication, and one
undo restores the complete prior state.

Version history, mentions, attachments, access controls, publishing workflows, and rich
comment threads are outside this plan. Add one only when it proves a missing Wheel behavior.

### Spoke — workspace chat

Spoke exercises append-heavy streams, several workspaces, and principal-dependent results.

- Collections: `members`, `channels`, `messages`, `channel_reads`; derived
  `unread_counts`.
- Queries: `channels.forMember`, `messages.byChannel`, `unread.forMember`.
- Mutations: `message.send`, `message.edit`, `message.delete`, `channel.create`,
  `channel.join`, `reads.mark`.
- Presence: online members and typing state per channel.
- External writer: a bot endpoint writes through `externalWrite`.

The seed contains two workspaces and principals with different private-channel visibility.

## The behavior catalog

`test/behaviors/catalog.ts` becomes the machine-readable source of truth. Each entry records
its stable ID, description, primary app, primary backend, and whether it is required or a
stretch goal.

| ID | Behavior | Primary browser proof |
|---|---|---|
| `conv-basic` | A mutation from client A reaches client B without reload. | Axle / SQLite |
| `conv-order-only` | An order-only server change updates every client. | Chalk / SQLite |
| `conv-overlap` | Releasing one of two overlapping queries keeps rows claimed by the other. | Axle / SQLite |
| `conv-aggregate` | A derived aggregate updates when a contributing row changes. | Spoke / SQLite |
| `conv-external` | An `externalWrite` converges on every client. | Spoke / Postgres |
| `conv-empty` | An empty query result keeps its scope and status. | Rounds / SQLite |
| `cmd-optimistic` | An optimistic write renders before server confirmation. | Rounds / SQLite |
| `cmd-group-atomic` | A group publishes once locally and reaches a peer as one change. | Chalk / SQLite |
| `cmd-group-undo` | A group undoes as one entry in reverse member order. | Chalk / SQLite |
| `cmd-reject` | A business rejection removes optimistic changes and restores confirmed rows. | Rounds / SQLite |
| `cmd-orphan` | A peer-deleted target orphans the command without partial writes. | Rounds / SQLite |
| `cmd-rebase` | A pending command re-executes when a peer changes its base state. | Chalk / SQLite |
| `cmd-undo-redo` | Undo and redo work under concurrent peer edits. | Chalk / SQLite |
| `dur-preview` | A pending optimistic preview restores after reload before confirmed rows load. | Rounds / SQLite |
| `dur-outbox` | An offline mutation survives reload and delivers exactly once. | Rounds / SQLite |
| `dur-generation` | A disconnect after acknowledgement but before checkpoint does not lose the command. | Rounds / SQLite |
| `dur-checkpoint` | An unchanged mutation clears after its checkpoint. | Rounds / SQLite |
| `dur-epoch` | A server restart with a reset sequence does not strand the client. | Rounds / SQLite |
| `contract-retire` | A new row fingerprint retires old snapshots without loading stale rows. | Rounds / SQLite |
| `contract-outbox` | The outbox survives a fingerprint change and replays through validation. | Rounds / SQLite |
| `contract-reload` | An old open client reloads once for a new fingerprint without looping. | Rounds / SQLite |
| `status-error` | An initial query failure surfaces as `error`. | Rounds / SQLite |
| `status-stale` | A rerun failure keeps valid rows and surfaces `stale`. | Rounds / SQLite |
| `status-live` | A later successful rerun returns the query to `live`. | Rounds / SQLite |
| `auth-visibility` | A principal never receives another principal's private rows. | Spoke / SQLite |
| `auth-grouping` | Identical query names from different principals never share one result. | Spoke / SQLite |
| `ws-isolation` | Two workspaces never leak rows or presence. | Spoke / DO |
| `ws-hibernate` | A deployed DO hibernates and resumes its existing browser socket. | Spoke / deployed DO, stretch |
| `node-delivery` | Clients on two server nodes see the same mutation. | Spoke / two-node Postgres |
| `node-recovery` | A node that misses a notification recovers from the sync log. | Spoke / two-node Postgres |
| `presence-live` | Presence appears, updates, and clears on leave. | Spoke / SQLite |
| `presence-ephemeral` | Presence never survives reload as stored data. | Chalk / SQLite |

The catalog contains 31 required browser proofs and one stretch proof. Specs use
`@behavior:<id>` tags in their Playwright titles. Existing demos behavior IDs remain the
domain-spec identity; the Wheel behavior tag is a second, cross-app coverage label.

Static coverage checks fail on unknown tags, duplicate primary assignments, missing required
proofs, and catalog jobs with no CI leg. Runtime coverage joins Playwright JSON results by app,
backend, and tag. A source scan never claims that a test passed.

## Ports

Each human process claims a dev port. Its machine-run counterpart uses dev + 100. The Rounds
controller is machine-only and owns a separate test port.

| Process | Dev | Test |
|---|---:|---:|
| Axle on the DO (`wrangler dev`) | 4810 | 4910 |
| Rounds sync | 4802 | 4902 |
| Rounds preview | 4803 | 4903 |
| Chalk sync | 4804 | 4904 |
| Chalk preview | 4805 | 4905 |
| Spoke sync | 4806 | 4906 |
| Spoke preview | 4807 | 4907 |
| Spoke sync, second node | 4808 | 4908 |
| Rounds test controller | — | 4909 |

Elixir containers publish random host ports in CI and pass explicit `_SYNC_ORIGIN` values,
following `scripts/ci/test-elixir-backends.sh`.

## Phase 1: Add the Durable Object browser leg for Axle

**Size:** `S`

The current worker already serves Tracker assets, seeds the demo workspace, and restores
hibernated sockets. This phase points the existing Axle suite at it.

### Changes

1. Accept `do` in `TRACKER_BROWSER_BACKEND`.
2. Start `wrangler dev --config wrangler.tracker.jsonc` on the claimed test port after the
   Tracker build. The worker origin is both `baseURL` and sync origin.
3. Add `test:browser:tracker:do` and extend `test:browser:tracker:all`.
4. Add a parallel `check-browser-apps-do` Buildkite step.
5. Keep `conv-basic` off the single-client smoke. Phase 2 adds the real two-client proof and
   runs that same spec against the DO risk leg.

### Validation

- The existing Axle spec file passes unchanged against `wrangler dev`.
- The worker serves assets, seed data, and WebSocket traffic from one explicit origin.
- A wrong route or occupied port fails before the test runs.

### Exit gate

Axle runs its unchanged browser suite on SQLite, Postgres, and DO. The DO build link is
recorded in `progress.md`.

## Phase 2: Build the catalog and multi-client harness

**Size:** `M`

This phase extends current test infrastructure. It adds no server fault API and no new app.

### Changes

1. Add `test/behaviors/catalog.ts` with the 32 entries above, their primary proofs, phase
   deferrals, and stretch status.
2. Add `scripts/behavior-coverage.ts` for the cross-app tags. Reuse the scanning rules from
   the demos reverse-coverage test: literal IDs, known catalog rows, and one primary proof.
3. Wire the static catalog check into `check:static`. Keep the existing demos behavior-ID
   lint and spec coverage checks as their domain contract.
4. Extend `wheel/testing/playwright` with a structurally typed helper that opens separate
   browser contexts and returns a page and `wheelDriver` for each client.
5. Add a two-context Axle proof for `conv-basic` and `conv-overlap` on SQLite.
6. Use Playwright's native context offline and WebSocket routing APIs. Do not add another
   network-fault wrapper.
7. Add a read-only bridge field only if the overlap result cannot be proved through existing
   service state and DOM output.

### Validation

- Unknown and missing required behavior tags fail the static check.
- The catalog reports existing Tracker and demos proofs without relabeling them as new work.
- Client A changes a row and a retried assertion observes the expected result on client B.
- Releasing one overlapping query keeps the shared row visible through the other query.
- No peer-delivery assertion treats `settle()` as convergence.

### Exit gate

The catalog, static check, separate-context helper, and two Axle proofs pass on SQLite.

## Phase 3: Build Rounds and its durability behaviors

**Size:** `L`

Rounds runs on Bun/SQLite. Its browser support owns controlled server failure without adding
fault routes to Wheel or production app entries.

### Changes

1. Add `packages/rounds` with sync modules, Bun server, generated schema and fingerprint,
   deterministic seed, minimal UI, browser specs, and Playwright config.
2. Add per-query status and connection/save output to the UI.
3. Add `packages/rounds/browser/support/test-server.ts`. It imports the production domain
   bindings, wraps named queries for one-shot failure, and exposes loopback-only test control.
4. Add `packages/rounds/browser/support/server-controller.ts`. It owns the child server,
   temporary SQLite files, restart generation, and readiness wait.
5. Give the controller four operations: `restart({ storage: 'preserve' })`,
   `restart({ storage: 'reset' })`, `failQueryOnce(name)`, and `clearFaults()`.
6. Add an import-boundary lint rule that blocks production server and worker entries from
   importing browser support.
7. Write the primary SQLite proofs for `cmd-optimistic`, `cmd-reject`, `cmd-orphan`,
   `conv-empty`, `dur-preview`, `dur-outbox`, `dur-generation`, `dur-checkpoint`,
   `status-error`, `status-stale`, and `status-live`.
8. Use WebSocket routing for acknowledgement-before-checkpoint disconnects. Use the
   controller only for process and query faults.
9. Add schema, fingerprint, typecheck, browser, CI, and `solo.yml` entries.

### Validation

- `dur-outbox` goes offline, mutates, reloads, reconnects, and reaches a second client once.
- `dur-generation` closes the routed WebSocket between acknowledgement and checkpoint, then
  reconnects with the command intact.
- `status-stale` keeps rows visible after one failed rerun and later returns to `live`.
- A production Rounds build contains no control routes or controller imports.
- Every required Phase 3 tag has one passing SQLite browser result.

### Exit gate

Rounds passes its required SQLite behaviors. The controller is proven without a production
fault surface.

## Phase 4: Add the Rounds upgrade and restart configurations

**Size:** `M`

This phase uses the Phase 3 controller for behaviors that need two builds or a new server
epoch.

### Changes

1. Build Rounds contract A and a test-only contract B with one generated row-field change
   into separate output directories.
2. Load A, persist a snapshot and offline outbox, then serve B with its matching generated
   fingerprint.
3. Add `contract-retire`, `contract-outbox`, and `contract-reload` browser proofs.
4. Add `dur-epoch` by restarting the child with `storage: 'reset'`. A fresh seeded SQLite
   file resets server sequence without deleting the browser outbox.
5. Add `test:browser:rounds:upgrade`, excluded from the default PR suite and included in the
   nightly matrix.
6. Reuse `scripts/generate-row-fingerprints.ts`; do not hand-write contract B.

### Validation

- Contract-A rows never materialize under contract B.
- The outbox survives the fingerprint change and drains after validation.
- An old open client reloads once; an inconsistent deployment does not loop.
- A reset server epoch leaves both clients converged with no stranded command.

### Exit gate

The four Phase 4 browser proofs pass on SQLite in Buildkite.

## Phase 5: Promote the editor into Chalk

**Size:** `L`

Chalk owns one editor implementation. The move lands before document features so the demos
suite proves that promotion did not change current behavior.

### Changes

1. Move the demos editor's Tiptap schema, gesture handling, markdown conversion, projection,
   presence decorations, service, sync declarations, and server bindings into
   `packages/chalk`.
2. Make the demos package depend on private workspace package `wheel-chalk` and mount one
   seeded document through Chalk's editor entry. Keep the demos behavior specs green.
3. Add `docs`, document-scoped `blocks`, `comments`, and derived `doc_summaries`.
4. Add document navigation, title/icon/status metadata, anchored comments, and the three-state
   save indicator.
5. Implement commented-block split and merge plus multi-block indent and move with
   `mutateGroup` over existing invertible mutations.
6. Add a bounded read-only publication trace to the debug bridge if one-publication behavior
   cannot be observed through the current bridge. Record revision and changed collections,
   not row copies.
7. Add Chalk's Bun server, DO worker, generated files, deterministic seed, Playwright config,
   scripts, and `solo.yml` entries.
8. Write the SQLite primary proofs for `cmd-group-atomic`, `cmd-group-undo`, `cmd-rebase`,
   `cmd-undo-redo`, `conv-order-only`, and `presence-ephemeral`. Add a Chalk variant of
   `cmd-orphan` without changing its primary assignment.
9. Run the unchanged Chalk spec files against DO as a nightly backend-risk leg.

### Validation

- The demos editor has no copied Tiptap or sync implementation and keeps its existing
  behavior coverage.
- A commented-block split produces one local publication and one peer-visible change.
- Group undo restores blocks, comments, and document metadata in one step.
- Server-owned order changes reorder the peer without changing row values.
- `Saving`, `Saved locally`, and `Saved` follow pending, connection, and checkpoint state.
- Presence clears on leave and does not load as stored data after reload.
- The complete Chalk suite passes on SQLite and DO.

### Exit gate

Chalk owns the promoted editor, document workflow, and six primary browser proofs. Its full
suite passes on both TypeScript backends.

## Phase 6: Build Spoke and its authorization behaviors

**Size:** `L`

This phase builds the domain on Bun/SQLite before adding backend configurations.

### Changes

1. Add `packages/spoke` with sync modules, Bun server, generated files, deterministic seed,
   browser specs, and Playwright config.
2. Seed two workspaces and three principals with different public and private channel access.
3. Implement principal-scoped channels, ordered message slices, unread aggregates, reads,
   the bot external-write endpoint, online members, and typing presence.
4. Use separate browser contexts for each principal and workspace.
5. Write the SQLite primary proofs for `auth-visibility`, `auth-grouping`,
   `conv-aggregate`, and `presence-live`. Run `conv-external` here as an additional proof;
   its primary proof lands on Postgres in Phase 7.
6. Prove workspace isolation on SQLite as an additional check; the primary DO proof lands in
   Phase 7.
7. Add root scripts, the Spoke SQLite CI step, and `solo.yml` entries.

### Validation

- A private channel never reaches a non-member's query rows, bridge collections, or presence.
- Two principals with the same query name receive different permitted rows.
- Unread counts update after a peer or bot message and clear after `reads.mark`.
- Workspace two receives none of workspace one's rows or presence.

### Exit gate

Spoke passes its SQLite authorization, aggregate, external-write, workspace, and presence
suite.

## Phase 7: Add the Spoke backend configurations

**Size:** `L`

This phase adds the backends whose routing and delivery behavior need browser proof.

### Changes

1. Add `cloudflare/spoke-worker.ts` and `wrangler.spoke.jsonc`. Route the authenticated
   workspace to one named Durable Object.
2. Run the unchanged Spoke suite against DO. `ws-isolation` is the required primary proof for
   this leg.
3. Add `elixir/spoke` on `wheel_sync`, including the bot endpoint through the Elixir external
   write API.
4. Run the unchanged Spoke suite against Elixir/Postgres. `conv-external` is the required
   primary proof for this leg.
5. Add `scripts/ci/test-spoke-multinode.sh`: one Postgres container, two Spoke nodes, and
   explicit origins for one browser client per node.
6. Add test-only Elixir support, outside the production endpoint, that commits an ordinary
   Spoke row and sync-log entry without `pg_notify`. This follows the existing
   `multi_node_test.exs` recovery case instead of intercepting notifications.
7. Add `node-delivery` and `node-recovery` browser proofs.
8. Keep forced DO eviction and stale-attachment refusal in worker tests.
9. Stretch: deploy a branch-only Spoke worker, observe a real constructor restart after
   hibernation, act through the existing browser socket, and clean up the worker. Record
   `ws-hibernate` when credentials and deployment cleanup are available.

### Validation

- The DO suite proves two workspace names route to isolated objects.
- The Postgres suite proves principal-scoped results and Elixir external writes.
- A node-one message reaches the node-two browser through notification wake-up.
- A logged write without notification reaches node two through the periodic catch-up with no
  duplicate rerun.
- Forced-eviction worker tests preserve subscriptions and reject stale attachments.
- A skipped deployed hibernation stretch records its missing credential or environment reason.

### Exit gate

Spoke passes its DO, Postgres, and two-node required legs. `ws-hibernate` remains a reported
stretch item until the deployed browser proof runs.

## Phase 8: Add the runtime coverage gate and CI matrix

**Size:** `M`

### Changes

1. Make the static catalog check strict for all 31 required behaviors. Report
   `ws-hibernate` separately as stretch coverage.
2. Emit Playwright JSON results with app, backend, and behavior tags from each browser job.
3. Add a final Buildkite step that downloads those artifacts, joins them to the catalog,
   fails on a missing or failed required proof, and posts the coverage annotation.
4. Keep the PR path parallel: existing jobs plus Axle DO, Rounds SQLite, Chalk SQLite, and
   Spoke SQLite.
5. Add `WHEEL_CI_MODE=matrix` for the Rounds upgrade, Chalk DO, Spoke DO, Spoke Postgres, and
   Spoke multi-node legs.
6. Record PR path duration. Split or shard a step only when the measured critical path
   regresses beyond the repository target.
7. Add docs for the catalog, app roles, test controller, backend legs, and local commands.
8. Update `content/robots/real-app.md` and related robot docs for Rounds, Chalk, and Spoke.

### Validation

- Deleting a required primary spec fails the static check.
- A tagged test that exists but fails is reported as failed, not covered.
- The nightly matrix posts one app-by-backend annotation from actual Playwright results.
- The plan table and `catalog.ts` contain the same 32 IDs and proof assignments.

### Exit gate

Static coverage, runtime coverage, the required matrix, and portfolio docs are live.

## Final validation

Run locally after each phase:

```bash
bun run typecheck
bun run lint
bun run test
```

Browser and backend legs run in Buildkite. The required plan is complete when:

- All 31 required catalog behaviors have a passing primary browser proof.
- Axle runs unchanged browser specs on SQLite, Postgres, and DO.
- Rounds proves client durability and contract upgrades on SQLite.
- Chalk runs unchanged browser specs on SQLite and DO from one editor implementation.
- Spoke runs unchanged browser specs on SQLite, Postgres, and DO, plus its two-node suite.
- The runtime coverage annotation and required nightly matrix are live.
- The deployed `ws-hibernate` result is recorded as passed or remains an explicit stretch item.
