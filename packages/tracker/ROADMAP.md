# Axle production roadmap

Axle is a product-sized Wheel stress test. Its branch preview proves the Worker,
Durable Object, WebSocket, SQLite, migration, hibernation, and alarm path. It is
not a public production template.

## Run the local demo

```sh
bun run tracker:server
bun run tracker
```

Demo mode seeds sample data, trusts browser-supplied demo identity, enables
detailed WebSocket errors, and stores everything in memory.

## Shipped Cloudflare runtime

`cloudflare/tracker-worker.ts` serves the Tracker assets and routes `/sync/*`
and `/readyz` to a Durable Object named `axle-demo`. The object:

- applies the shared migration list before engine boot;
- uses Durable Object SQLite through `createCloudflareSyncBackend()`;
- accepts sockets through the WebSocket Hibernation API;
- restores principals, subscriptions, presence, versions, and limit state;
- runs cycle rollover from a ten-minute alarm;
- shares application versions with the browser and Bun server.

This runtime is branch-local demo infrastructure. It has one fixed workspace
and trusted demo authentication. It does not serve public Tracker data.

## Bun seam proof

`TRACKER_MODE=production` exercises the self-hosted runtime seams:

```sh
TRACKER_MODE=production \
TRACKER_WORKSPACE_ID=workspace_acme \
TRACKER_DATABASE_FILENAME=./data/acme.sqlite \
TRACKER_AUTH_SESSION_URL=https://app.example.com/internal/wheel-session \
bun run tracker:server
```

This mode proves persistent SQLite, append-only migrations, verified session
responses, `/healthz`, `/readyz`, sanitized WebSocket errors, per-connection
message limits, and graceful shutdown. It is a self-hosting option and parity
check. It is not the default hosted design.

The old process settings map to WebSocket controls as follows:

- `TRACKER_MAX_BODY_BYTES` sets `SyncSocketServer.maxMessageBytes`.
- `TRACKER_REQUESTS_PER_MINUTE` sets per-connection `messagesPerMinute`.
- Limits follow the socket, not an IP address or a whole process.

## Required public-production work

### Identity and Worker authentication — M

Serve assets and sync from an authenticated origin. Verify the same-origin
session cookie or exchange it for a short-lived, one-use WebSocket ticket.
Remove the demo user switcher. Close active sockets after logout, revocation,
or an identity change.

Store verifier keys and service credentials as Cloudflare secrets. Bind the
Durable Object namespace through Wrangler. Do not expose secrets through Vite
or `wheel/config`.

### Workspace provisioning and routing — L

Create workspaces and membership records from the identity provider. Define
invitations, removals, suspension, and deletion.

The outer Worker must derive a trusted workspace id after authentication. Route
it through the Durable Object namespace, such as
`env.TRACKER_WORKSPACES.getByName(workspaceId)`. One namespace can contain many
workspace objects. Do not run one operating-system process per workspace.

Reject an upgrade when the principal cannot access the selected workspace.
Define what a live socket sees when membership is revoked.

### Authorization policy — L

Keep personal reads and writes scoped to the verified actor. Add roles and
permission checks for team settings, project administration, issue deletion,
private teams, and workspace billing. Test initial reads, reruns, mutations,
and revocation.

### Backup and restore — L

Define encrypted Durable Object SQLite backups or exports. Set retention and
deletion rules. Run restore drills into a separate namespace and verify schema,
rows, subscriptions after reconnect, and pending client outboxes.

Document recovery for a bad application migration. Wheel migrations roll
forward; they do not run down migrations.

### Rollout and operations — L

Choose application-version compatibility windows and a
`minimumClientVersion` rollout rule. Deploy new Worker code knowing that active
WebSockets can close and reconnect. Gate rollout on `/readyz`, migration tests,
version-mismatch tests, and restore proof.

Add alerts for authentication failures, migration failures, object storage,
alarms, WebSocket close codes, message limits, and reconnect loops. Keep logs
free of cookies, tickets, and message bodies.

The shipped runtimes prove framework seams. The work above owns product policy,
identity, workspace lifecycle, data recovery, and production rollout.
