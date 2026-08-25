# Authentication and authorization

Human page: [Auth and authorization](../docs/auth.mdx). API: [`wheel/auth`](api/auth.md), [`wheel/sync/server`](api/sync-server.md).

## Principal

`AuthPrincipal` contains `actor`, `workspaceId`, and `sessionId`. All fields are non-empty strings. `validateAuthPrincipal()` validates unknown input and freezes the result.

## Authenticator

`defineAuthenticator(fn)` accepts a sync or async request verifier. Return one principal or `null` for no valid session.

Authentication lives outside Wheel. Native browser WebSockets send same-origin cookies during the upgrade but cannot set custom headers. Use a short-lived ticket for cross-origin sockets. Query values or headers are acceptable only for demo and test fixtures.

## WebSocket upgrade rules

- `authenticateSyncSocket()` requires an authenticator and the selected workspace id.
- The Worker or server selects the workspace from trusted routing and identity.
- A null principal returns 401.
- A principal for another workspace returns 403.
- The authenticated handshake remains attached to the accepted WebSocket.
- Message frames cannot choose actor, workspace, or session.
- Close the socket after logout, session revocation, or an identity change. Reconnect runs authentication again.

## Query rules

SQL query callbacks receive `(params, principal)`. Custom handlers receive `ctx.principal`. Push subscriptions also receive the principal.

Filter results against trusted principal values. Query params remain untrusted user input.

Subscription identity includes principal, so identical query params from different users do not share rows.

## Mutation rules

Authoritative mutation context exposes `actor`, `workspaceId`, and `sessionId`. Use those values in write predicates.

`rejection(code, message)` creates a business refusal. Throw it. The client settles `rejected` and retains the message.

## Pruning rule

Row-image pruning reduces server work. It cannot authorize access because missing images fall back to query execution and initial reads never pass through pruning. The shipped in-process SQLite and Cloudflare backends do not capture row images, so authorized SQL runs on every invalidation.

Primary sources:

- [`packages/wheel/src/auth/index.ts`](../../packages/wheel/src/auth/index.ts)
- [`packages/wheel/src/sync/server/socket.ts`](../../packages/wheel/src/sync/server/socket.ts)
