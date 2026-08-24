# Axle: A Guided Tour of a Local-First Linear Clone

> [!WARNING]
> The default command starts a demo deployment, not a production server. It
> trusts the in-app user switcher, uses an in-memory database, enables sync
> debug output, and resets on restart. Production mode requires a persistent
> filename and an external session verifier; [ROADMAP.md](./ROADMAP.md) names
> the remaining application and deployment work before Axle can be treated as
> a production template.

*Or: what happens when you stress-test a sync framework by rebuilding the most
keyboard-obsessed app in the industry.*

Axle is a working Linear clone — teams, issues, boards, cycles, projects, comments,
presence, an inbox, full-text search, offline support, and undo for nearly everything —
built on [wheel](../wheel), a local-first framework for Solid.js. It exists to answer one
question: *can this framework carry a real product?* The honest answer required building
the real product. This is the tour.

Run it yourself first; everything below will make more sense with two browser windows open:

```
bun run tracker:server   # demo sync engine on in-memory SQLite — zero config, no Docker
bun run tracker          # vite on :4798
```

Open two windows, pick two different users from the bottom-left switcher, and drag a card.
Then turn off your wifi and keep working. That's the whole pitch, experienced in ten seconds.

---

## The 30-second feature inventory

Everything you'd reach for in Linear's first month: grouped issue lists and drag-and-drop
boards per team; a peek pane and full issue pages; markdown descriptions and comments with
reactions; sub-issues, blocking relations, labels, priorities, estimates, due dates;
projects with live progress bars; auto-rolling cycles; a notification inbox with @mentions;
saved views; favorites; live full-text search; and a command palette. All of it
keyboard-first (`j`/`k`, `x`, `s`/`a`/`p`/`l`, `space` to peek, `⌘K`, `⌘Z`), all of it
multiplayer, all of it functional offline.

Two things you won't find in most clones: press <kbd>ⓘ</kbd> on any issue and get a
**provenance receipt** — every write that produced the row you're looking at, color-coded
by cause. And the auto-rollover job writes raw SQL from outside the app entirely, then calls
`server.externalWrite(...)` — and the change appears in your browser a second later, in a
process that never touched a mutation. We'll get to how.

---

## Architecture in one breath

Axle is three layers, each with one job:

```
*.sync.ts  ──  the CONTRACT: tables, queries, mutations (shared client/server, Zod-typed)
services/  ──  the STATE: singleton services own every subscription and every mutation call
components ──  the VIEW: each component declares its exact data needs through connect()
```

Data flows down (server → subscriptions → service computeds → connected components) and
intent flows up (component → service action → mutation → server), and nothing is allowed to
shortcut. The framework's linter enforces the boundaries — one `connect()` per component,
called first, at most 3 services and 12 fields per connection, no whole-service injection,
no raw hooks. Every connected component marks its real DOM root, including portals and
multi-root fragments, so rectangle inspection sees the same component graph the runtime
registry sees. The application passes those rules without a package-wide carveout.

Let's walk the layers bottom-up.

---

## The sync contract: one file, two truths

Every domain gets a `*.sync.ts` (shared declarations) and a `*.server.ts` (SQL bindings).
The interesting part is that a mutation declares its **client-side guess** and its
**server-side truth** against the same types, and they must mirror each other:

```ts
// issues.sync.ts — what the client does INSTANTLY
export const issueMove = mutation({
  name: 'issue.move',
  args: t.object({ issueId: t.string(), stateId: t.string(), sortOrder: t.number(), boardOrder: t.number() }),
  optimistic: (cache, args, ctx) => {
    if (!cache.get(issues, args.issueId)) throw orphan(`issue ${args.issueId} is gone`);
    cache.update(issues, args.issueId, { stateId: args.stateId, sortOrder: args.sortOrder,
      boardOrder: args.boardOrder, updatedAt: ctx.now() });
  },
  invert: (reader, args): InverseSpec | null => { /* prior state, captured BEFORE the apply */ }
});
```

Three doctrines hide in those ten lines:

