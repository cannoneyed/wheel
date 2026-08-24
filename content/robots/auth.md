# Authentication and authorization

Human page: [Auth and authorization](../docs/auth.mdx). API: [`wheel/auth`](api/auth.md), [`wheel/sync/server`](api/sync-server.md).

## Principal

`AuthPrincipal` contains `actor`, `workspaceId`, and `sessionId`. All fields are non-empty strings. `validateAuthPrincipal()` validates unknown input and freezes the result.

## Authenticator

`defineAuthenticator(fn)` accepts a sync or async request verifier. Return one principal or `null` for no valid session.

Authentication lives outside Wheel. Verify cookies, bearer tokens, or another credential before returning the principal.

## HTTP rules

- `createSyncHttpHandler()` requires an authenticator.
- The configured handler owns one workspace id.
- A null principal returns 401.
- A principal for another workspace returns 403.
- Stream open returns a connection token.
- Each later request presents the token and authenticates as the same principal.
- Request JSON cannot choose actor, workspace, or session.

## Query rules

SQL query callbacks receive `(params, principal)`. Custom handlers receive `ctx.principal`. Push subscriptions also receive the principal.

Filter results against trusted principal values. Query params remain untrusted user input.

Subscription identity includes principal, so identical query params from different users do not share rows.

## Mutation rules

Authoritative mutation context exposes `actor`, `workspaceId`, and `sessionId`. Use those values in write predicates.

`rejection(code, message)` creates a business refusal. Throw it. The client settles `rejected` and retains the message.

## Pruning rule

Row-image pruning reduces server work. It cannot authorize access because missing images fall back to query execution and initial reads never pass through pruning.

Primary sources:

- [`packages/wheel/src/auth/index.ts`](../../packages/wheel/src/auth/index.ts)
- [`packages/wheel/src/sync/server/socket.ts`](../../packages/wheel/src/sync/server/socket.ts)
