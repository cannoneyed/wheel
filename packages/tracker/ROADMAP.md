# Axle production roadmap

Axle is a product-sized Wheel stress test. The default server is deliberately
disposable. It is not a production template.

## Run the demo

```sh
bun run tracker:server
bun run tracker
```

Demo mode seeds sample data, trusts `x-axle-demo-user` and
`x-axle-demo-session`, enables the sync debug endpoint, and stores everything
in `:memory:`.

## Run the production-shaped server

Set every required value:

```sh
TRACKER_MODE=production \
TRACKER_WORKSPACE_ID=workspace_acme \
TRACKER_DATABASE_FILENAME=./data/acme.sqlite \
TRACKER_AUTH_SESSION_URL=https://app.example.com/internal/wheel-session \
bun run tracker:server
```

Optional bounds:

```sh
TRACKER_PORT=4797
TRACKER_MAX_BODY_BYTES=262144
TRACKER_REQUESTS_PER_MINUTE=1200
```

Production mode refuses `:memory:` and missing auth/workspace settings. It
applies versioned SQLite migrations, disables sync debug and detailed public
errors, exposes `/healthz` and `/readyz`, caps measured request bodies, applies
a per-process fixed-window rate limit, and closes HTTP, timers, SyncServer, and
SQLite on `SIGINT` or `SIGTERM`.

The session verifier receives only the incoming `Authorization` and `Cookie`
headers. It must return this JSON after verifying the login and workspace
membership:

```json
{
  "actor": "user:provider-user-id",
  "workspaceId": "workspace_acme",
  "sessionId": "provider-session-id"
}
```

`401` and `403` mean no authenticated session. Other non-success responses
make sync authentication temporarily unavailable. One server still owns one
workspace and one database; route workspaces to separate processes or
instances outside Wheel.

## Already enforced

- External authentication chooses actor, session, and workspace. Request
  bodies and demo headers cannot override it in production.
- Inbox and favorite reads are bound to the authenticated actor. Personal
  writes are actor-scoped.
- SQLite uses an explicit persistent filename and an append-only migration
  ledger.
- Request bodies, request rates, public errors, health checks, and shutdown
  have executable tests.
- The browser smoke gate covers boot, navigation, editing, keyboard commands,
  and dialog focus.

## Required before calling Axle a template

1. **Application session bootstrap — M.** Serve the built client behind the
   same authenticated origin. Load the verified actor into the client before
   constructing `SyncClient`; remove the demo user switcher from production.
2. **Workspace provisioning — M.** Create workspace-member profile rows from
   the identity provider. Define invitations, removals, and what a live client
   sees when membership is revoked.
3. **Deployment edge — M.** Terminate TLS, set trusted proxy rules, move rate
   limiting to shared edge storage for multi-instance deployments, and add
   request/access logs without credential data.
4. **Operations — M.** Add encrypted backups, restore drills, migration
   rollback/runbooks, disk alerts, and readiness-driven rolling deploys.
5. **Authorization expansion — L.** Define roles beyond “authenticated
   workspace member.” Add permission checks for team settings, project
   administration, issue deletion, and future private teams.

The reference production mode proves the server seams. The five items above
are product policy or deployment ownership and cannot be safely invented by
the framework.
