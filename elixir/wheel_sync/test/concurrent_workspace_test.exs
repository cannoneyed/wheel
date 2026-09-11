defmodule WheelSync.ConcurrentWorkspaceTest do
  use ExUnit.Case, async: false
  @moduletag :postgres

  defmodule ControlledQuery do
    @behaviour WheelSync.Query
    def name, do: "widgets.all"

    def subscribe(_params, _invalidate, principal) do
      if principal.actor == "broken-source", do: raise("fixture source cannot attach")
      fn -> :ok end
    end

    def run(params, principal) do
      if :ets.take(WheelSync.ConcurrentWorkspaceTest, {:fail, principal.actor}) != [],
        do: raise(DBConnection.ConnectionError, message: "fixture pool unavailable")

      [{:postgres, postgres}] = :ets.lookup(WheelSync.ConcurrentWorkspaceTest, :postgres)
      {sql, args} = WheelSync.Test.WidgetsAll.sql(params, principal)
      rows = postgres |> Postgrex.query!(sql, args) |> WheelSync.Storage.rows()

      case :ets.take(WheelSync.ConcurrentWorkspaceTest, {:block, principal.actor}) do
        [{_, parent}] ->
          send(parent, {:query_blocked, self(), principal.actor})

          receive do
            :continue -> :ok
          after
            5_000 -> raise "test did not release query"
          end

        [] ->
          :ok
      end

      rows
    end
  end

  setup context do
    :ets.new(__MODULE__, [:named_table, :public])

    options =
      System.fetch_env!("DATABASE_URL")
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.merge(
        serve: false,
        pool_size: Map.get(context, :pool_size, 10),
        name: __MODULE__,
        supervisor_name: __MODULE__.Supervisor,
        query_cache_bytes: Map.get(context, :cache_limit, 128 * 1024 * 1024),
        queries: [ControlledQuery, WheelSync.Test.SourceWidgetsAll]
      )

    start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    :ets.insert(__MODULE__, {:postgres, names.postgres})
    # Each test owns this workspace and never touches copied application rows.
    id = "wheel-concurrent-#{System.unique_integer([:positive])}"
    {:ok, workspace} = WheelSync.Runtime.workspace(names.runtime, id)

    on_exit(fn ->
      {:ok, db} =
        Postgrex.start_link(
          WheelSync.PostgresOptions.from_url!(System.fetch_env!("DATABASE_URL"))
        )

      Postgrex.query!(db, "delete from wire_widgets where workspace_id = $1", [id])
      Postgrex.query!(db, "delete from wheel_sync_workspaces where workspace_id = $1", [id])
      GenServer.stop(db)
    end)

    %{workspace: workspace, id: id, names: names}
  end

  test "one socket receives an independent load while another query is stalled", %{
    workspace: ws,
    id: id
  } do
    principal = join(ws, id, "slow")
    block("slow")
    request(ws, principal, "slow", "widgets.all")
    assert_receive {:query_blocked, worker, "slow"}
    request(ws, principal, "fast", "source_widgets.all")
    assert_receive {:wheel_reply, "fast", {:ok, %{"status" => %{"kind" => "live"}}}}, 500
    assert :ok = WheelSync.Workspace.presence(ws, self(), %{"page" => "document"})
    refute_receive {:wheel_reply, "slow", _}, 20
    send(worker, :continue)
    assert_receive {:wheel_reply, "slow", {:ok, _}}, 500
  end

  test "a stalled write leaves loads and membership responsive", %{workspace: ws, id: id} do
    parent = self()

    task =
      Task.async(fn ->
        WheelSync.Workspace.external_write(
          ws,
          [source: "test:blocked", actor: "system:test"],
          fn tx ->
            send(parent, {:write_blocked, self()})

            receive do
              :continue -> :ok
            end

            WheelSync.Tx.touch!(tx, "widgets")
            {:ok, :done}
          end
        )
      end)

    assert_receive {:write_blocked, writer}
    principal = join(ws, id, "reader")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:wheel_reply, "load", {:ok, _}}, 500
    send(writer, :continue)
    assert {:ok, %{seq: 1, value: :done}} = Task.await(task)
  end

  @tag pool_size: 1
  test "exhausting the read pool does not block a write", %{workspace: ws, id: id, names: names} do
    parent = self()

    reader =
      Task.async(fn ->
        Postgrex.transaction(names.postgres, fn _ ->
          send(parent, :read_pool_held)

          receive do
            :continue -> :ok
          after
            2_000 -> raise "read pool was not released"
          end
        end)
      end)

    assert_receive :read_pool_held
    writer = Task.async(fn -> write(ws, id, "Independent write") end)
    assert {:ok, %{seq: 1}} = Task.await(writer, 500)
    send(reader.pid, :continue)
    assert {:ok, :ok} = Task.await(reader)
  end

  test "an edit during the first load arrives after its snapshot and before its checkpoint", %{
    workspace: ws,
    id: id
  } do
    principal = join(ws, id, "race")
    block("race")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:query_blocked, worker, "race"}
    assert {:ok, %{seq: 1}} = write(ws, id, "During load")
    # The coordinator sees the commit while the query still holds its old rows.
    wait_until(fn -> :sys.get_state(ws).seq == 1 end)
    refute_receive {:wheel_event, %{"type" => "checkpoint"}}, 30
    send(worker, :continue)
    assert_receive {:wheel_reply, "load", {:ok, %{"rows" => [], "subscriptionId" => sub}}}, 500

    assert_receive {:wheel_event,
                    %{
                      "type" => "delta",
                      "delta" => %{
                        "subscriptionId" => ^sub,
                        "seq" => 1,
                        "puts" => [%{"title" => "During load"}]
                      }
                    }},
                   500

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 500
  end

  test "a later edit survives a refresh already in flight", %{workspace: ws, id: id} do
    principal = join(ws, id, "refresh")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:wheel_reply, "load", {:ok, _}}
    block("refresh")
    assert {:ok, %{seq: 1}} = write(ws, id, "First")
    assert_receive {:query_blocked, worker, "refresh"}
    assert {:ok, %{seq: 2}} = write(ws, id, "Second")
    wait_until(fn -> :sys.get_state(ws).seq == 2 end)
    refute_receive {:wheel_event, %{"type" => "checkpoint"}}, 30
    send(worker, :continue)

    assert_receive {:wheel_event,
                    %{
                      "type" => "delta",
                      "delta" => %{"seq" => 1, "puts" => [%{"title" => "First"}]}
                    }}

    assert_receive {:wheel_event,
                    %{
                      "type" => "delta",
                      "delta" => %{"seq" => 2, "puts" => [%{"title" => "Second"}]}
                    }}

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 2}}
  end

  test "a failed refresh cannot checkpoint an edit before its retry loads the rows", %{
    workspace: ws,
    id: id
  } do
    principal = join(ws, id, "retry")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:wheel_reply, "load", {:ok, _}}
    :ets.insert(__MODULE__, {{:fail, "retry"}, true})
    block("retry")
    assert {:ok, %{seq: 1}} = write(ws, id, "Survives failed refresh")

    assert_receive {:wheel_event,
                    %{"type" => "query_status", "status" => %{"status" => %{"kind" => "stale"}}}},
                   500

    refute_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 50
    assert_receive {:query_blocked, worker, "retry"}, 1_500
    refute_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 30
    send(worker, :continue)

    assert_receive {:wheel_event,
                    %{
                      "type" => "delta",
                      "delta" => %{
                        "seq" => 1,
                        "puts" => [%{"title" => "Survives failed refresh"}]
                      }
                    }},
                   500

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 500
  end

  test "equal queries share rows and disconnect releases their workers", %{workspace: ws, id: id} do
    assert {:ok, _} = write(ws, id, "Shared rows")
    principal = join(ws, id, "shared")
    for n <- 1..50, do: request(ws, principal, "load-#{n}", "widgets.all")

    for n <- 1..50 do
      request_id = "load-#{n}"
      assert_receive {:wheel_reply, ^request_id, {:ok, _}}
    end

    state = :sys.get_state(ws)
    assert map_size(state.queries) == 1
    budget = state.cache_budget
    assert :atomics.get(budget, 1) > 0
    worker = state.queries |> Map.values() |> hd() |> Map.fetch!(:pid)
    monitor = Process.monitor(worker)
    WheelSync.Workspace.leave(ws, self())
    assert_receive {:DOWN, ^monitor, :process, ^worker, _}, 500
    state = :sys.get_state(ws)
    assert state.queries == %{}
    assert state.subscriptions == %{}
    assert state.connections == %{}
    assert :atomics.get(budget, 1) == 0
  end

  @tag cache_limit: 2048
  test "an oversized query fails without retaining its rows", %{workspace: ws, id: id} do
    assert {:ok, _} = write(ws, id, String.duplicate("x", 8_000))
    principal = join(ws, id, "limited")
    request(ws, principal, "load", "widgets.all")

    assert_receive {:wheel_reply, "load",
                    {:ok, %{"rows" => [], "status" => %{"kind" => "error"}}}},
                   500

    assert :atomics.get(:sys.get_state(ws).cache_budget, 1) == 0
  end

  test "failed source attachment releases its query and subscription", %{workspace: ws, id: id} do
    principal = join(ws, id, "broken-source")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:wheel_reply, "load", {:error, _, _}}, 500

    wait_until(fn ->
      state = :sys.get_state(ws)
      map_size(state.queries) == 0 and map_size(state.subscriptions) == 0
    end)

    assert {:ok, %{seq: 1}} = write(ws, id, "Still connected")
    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 500
  end

  test "a failed query worker closes its connections for a fresh snapshot", %{
    workspace: ws,
    id: id
  } do
    Process.flag(:trap_exit, true)
    principal = join(ws, id, "crash")
    request(ws, principal, "load", "widgets.all")
    assert_receive {:wheel_reply, "load", {:ok, _}}
    worker = :sys.get_state(ws).queries |> Map.values() |> hd() |> Map.fetch!(:pid)
    Process.exit(worker, :kill)
    assert_receive {:wheel_close, 1012, "sync_restarting"}, 500
  end

  defp join(ws, id, actor) do
    principal = %WheelSync.Principal{actor: actor, workspace_id: id, session_id: "session:test"}

    {:ok, _} =
      WheelSync.Workspace.join(ws, %{
        pid: self(),
        client_id: "test",
        owner_client_id: "test",
        principal: principal
      })

    principal
  end

  defp request(ws, principal, id, query) do
    WheelSync.Workspace.request(
      ws,
      self(),
      %{"type" => "subscribe", "requestId" => id, "query" => query, "params" => %{}},
      principal
    )
  end

  defp block(actor), do: :ets.insert(__MODULE__, {{:block, actor}, self()})

  defp write(ws, id, title) do
    WheelSync.Workspace.external_write(ws, [source: "test:race", actor: "system:test"], fn tx ->
      WheelSync.Tx.exec!(
        tx,
        "insert into wire_widgets (workspace_id,id,title,position,sort_order,active) values ($1,'widget_race',$2,1,1,true) on conflict (workspace_id,id) do update set title=excluded.title",
        [id, title]
      )

      WheelSync.Tx.touch!(tx, "widgets")
      {:ok, :done}
    end)
  end

  defp wait_until(check, left \\ 100)
  defp wait_until(_check, 0), do: flunk("condition did not become true")

  defp wait_until(check, left) do
    if not check.() do
      Process.sleep(5)
      wait_until(check, left - 1)
    end
  end
end
