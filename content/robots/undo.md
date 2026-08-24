# Undo and redo

Human page: [Undo and redo](../docs/undo.mdx). API: [`wheel/sync`](api/sync.md).

Undo replays a mutation's captured inverse as another synced mutation. The server has no separate undo protocol.

## Inverse contract

`invert(reader, args)` runs before optimistic apply. It returns `{ mutation, args, description? }` or `null`.

Annotate the return type as `InverseSpec | null`. Self-referential mutation definitions otherwise create a TypeScript inference cycle that can collapse to `any`.

## Creating rows

When a create inverse must name the created row, mint the id before the mutation and pass it in args. An id minted only inside the optimistic handler is unavailable to `invert()`.

## Patch helper

`patchMutation()` covers one row with `{ id, patch }` args. It captures prior values only for patched fields and uses the same mutation as its inverse.

Use `stamp()` for server-mirroring fields that rederive on every apply and must not restore from the inverse.

Use handwritten inversion for flat args, multi-row writes, create/delete shapes, or custom missing-row behavior.

## Client stack

- `canUndo()` and `canRedo()` inspect stack state.
- `undo()` and `redo()` emit ordinary mutations.
- A new non-redo edit clears redo history.
- A mutation with `invert: null` does not add an undo entry.

Expose stack state through `clientRead()` because the client methods are not Solid signals.

## Concurrency

The inverse uses current authoritative handling when it reaches the server. Other clients see undo and redo as normal writes. Missing targets can become `orphaned` based on the optimistic handler.

Primary sources:

- [`declarations.ts`](../../packages/wheel/src/sync/declarations.ts)
- [`client.ts`](../../packages/wheel/src/sync/client/client.ts)
- [`packages/docs/examples/undo/undo.ts`](../../packages/docs/examples/undo/undo.ts)
