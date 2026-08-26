defmodule WheelSync.Test.WireAuthenticator do
  @behaviour WheelSync.Authenticator

  @impl true
  def authenticate(conn, _config) do
    actor = conn.query_params["actor"]
    session_id = conn.query_params["session"]

    if is_binary(actor) and actor != "" and is_binary(session_id) and session_id != "" do
      {:ok,
       %WheelSync.Principal{
         actor: actor,
         workspace_id: "wire-conformance",
         session_id: session_id
       }}
    else
      :error
    end
  end
end

defmodule WheelSync.Test.WidgetsAll do
  @behaviour WheelSync.Query

  @impl true
  def name, do: "widgets.all"

  @impl true
  def sql(_params, principal) do
    {
      """
      select id, title, position, active, note
      from wire_widgets
      where workspace_id = $1
      order by position, id
      """,
      [principal.workspace_id]
    }
  end
end

defmodule WheelSync.Test.WidgetCreate do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.create"

  @impl true
  def run(tx, args, ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into wire_widgets (workspace_id, id, title, position, active, note)
      values ($1, $2, $3, $4, $5, $6)
      """,
      [
        tx.workspace_id,
        WheelSync.Ctx.new_id!(ctx, "widget"),
        args["title"],
        args["position"],
        args["active"],
        args["note"]
      ]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetMove do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.move"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update wire_widgets set position = $1 where workspace_id = $2 and id = $3",
      [args["position"], tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetDelete do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.delete"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "delete from wire_widgets where workspace_id = $1 and id = $2",
      [tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetPair do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.pair"

  @impl true
  def run(tx, args, ctx) do
    insert(tx, WheelSync.Ctx.new_id!(ctx, "widget"), args["first"], 1.0)
    insert(tx, WheelSync.Ctx.new_id!(ctx, "widget"), args["second"], 2.0)
    WheelSync.Tx.touch!(tx, "widgets")
  end

  defp insert(tx, id, title, position) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into wire_widgets (workspace_id, id, title, position, active, note)
      values ($1, $2, $3, $4, true, null)
      """,
      [tx.workspace_id, id, title, position]
    )
  end
end

defmodule WheelSync.Test.WidgetReject do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.reject"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update wire_widgets set title = 'rolled back rejection' where workspace_id = $1 and id = $2",
      [tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
    {:reject, "forbidden", "fixture rejection"}
  end
end

defmodule WheelSync.Test.WidgetFail do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.fail"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update wire_widgets set title = 'rolled back failure' where workspace_id = $1 and id = $2",
      [tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
    raise "fixture handler failed"
  end
end

defmodule WheelSync.Test.WireResetter do
  def reset(postgres) do
    Postgrex.query!(
      postgres,
      "truncate table wire_widgets, wheel_sync_log, wheel_sync_workspaces",
      []
    )

    :ok
  end
end

defmodule WheelSync.Test.WireApp do
  def options(database_url, port) do
    [
      name: WheelSync.Test.Wire,
      supervisor_name: WheelSync.Test.Wire.Supervisor,
      database_url: database_url,
      pool_size: 5,
      port: port,
      serve: true,
      application_version: 3,
      minimum_client_version: 2,
      schema_version: 1,
      detailed_errors: true,
      schema_path: schema_path(),
      authenticator: WheelSync.Test.WireAuthenticator,
      queries: [WheelSync.Test.WidgetsAll],
      mutations: [
        WheelSync.Test.WidgetCreate,
        WheelSync.Test.WidgetMove,
        WheelSync.Test.WidgetDelete,
        WheelSync.Test.WidgetPair,
        WheelSync.Test.WidgetReject,
        WheelSync.Test.WidgetFail
      ],
      migrations: [
        """
        create table if not exists wire_widgets (
          workspace_id text not null,
          id text not null,
          title text not null,
          position double precision not null,
          active boolean not null,
          note text,
          primary key (workspace_id, id)
        )
        """
      ],
      resetter: WheelSync.Test.WireResetter
    ]
  end

  defp schema_path do
    Path.expand("../../../../test/wire/fixtures/schema.json", __DIR__)
  end
end
