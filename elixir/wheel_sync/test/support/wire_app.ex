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
      select id,
             case when $2 or coalesce(
               (select fail from wire_query_control where workspace_id = $1),
               false
             ) then null else title end as title,
             position, active, note
      from wire_widgets
      where workspace_id = $1
      order by sort_order, id
      """,
      [principal.workspace_id, principal.actor == "user:query-failure"]
    }
  end
end

defmodule WheelSync.Test.SourceWidgetsAll do
  @behaviour WheelSync.Query

  @store WheelSync.Test.SourceWidgetsStore

  @impl true
  def name, do: "source_widgets.all"

  @impl true
  def run(_params, _principal) do
    ensure_store!()

    Agent.get(@store, fn
      %{error: nil, rows: rows} -> rows
      %{error: {code, message}} -> {:error, code, message}
    end)
  end

  @impl true
  def subscribe(_params, invalidate, _principal) do
    ensure_store!()
    token = make_ref()

    Agent.update(@store, fn state ->
      %{state | listeners: Map.put(state.listeners, token, invalidate), starts: state.starts + 1}
    end)

    fn ->
      if Process.whereis(@store) do
        Agent.update(@store, fn state ->
          %{
            state
            | listeners: Map.delete(state.listeners, token),
              cleanups: state.cleanups + 1
          }
        end)
      end
    end
  end

  def reset(rows \\ []) do
    ensure_store!()

    Agent.update(@store, fn _ ->
      %{rows: rows, error: nil, listeners: %{}, starts: 0, cleanups: 0}
    end)
  end

  def put_rows(rows) do
    ensure_store!()
    Agent.update(@store, &%{&1 | rows: rows, error: nil})
  end

  def fail(code, message) do
    ensure_store!()
    Agent.update(@store, &%{&1 | error: {code, message}})
  end

  def invalidate do
    ensure_store!()
    listeners = Agent.get(@store, &Map.values(&1.listeners))
    Enum.each(listeners, & &1.())
  end

  def stats do
    ensure_store!()
    Agent.get(@store, &Map.take(&1, [:starts, :cleanups]))
  end

  def stop do
    if Process.whereis(@store), do: Agent.stop(@store)
  end

  defp ensure_store! do
    if Process.whereis(@store) == nil do
      case Agent.start(fn -> %{rows: [], error: nil, listeners: %{}, starts: 0, cleanups: 0} end,
             name: @store
           ) do
        {:ok, _pid} -> :ok
        {:error, {:already_started, _pid}} -> :ok
      end
    end
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
      insert into wire_widgets (workspace_id, id, title, position, sort_order, active, note)
      values ($1, $2, $3, $4, $4, $5, $6)
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

defmodule WheelSync.Test.WidgetReorder do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.reorder"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update wire_widgets set sort_order = $1 where workspace_id = $2 and id = $3",
      [args["sortOrder"], tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetTouch do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.touch"

  @impl true
  def run(tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update wire_widgets set title = title where workspace_id = $1 and id = $2",
      [tx.workspace_id, args["widgetId"]]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetBreakQuery do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.breakQuery"

  @impl true
  def run(tx, _args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into wire_query_control (workspace_id, fail)
      values ($1, true)
      on conflict (workspace_id) do update set fail = excluded.fail
      """,
      [tx.workspace_id]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.WidgetRecoverQuery do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "widgets.recoverQuery"

  @impl true
  def run(tx, _args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into wire_query_control (workspace_id, fail)
      values ($1, false)
      on conflict (workspace_id) do update set fail = excluded.fail
      """,
      [tx.workspace_id]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end
end

defmodule WheelSync.Test.SystemNoop do
  @behaviour WheelSync.Mutation

  @impl true
  def name, do: "system.noop"

  @impl true
  def run(_tx, _args, _ctx), do: :ok
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
      insert into wire_widgets (workspace_id, id, title, position, sort_order, active, note)
      values ($1, $2, $3, $4, $4, true, null)
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
      "truncate table wire_query_control, wire_widgets, wheel_sync_log, wheel_sync_workspaces",
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
      queries: [WheelSync.Test.WidgetsAll, WheelSync.Test.SourceWidgetsAll],
      mutations: [
        WheelSync.Test.WidgetCreate,
        WheelSync.Test.WidgetMove,
        WheelSync.Test.WidgetReorder,
        WheelSync.Test.WidgetTouch,
        WheelSync.Test.WidgetBreakQuery,
        WheelSync.Test.WidgetRecoverQuery,
        WheelSync.Test.SystemNoop,
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
          sort_order double precision not null,
          active boolean not null,
          note text,
          primary key (workspace_id, id)
        )
        """,
        """
        alter table wire_widgets add column if not exists sort_order double precision
        """,
        """
        update wire_widgets set sort_order = position where sort_order is null
        """,
        """
        alter table wire_widgets alter column sort_order set not null
        """,
        """
        create table if not exists wire_query_control (
          workspace_id text primary key,
          fail boolean not null
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
