# Presence

Human page: [Presence](../docs/presence.mdx). API: [`wheel/sync`](api/sync.md).

Presence is one ephemeral state object per client connection. It has no database row, history, provenance, or undo.

## Declaration

`presence({ name, state })` defines the client-side type and validation schema. The declaration does not create multiple server channels; one client still owns one state object.

## Publish

```ts
client.setPresence(editorPresence, state, { coalesceMs: 120 });
client.setPresence(editorPresence, null); // clear
```

The first send after a quiet period is immediate. Later sends inside the coalescing window collapse into one trailing latest value.

The client republishes its last state after reconnect bootstrap.

## Read peers

`client.peers(declaration)` returns `PeersResult`:

- `valid`: validated state by client id.
- `failures`: validation failure by client id.
- `actors`: authenticated actor by client id.

Sending invalid local state throws. Receiving invalid peer state records a failure and leaves other peers available.

Count people from unique actor values, not client entries. One person can hold several tabs.

## Reactive service view

`peers()` is imperative client state. Expose it with `clientRead()` or `clientReadFor()` from `SyncService`.

## Appropriate data

- cursor and caret position;
- current focus target;
- typing preview;
- drag preview;
- active document or selection.

Persist durable outcomes with mutations. Cap large preview payloads in application code.

Primary sources:

- [`declarations.ts`](../../packages/wheel/src/sync/declarations.ts)
- [`client.ts`](../../packages/wheel/src/sync/client/client.ts)
- [`presence.test.ts`](../../packages/wheel/src/sync/client/presence.test.ts)