**The guess is disposable.** There is no merge algorithm anywhere in this codebase. The
client applies the optimistic write, the server runs the authoritative SQL, and when the
confirmation arrives, the guess is thrown away and replaced with truth. Concurrent drags of
different cards compose because each move is a single-row write with a fractional sort key
(`positionBetween`) — no conflict, so nothing to resolve.

**Undo is just another mutation.** `invert` captures the inverse *before* the optimistic
apply and pushes it on a local stack. Pressing `⌘Z` replays that inverse as a perfectly
ordinary synced mutation — so your undo propagates to every other client, and the sync
engine never learns that undo exists. Bulk edits stay one undo step by shaping the args
per-target (`{updates: [{issueId, patch}]}`), whose inverse is the same mutation with each
issue's own priors. Inverse definitions live beside their mutations, so changing an
operation cannot hide its undo contract in a separate registry.

**Throwing is a feature.** That `throw orphan('issue is gone')` in the optimistic
handler is what makes a pending edit to an issue someone else deleted surface as a loud
`orphaned` mutation with a toast — instead of a silently dropped write. `orphan()` is the ONE
throw that means "the row legitimately vanished"; any *other* throw settles the mutation
`failed` and logs. Loudness is a design value here.

Every query that a mutation optimistically inserts into also declares a **projection** — a
client-side `filter`/`sort` that must place the optimistic row exactly where the server's
SQL will. The parity suite runs mutations against their projected queries and asserts zero
reorders between the guess and the confirmation. The suite exists precisely because
"obviously matching" SQL and JS comparators
drift apart the moment nobody is checking.

---

## What only the server knows

Some facts can't be guessed client-side, and Axle leans into them as showcases rather than
working around them:

**Issue numbers.** `ENG-42` needs a per-team sequence that only a single writer can assign
race-free. The optimistic row carries a sentinel (`number: 0`), the UI renders a pulsing
`ENG-…`, and the rebase swaps in the real number when the server confirms. Watch it happen:
create an issue while offline, then reconnect.

**Activity and notifications are server-authored rows.** When you change an issue's status,
the *handler* writes the activity entry and fans out inbox notifications (assignee, creator,
@mentions parsed from comment bodies) inside the same transaction. The optimistic layer
never predicts these rows — they appear on confirmation, which is the point: the feed is
the server's sworn account of what happened, not the client's hope.

This surfaced the tour's first war story. Server-authored rows can't use `ctx.newId()`,
because that call doesn't *mint* ids — it **replays the client's pre-generated id stream**
so both sides land identical rows. A handler asking for an id the client never generated
throws `id_stream_exhausted`. The fix is deterministic derivation from what the server
already has (`activity_${mutationId}:${issueId}:${kind}`), which also makes exactly-once
replay idempotent for free.

**Errors are values, not exceptions.** The second war story is the one that reshaped the
kernel. That `id_stream_exhausted` throw originally surfaced client-side as a generic
transport failure — and the client, correctly designed for offline, parked the mutation as
`queued` and retried it forever. A poisoned mutation that blocks every mutation behind it,
with zero symptoms. The fix moved every computed verdict onto one settled channel: a
mutation's outcome is one of **four typed values** — `confirmed`, `rejected` (a business rule
said no), `failed` (the server ran this and it broke — terminal, never retried), or
`orphaned` (the row legitimately vanished) — and a thrown exception is reserved for exactly
one meaning: *couldn't communicate, retry later*. `mutate()` never throws. The four-outcome
model lives in the framework's **Reference** page, with a regression suite proving a
deliberately crashing handler settles `failed` loudly and doesn't block the queue.

---

## Services: where state lives, and only there

Every synced read in Axle flows through a singleton service. `IssueService` owns the
per-team subscriptions (created lazily, on first read, via a one-line keyed family) and
exposes derived state as keyed, argument-taking memos:

```ts
export class IssueService extends SyncService {
  // one subscription per teamId, alive until the service disposes (no eviction)
  private readonly issuesView = this.liveQueryFor(issuesByTeam, (teamId: string) => ({ teamId }));

  // computedFor: one cached derivation per (teamId, stateId) key
  readonly issuesIn = this.computedFor((teamId: string, stateId: string) =>
    this.activeFor(teamId)
      .filter((row) => row.stateId === stateId)
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1)));
  // ...every mutation call, ordering math, and undo/redo also live here
}
```

