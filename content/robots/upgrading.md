# Upgrade from 0.1 to 0.2

Human page: [Upgrade from 0.1 to 0.2](../docs/upgrading.mdx). API: [`wheel/sync`](api/sync.md), [`wheel/sync/server`](api/sync-server.md).

## Required changes

1. Install `wheel@npm:@cannoneyed/wheel@0.2.0`.
2. Rename `table` to `collection` and `TableDecl` to `CollectionDecl`.
3. Regenerate schema contracts and row fingerprints. Schema specification version 4 uses `collections`.
4. Deploy protocol-version-3 clients and servers together. Use the application-version handshake to reject old clients.
5. Configure Elixir `application_version`, `schema_version`, and any proxy-facing `allowed_origins`.

## Offline data warning

Wheel 0.2 deletes version-2 IndexedDB outbox entries because they lack the optimistic preview required by the new materializer. Reconnect 0.1 clients and let pending mutations settle before deploying the 0.2 client.

## Atomic mutation groups

`mutateGroup()` sends up to 128 existing mutation declarations as one command. The server validates every member before running handlers, commits one transaction, and creates one undo entry.

## External writes

Use `WheelSync.external_write` for server-side writes to synced tables. Raw SQL without a Wheel sync-log row does not invalidate clients.

## Multi-node limit

Postgres notifications wake peer nodes. The durable sync log recovers missed notifications. Version 0.2 does not capture untracked SQL through WAL, coordinate presence between nodes, or share query caches.
