# Elixir sync backend

`wheel_sync` serves Wheel protocol v2 over WebSocket with Elixir and Postgres. The TypeScript client connects without an adapter or client change.

The existing TypeScript SQLite and Durable Object engines remain supported. Applications choose a server by changing the `/sync/websocket` target.

- [Layout](#layout)
- [Local services](#local-services)
- [Application configuration](#application-configuration)
- [Authentication](#authentication)
- [Queries](#queries)
- [Mutations](#mutations)
- [Generated contracts](#generated-contracts)
- [Test matrix](#test-matrix)

## Layout

```text
elixir/
├── wheel_sync/             # protocol engine and application authoring API
│   ├── lib/wheel_sync/     # socket, workspace process, registry, and storage
│   └── test/support/       # shared wire conformance server
└── tracker/                # Tracker Postgres application
    └── lib/wheel_tracker/  # schema, seed, queries, and mutations
```

The generated contracts live beside their TypeScript applications:

- [`test/wire/fixtures/schema.json`](../test/wire/fixtures/schema.json) defines the wire test application.
- [`packages/tracker/server/schema-spec.json`](../packages/tracker/server/schema-spec.json) defines Tracker.
- [`packages/tracker/server/seed-operations.json`](../packages/tracker/server/seed-operations.json) contains Tracker's deterministic seed operations.

## Local services

The repository `solo.yml` defines these processes:

| Process | Purpose |
|---|---|
| `docker` | Start Docker Desktop under Solo. |
| `postgres` | Run Postgres 17 on `127.0.0.1:55433`. |
| `wire:elixir` | Serve the wire fixture at `http://127.0.0.1:4801`. |
| `tracker:elixir-server` | Serve Tracker through `wheel-tracker-sync.localhost`. |

Start `docker`, then `postgres`. Start `wire:elixir` for protocol tests or `tracker:elixir-server` for the application.

Run the remote protocol suite with:

```bash
WHEEL_WIRE_URL=http://127.0.0.1:4801 \
WHEEL_WIRE_LABEL='Elixir Postgres' \
bun run test:wire
```

Run the TypeScript SQLite version by omitting `WHEEL_WIRE_URL`:

```bash
bun run test:wire
```

## Application configuration

Start `WheelSync` under an application supervisor:

```elixir
children = [
  {WheelSync,
   name: MyApp.Sync,
   database_url: System.fetch_env!("DATABASE_URL"),
   schema_path: Path.expand("priv/wheel-schema.json", File.cwd!()),
   authenticator: MyApp.SyncAuthenticator,
   queries: [MyApp.Queries.WidgetsAll],
   mutations: [MyApp.Mutations.WidgetCreate],
   migrations: MyApp.SyncSchema.statements(),
   application_version: 1,
   minimum_client_version: 1,
   schema_version: 1,
   port: 4001}
]
```

| Option | Default | Description |
|---|---:|---|
| `database_url` | required | Postgrex connection URL. |
| `schema_path` | required | Generated Wheel schema contract. |
| `authenticator` | required | Module implementing `WheelSync.Authenticator`. |
| `queries` | `[]` | Modules implementing `WheelSync.Query`. Must match the contract exactly. |
| `mutations` | `[]` | Modules implementing `WheelSync.Mutation`. Must match the contract exactly. |
| `migrations` | `[]` | Postgres DDL run before the endpoint starts. |
| `pool_size` | `10` | Postgrex connection pool size. |
| `serve` | `true` | Start the Bandit HTTP endpoint. |
| `port` | `4001` | Bandit HTTP port. |
| `application_version` | `1` | Current application API version. |
| `minimum_client_version` | application version | Oldest accepted client version. |
| `schema_version` | `1` | Schema version reported in hello frames. |
| `max_message_bytes` | `262144` | Maximum WebSocket frame size. |
| `messages_per_minute` | `1200` | Per-connection message limit. |

## Authentication

An authenticator resolves each upgrade request to one actor, workspace, and session:

```elixir
defmodule MyApp.SyncAuthenticator do
  @behaviour WheelSync.Authenticator

  @impl true
  def authenticate(conn, _config) do
    with [token] <- Plug.Conn.get_req_header(conn, "authorization"),
         {:ok, account} <- MyApp.Accounts.verify(token) do
      {:ok,
       %WheelSync.Principal{
         actor: "user:#{account.user_id}",
         workspace_id: account.workspace_id,
         session_id: account.session_id
       }}
    else
      _ -> :error
    end
  end
end
```

Every application query and mutation must include `workspace_id` in its SQL. `wheel_sync_workspaces` and `wheel_sync_log` also scope their keys by workspace, so one Postgres database can serve multiple workspaces.

## Queries

A query returns Postgres SQL and parameters. The generated contract supplies its parameter schema, output table, row key, and `rerunOn` list.

```elixir
defmodule MyApp.Queries.WidgetsAll do
  @behaviour WheelSync.Query

  @impl true
  def name, do: "widgets.all"

  @impl true
  def sql(_params, principal) do
    {
      "select id, title from widgets where workspace_id = $1 order by title, id",
      [principal.workspace_id]
    }
  end
end
```

Rows pass through the generated JSON Schema before they reach the socket. Duplicate keys, missing key fields, non-JSON values, and undeclared fields reject the query result.

## Mutations

A mutation runs inside one Postgres transaction. The workspace process applies one mutation at a time.

```elixir
defmodule MyApp.Mutations.WidgetCreate do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.create"

  @impl true
  def run(tx, args, ctx) do
    id = WheelSync.Ctx.new_id!(ctx, "widget")

    WheelSync.Tx.exec!(
      tx,
      "insert into widgets (workspace_id, id, title) values ($1, $2, $3)",
      [tx.workspace_id, id, args["title"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end
```

`WheelSync.Ctx.new_id!/2` consumes the client's pre-generated IDs in order. Prefix mismatch and stream exhaustion roll back the transaction as terminal mutation errors.

Return `{:reject, code, message}` or raise `WheelSync.Rejection` for a business rejection. Other handler failures roll back and return `handler_error`. Connection loss, serialization failure, and deadlock failure remain retryable request errors.

`WheelSync.Tx.touch!/2` declares each changed contract table. After commit, the workspace process reruns subscriptions whose `rerunOn` list overlaps those tables and sends whole-row deltas with the full order.

## Generated contracts

Regenerate and check the wire and Tracker contracts with:

```bash
bun run schema:wire
bun run schema:tracker
bun run seed:tracker

bun run schema:wire:check
bun run schema:tracker:check
bun run seed:tracker:check
```

The Elixir registry fails startup when query or mutation names differ from the generated contract. It also rejects duplicate handlers and `rerunOn` entries that name undeclared tables.

## Test matrix

```bash
bun run test:backends                  # TypeScript SQLite backend contract
bun run test:cloudflare                # Durable Object backend contract
bun run test:wire                      # TypeScript SQLite wire protocol
bun run test:elixir                    # Elixir unit and compile checks
bun run test:browser:tracker:sqlite    # full Tracker browser suite on SQLite
bun run test:browser:tracker:postgres  # full Tracker browser suite on Elixir/Postgres
```

`test:browser:tracker:postgres` requires `DATABASE_URL`. `scripts/ci/test-elixir-backends.sh` creates an isolated Postgres 17 container and runs the Elixir wire suite plus both Tracker browser targets.