Components never touch any of this directly. They declare a manifest:

```ts
const connectIssueRow = connect(
  (props) => `IssueRow:${props.vm.issue.id}`,       // per-instance registry identity
  (c, props) => view(
    { selected: () => selection.isSelected(props.vm.issue.id), /* reads */ },
    { rowClick: interaction.rowClick, openPeek: interaction.openPeek /* actions */ }
  )
);
```

That manifest is statically lintable, runtime-registered (the debug panel shows every
mounted instance and its dependencies), and stubbable in tests. When a connection tries to
grow past 3 services, the linter fails the build — and the one time that fired in Axle
(the sidebar reaching for a fourth service), the forced split produced genuinely better
factoring. The cap is the design review you can't skip.

`IssueInteractionService` is the component-facing surface, not a second kernel. It delegates
to bounded owners for target resolution, property/filter pickers, list/board movement,
selection/composer state, issue details, saved-view navigation, and global command
registration. Components keep one stable dependency while each behavior has its own file
and service test seam. [`SERVICE-REPORT.md`](./SERVICE-REPORT.md) is generated from the
source and exposes direct service dependencies and file size without imposing an arbitrary
line-count rule.

### Split view, or: what service scoping is actually for

Axle's `◫ Split` button mounts a second issue pane inside a child service scope with
`inheritServices: 'live'`. The semantics: every **SyncService** (synced data) resolves to
the parent's singleton — both panes literally share one `IssueService` — while every plain
service (selection, filters, pickers, the interaction facade) constructs fresh per pane.
Two filter sets, two selections, one source of truth, and a `PaneService` override tells
the secondary pane's facade not to register the keyboard map twice. The whole feature is
~60 lines because the scoping semantics were already in the framework; Axle just proved
they compose.

---

## The keyboard layer: shortcuts as data

Every binding is a registration with a reactive gate:

```ts
bind(
  'tracker.peek.open',
  'space',
  () => this.openPeek(cursor()),
  () => onList() && noOverlay(),
  'Peek issue'
);
```

Because bindings are *data* in a service, three things fall out. Dispatch is headlessly
testable — the test suite drives the entire shortcut map through `KeyboardService.dispatch`
with synthesized events, no DOM. The `?` help dialog renders **from the live registration
table**, so it cannot go stale — if a shortcut exists, it's documented, by construction.
And the debug panel can answer "what fires here, right now" as a query.

Board drag-and-drop is the other keyboard-adjacent showpiece: a pure, hand-written state
machine (`idle → pressed → dragging`, events in, `{state, drop?}` out) with the DOM kept
entirely at the edges — hit-testing turns pointer coordinates into a `DropTarget` before
the machine ever sees them. The machine is exhaustively unit-tested with zero DOM, and its
design notes (reactive state holding, effects-as-return-values, the synthetic-click
swallow) are the written brief for the framework's future `machine()` primitive.

---

## Derived tables and foreign writers

Three tables in Axle have no physical existence. `project_counts`, `cycle_stats`, and
`search_results` are **virtual**: their queries compute rows (a `GROUP BY` over issues, a
`ts_rank` over text) and re-run purely through watch lists. Complete an issue and a project
progress bar updates on every client — no table written, no trigger fired, just a query
whose answer changed.

Search goes further: it's a fully hand-built `QueryHandler` (no sugar) with *two*
invalidation channels — table hints for engine writes, and a push channel
(`searchInvalidation.notify()`) for changes the engine can't see. The push channel's first
real exercise found a genuine engine bug: push-triggered reruns emitted deltas at a stale
sequence number that every client silently discarded. The engine now mints an audit-logged
external seq for changed push reruns. Stress tests earn their keep in exactly this way.

Then there are the writers that bypass the app entirely:

**The rollover job** (`jobs/rollover.ts`) ends cycles: it finds unfinished issues stranded
in ended cycles, creates the one live cycle that contains *now*, and moves everything in a
single sweep — direct SQL against the database, then one
`server.externalWrite({tables: ['cycles','issues']})` that mints a seq, re-runs watchers,
and makes every subscribed client converge. The engine never saw a mutation; it just learns
"these tables changed" and does the rest. (The job's first design processed ended cycles one
by one and stranded issues in intermediate dead cycles; the convergence test caught it in
minutes. Time-based jobs should converge to the correct current state, not replay past
events — a lesson now filed as the `flow()` brief.)

