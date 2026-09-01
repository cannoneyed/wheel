# Wheel mutation groups — design spec

A `Mutation[]` submitted as ONE atomic unit: one frame, one server
transaction, one optimistic apply, one undo entry. This is a wheel-core
feature; consumers compose their existing mutations and declare nothing new.

Written for the wheel repository (`cannoneyed/wheel`). The consuming design
it unblocks is the editor extraction's WP2 (`packages/editor/tour.md`,
"What extraction still needs").

## Why

The block editor commits typing per block — that stays. But some user
actions write several blocks as ONE action: a future find-and-replace
touching ten blocks, a multi-cursor edit, an import rewriting a section.
One action must be one undo step and one all-or-nothing write.

Today that requires a bespoke batch mutation in every consumer's schema —
its own args type, optimistic handler, inverse, and server handler, per
app. A group primitive moves that cost into wheel once: a group is just an
ordered list of mutations the app already has.

Decided in the extract-surface session (2026-08-30): batching lands as a
wheel-level `Mutation[]`, not per-consumer batch mutations; the save timer
itself keeps pushing per-block mutations (typing ticks are bounded by
cursor block-switches), so groups serve deliberate multi-block ACTIONS,
not the debounce.

## API

```
plainJSTSPython/** One member: an existing mutation declaration plus its args. */
export interface MutationCall<Args extends Record<string, unknown> = Record<string, unknown>> {
  mutation: MutationDecl<Args>;
  args: Args;
}

interface SyncClient {
  // existing:
  mutate<Args>(decl: MutationDecl<Args>, args: Args): MutationHandle;
  // new:
  mutateGroup(calls: ReadonlyArray<MutationCall>): MutationHandle;
}
```

`mutateGroup` returns the SAME handle shape `mutate` does: one mutation id
(the group's), one `settled` promise, the same four terminal outcomes
(`confirmed | rejected | orphaned | failed`), and it never rejects/throws —
the one-error-channel contract holds.

A group of one is exactly `mutate`. An empty group settles `confirmed`
without applying or sending anything.

## Semantics

**Validation.** Every member's args validate against its declaration BEFORE
anything applies or sends — the existing rule, applied to the whole list.
One invalid member means nothing applies and the handle settles the same
way a single invalid mutation does today.

**Optimistic apply.** Members apply to the local cache in list order,
inside one batch: readers and live queries observe one change notification
for the whole group, never a half-applied state.

**Inverse.** Each member's inverse is captured immediately before that
member's optimistic apply, so member N's inverse sees members 1..N-1
applied. The group's inverse is the members' inverses in REVERSE order.
Undoing a group is `mutateGroup(reversedInverses)` — one entry on the
app's undo stack, one atomic write to peers. (Everybody's
`editor-mutation-history` already replays inverses as ordinary mutations;
it stores a group as one entry.)

**Transport and server.** One protocol frame carries the ordered members
(`type: 'mutateGroup'`, group id, per-member name + args). The server runs
the members' EXISTING handlers, in order, inside one transaction, and
confirms or rejects the group as a unit. No new server handlers: the
group's atomicity is the transaction, the members are the handlers the
schema already mirrors.

**Rejection.** Any member's rejection (a CAS/baseVersion miss, a policy
refusal) rejects the whole group. The client rolls back every member's
optimistic effect — the standard single-mutation rollback, generalized to
the group's batch.

**Outbox.** The group persists and replays as ONE outbox entry. A reload
mid-flight resends the whole group or none of it; members are never split
across reconnects.

**Ordering.** A group occupies one slot in the mutation order, exactly
where `mutate` would have put a single call. `pendingMutations()` counts a
group as one.

**Compatibility.** A server that does not know the frame refuses it; the
client surfaces that as `failed` with a message naming the server as too
old. Never degrade to sending members individually — silent non-atomicity
is the failure this feature exists to prevent.

## Limits and non-goals

Members share one client (one object scope). Cross-object groups are out:
atomicity across sync objects is a different, distributed problem.

No nested groups. A group member is a mutation, not a group.

Cap the member count (suggested: 128) so one frame stays bounded; exceeding
it is a validation failure, not a silent split.

Presence and other non-durable channels are untouched.

## Conformance checklist

The suites wheel already runs per handler should gain, for groups:

☐A group applies atomically: no reader observes a partial group, local
or remote.

☐A group with an invalid member applies nothing.

☐A rejected member rolls back the whole group's optimistic state.

☐Inverses capture in order and undo in reverse order, as one group.

☐The outbox replays a group as one unit across a reload.

☐An old server's refusal settles the handle `failed`; nothing was sent
member-wise.

☐`pendingMutations()` counts one per group.

## The consuming test (in this repo, once wheel ships)

Register a scattered edit across three blocks as one group of `editBlock`
calls; assert one undo entry restores all three, and a peer observing
mid-flight never sees two of three applied.