`externalWrite` is the honest door for foreign writers. A process that writes the database
directly can call it to bring clients back in sync. A future change-feed backend can use the
same path through `SyncBackend.onExternalChange`. Current SQLite backends do not fire it.

---

## Presence and provenance: the two transparency channels

**Presence** is the ephemeral channel: viewer avatars on the issue you have open, "Grace is
typing…" under the comment box. It's deliberately *not* data — no table, no history, no
optimistic layer; state dies with the connection, and a lost update is not an error.

**Provenance** is the opposite: every client-side write is recorded with its cause in a
capped ring buffer, and `client.explain(issues, id)` returns the value, its latest
cause, and the full local history. Axle ships this as *product UI* — the ⓘ popover — not
just a debug tool, because "why does this row look like this" is a question users
(and, more often, developers under deadline) actually ask. The framework's debug panel
completes the picture: the whole state tree, every service primitive with live values,
every mounted component and subscription. It was the panel that cracked the
hardest bug of the project — services showing six perfect groups next to a component
rendering zero — in about ninety seconds of looking.

---

## The testing story, because it's half the point

The test pyramid never faked the engine. Every Tier-3 test boots a **World**: the real
server engine, real client engines, an in-process SQLite database (the default backend, on
`better-sqlite3` under vitest), a fixed clock, seeded ids, and a scriptable network.
`world.network.pause('web_a')` *is* the offline scenario; `world.settle()` drains everything
in flight — including lazily-created subscriptions, a harness improvement that deleted every
poll-and-retry from the suite.

On top of that sit the adversarial layers:

- **Parity** (every mutation × every projected query: optimistic order === confirmed order),
- **Fuzz**: eleven weighted op kinds — including deliberate mid-chaos server rejections and
  undo/redo across network pauses — over three clients, checked at quiescence against four
  invariants: *convergence* (identical rows everywhere), *seqContinuity* (no gaps in the
  sync log), *causesComplete* (every write has a known cause), *noOrphanOptimism* (no
  pending mutation left behind). CI runs small seeds on push and the full 20×500 matrix
  nightly. No seed has failed yet; the same seed will reproduce forever if one does.
- **Measurements** for the failure modes we predicted: fractional ordering genuinely
  exhausts after ~52 same-gap drops — but degrades to frozen ordering with identical
  cross-client tie-breaks, never divergence — and keyed `computedFor` derivations stay
  *correct* at full-workspace scale, holding one entry per key alive until the service
  disposes (no LRU, no eviction — correct-but-unbounded beats bounded-but-wrong at wheel's
  scale).
- **SQLite driver parity**, where the schema boundary catches driver drift before rows reach
  clients. The SQLite adapter repairs stored booleans and bigint values before validation.

The meta-lesson, learned twice: headless tests could not have caught the two best bugs
(the mount/data feedback loop, the self-reopening dialog). The build gates required
scripted *browser* passes alongside the suites, and both times one paid for itself
within minutes.

---

## What it proved

Axle covers the complete product-shaped path: multiple sync domains, projected and virtual
queries, local and live services, connected component roots, a self-documenting keyboard
map, undo, presence, provenance, and deterministic integration/fuzz/backend suites. The
repository's tests and lint configuration are the source of those inventories; this tour
does not copy volatile counts that drift when code changes.

And in the other direction — what the app gave the framework: the four-outcome mutation model,
sequence-minting for push reruns, the data-vs-debug signal doctrine, `liveQueryFor` /
`computedFor` (the keyed primitives), a subscription-aware `settle()`, a new lint rule, two
written primitive briefs, and ten measured verdicts on the pressure points identified during
design.

That exchange rate — an app's worth of features for a framework's worth of hardening — was
the entire experiment. Axle says it converged.

*Start reading at `src/sync/issues.sync.ts`, then `src/services/issue-service.ts`, then
press `shift+?` in the app.*
