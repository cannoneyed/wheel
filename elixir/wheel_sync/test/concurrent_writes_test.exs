defmodule WheelSync.ConcurrentWritesTest do
  use ExUnit.Case, async: false
  @moduletag :postgres
  @mutation "m_0190b62e-0000-7000-8000-000000000081"
  @widget "widget_0190b62e-0000-7000-8000-000000000081"

  defmodule ControlledCreate do
    @behaviour WheelSync.Mutation
    def name, do: "widgets.create"

    def run(tx, args, ctx) do
      [{:parent, parent}] = :ets.lookup(WheelSync.ConcurrentWritesTest, :parent)
      send(parent, {:entered, self()})

      receive do
        :commit ->
          WheelSync.Test.WidgetCreate.run(tx, args, ctx)

        :reject ->
          {:reject, "test", "abort first attempt"}

        {:query, sql} ->
          WheelSync.Tx.query!(tx, sql)
          WheelSync.Test.WidgetCreate.run(tx, args, ctx)
      after
        5_000 -> raise "test did not release mutation"
      end
    end
  end

  setup context do
    :ets.new(__MODULE__, [:named_table, :public])
    :ets.insert(__MODULE__, {:parent, self()})
    id = "concurrent-writes-#{System.unique_integer([:positive])}"
    options = options(__MODULE__, context)
    start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    {:ok, ws} = WheelSync.Runtime.workspace(names.runtime, id)

    on_exit(fn ->
      {:ok, db} =
        Postgrex.start_link(
          WheelSync.PostgresOptions.from_url!(System.fetch_env!("DATABASE_URL"))
        )

      Postgrex.query!(db, "delete from wire_widgets where workspace_id=$1", [id])
      Postgrex.query!(db, "delete from wheel_sync_workspaces where workspace_id=$1", [id])
      GenServer.stop(db)
    end)

    %{ws: ws, names: names, id: id}
  end

  @tag write_pool_size: 1
  test "a changed cached result shape retries the whole mutation", %{ws: ws, names: names, id: id} do
    sql = "SELECT * FROM cached_shape_proof"

    DBConnection.run(names.writer_postgres, fn connection ->
      Postgrex.query!(connection, "CREATE TEMP TABLE cached_shape_proof (value integer)", [])
      WheelSync.Storage.query!(connection, sql)
      Postgrex.query!(connection, "ALTER TABLE cached_shape_proof ADD COLUMN note text", [])
    end)

    first = Task.async(fn -> WheelSync.Workspace.mutate_group(ws, request(), principal(id)) end)
    assert_receive {:entered, worker}
    send(worker, {:query, sql})
    assert {:error, "backend_unavailable", _, true} = Task.await(first)
    assert :missing = WheelSync.Storage.find_committed(names.postgres, id, @mutation)

    retry = Task.async(fn -> WheelSync.Workspace.mutate_group(ws, request(), principal(id)) end)
    assert_receive {:entered, worker}
    send(worker, {:query, sql})
    assert {:ok, %{"ok" => true, "seq" => 1}} = Task.await(retry)
  end

  test "unrelated unsupported SQL remains a terminal error", %{ws: ws, id: id} do
    task = Task.async(fn -> WheelSync.Workspace.mutate_group(ws, request(), principal(id)) end)
    assert_receive {:entered, worker}
    send(worker, {:query, "SELECT 1 UNION SELECT 2 FOR UPDATE"})
    assert {:ok, %{"ok" => false, "error" => %{"code" => "handler_error"}}} = Task.await(task)
  end

  test "B commits and checkpoints while A is stalled before sequence allocation", %{
    ws: ws,
    names: names,
    id: id
  } do
    parent = self()
    principal = principal(id)

    {:ok, _} =
      WheelSync.Workspace.join(ws, %{
        pid: self(),
        client_id: "reader",
        owner_client_id: "reader",
        principal: principal
      })

    {:ok, _} = WheelSync.Workspace.subscribe(ws, self(), "widgets.all", %{})

    slow =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "A")
          gate(parent)
          {:ok, :a}
        end)
      end)

    assert_receive {:entered, worker}

    fast =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "B")
          {:ok, :b}
        end)
      end)

    assert {:ok, {:ok, %{seq: 1}}} = Task.yield(fast, 1_000)
    assert Task.yield(slow, 0) == nil

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}, 1_000

    assert [["B"]] =
             Postgrex.query!(
               names.postgres,
               "select id from wire_widgets where workspace_id=$1",
               [id]
             ).rows

    send(worker, :commit)
    assert {:ok, %{seq: 2}} = Task.await(slow)
    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 2}}, 1_000
  end

  for outcome <- [:commit, :reject] do
    @outcome outcome
    test "duplicate commands coordinate across runtimes after #{@outcome}", %{
      ws: ws,
      names: names,
      id: id
    } do
      other_options = options(Module.concat(__MODULE__, Other), %{})
      start_supervised!(Supervisor.child_spec({WheelSync.Supervisor, other_options}, id: :other))
      other_names = WheelSync.Names.from_options(other_options)
      {:ok, other_ws} = WheelSync.Runtime.workspace(other_names.runtime, id)
      first = Task.async(fn -> WheelSync.Workspace.mutate_group(ws, request(), principal(id)) end)
      assert_receive {:entered, worker}

      second =
        Task.async(fn -> WheelSync.Workspace.mutate_group(other_ws, request(), principal(id)) end)

      wait_for_lock(names.postgres)
      refute_receive {:entered, _}, 30
      send(worker, @outcome)

      if @outcome == :reject do
        assert {:ok, %{"ok" => false, "rejection" => _}} = Task.await(first)
        assert_receive {:entered, next}
        send(next, :commit)
      else
        assert {:ok, %{"seq" => 1}} = Task.await(first)
      end

      assert {:ok, %{"ok" => true, "seq" => 1}} = Task.await(second)

      assert [[1]] =
               Postgrex.query!(
                 names.postgres,
                 "select count(*) from wheel_sync_log where workspace_id=$1",
                 [id]
               ).rows

      assert [[1]] =
               Postgrex.query!(
                 names.postgres,
                 "select count(*) from wire_widgets where workspace_id=$1",
                 [id]
               ).rows
    end
  end

  test "a committed command survives losing the worker before its reply", %{
    ws: ws,
    names: names,
    id: id
  } do
    once = :atomics.new(1, [])
    :atomics.put(once, 1, 1)
    handler = {__MODULE__, id}

    :telemetry.attach(
      handler,
      [:wheel_sync, :write, :stop],
      fn _, _, metadata, _ ->
        if metadata.workspace_id == id and :atomics.compare_exchange(once, 1, 1, 0) == :ok do
          Process.exit(self(), :kill)
        end
      end,
      nil
    )

    on_exit(fn -> :telemetry.detach(handler) end)

    first = Task.async(fn -> WheelSync.Workspace.mutate_group(ws, request(), principal(id)) end)
    assert_receive {:entered, worker}
    send(worker, :commit)
    assert {:error, "backend_unavailable", _, true} = Task.await(first)
    assert 1 == WheelSync.Storage.current_seq(names.postgres, id)

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(ws, request(), principal(id))

    refute_receive {:entered, _}, 30
    assert length(WheelSync.Storage.changes_after(names.postgres, id, 0)) == 1
  end

  test "same-row read-modify-write uses a row lock", %{ws: ws, names: names, id: id} do
    external(ws, fn tx ->
      insert(tx, "counter")
      {:ok, nil}
    end)

    parent = self()

    update = fn tx, block ->
      [[value]] =
        WheelSync.Tx.exec!(
          tx,
          "select position from wire_widgets where workspace_id=$1 and id='counter' for update",
          [id]
        ).rows

      if block, do: gate(parent)

      WheelSync.Tx.exec!(
        tx,
        "update wire_widgets set position=$1 where workspace_id=$2 and id='counter'",
        [value + 1, id]
      )

      WheelSync.Tx.touch!(tx, "widgets")
      {:ok, nil}
    end

    first = Task.async(fn -> external(ws, &update.(&1, true)) end)
    assert_receive {:entered, worker}
    second = Task.async(fn -> external(ws, &update.(&1, false)) end)
    wait_for_lock(names.postgres)
    send(worker, :commit)
    assert {:ok, _} = Task.await(first)
    assert {:ok, _} = Task.await(second)

    assert [[2.0]] =
             Postgrex.query!(
               names.postgres,
               "select position from wire_widgets where workspace_id=$1 and id='counter'",
               [id]
             ).rows
  end

  test "the sequence lock prevents a later commit from overtaking", %{
    ws: ws,
    names: names,
    id: id
  } do
    parent = self()
    channel = WheelSync.Storage.change_channel()
    key = WheelSync.Storage.notification_key(id)
    {:ok, ref} = Postgrex.Notifications.listen(names.notifications, channel)

    entry = %{
      mutation_id: "held",
      name: "held",
      touched: MapSet.new(),
      actor: "test",
      client_id: "test"
    }

    assert {:error, :cancelled} =
             Postgrex.transaction(names.writer_postgres, fn conn ->
               assert 1 == WheelSync.Storage.next_seq!(conn, id)
               WheelSync.Storage.append_log!(conn, id, 1, entry)
               Postgrex.rollback(conn, :cancelled)
             end)

    assert 0 == WheelSync.Storage.current_seq(names.postgres, id)
    assert [] == WheelSync.Storage.changes_after(names.postgres, id, 0)
    refute_receive {:notification, _, ^ref, ^channel, ^key}, 30

    held =
      Task.async(fn ->
        Postgrex.transaction(names.writer_postgres, fn conn ->
          seq = WheelSync.Storage.next_seq!(conn, id)

          WheelSync.Storage.append_log!(conn, id, seq, entry)

          gate(parent)
          seq
        end)
      end)

    assert_receive {:entered, worker}

    later =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "later")
          {:ok, nil}
        end)
      end)

    wait_for_lock(names.postgres)
    assert 0 == WheelSync.Storage.current_seq(names.postgres, id)
    assert [] == WheelSync.Storage.changes_after(names.postgres, id, 0)
    refute_receive {:notification, _, ^ref, ^channel, ^key}, 30
    send(worker, :commit)
    assert {:ok, 1} = Task.await(held)
    assert {:ok, %{seq: 2}} = Task.await(later)
    assert_receive {:notification, _, ^ref, ^channel, ^key}
    assert [1, 2] == Enum.map(WheelSync.Storage.changes_after(names.postgres, id, 0), & &1.seq)
  end

  @tag write_pool_size: 1, write_queue_size: 0
  test "the write limit spans workspaces and recovers after a killed task", %{
    ws: ws,
    names: names,
    id: id
  } do
    parent = self()

    held =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "abort")
          gate(parent)
          {:ok, nil}
        end)
      end)

    assert_receive {:entered, worker}
    {:ok, other} = WheelSync.Runtime.workspace(names.runtime, id <> "-other")

    assert {:error, "backend_unavailable", _, true} =
             external(other, fn _ -> flunk("overload ran callback") end)

    assert length(Task.Supervisor.children(names.write_tasks)) == 1
    Process.exit(worker, :kill)
    assert {:error, "backend_unavailable", _, true} = Task.await(held)

    assert {:ok, %{seq: 1}} =
             external(ws, fn tx ->
               insert(tx, "survives")
               {:ok, nil}
             end)

    assert [["survives"]] =
             Postgrex.query!(
               names.postgres,
               "select id from wire_widgets where workspace_id=$1",
               [id]
             ).rows
  end

  @tag write_timeout: 100
  test "a transaction deadline releases capacity and rolls back", %{ws: ws, names: names, id: id} do
    parent = self()

    held =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "abort")
          gate(parent)
          {:ok, nil}
        end)
      end)

    assert_receive {:entered, _worker}
    assert {:error, "backend_unavailable", _, true} = Task.await(held)

    assert {:ok, %{seq: 1}} =
             external(ws, fn tx ->
               insert(tx, "survives")
               {:ok, nil}
             end)

    assert [["survives"]] =
             Postgrex.query!(
               names.postgres,
               "select id from wire_widgets where workspace_id=$1",
               [id]
             ).rows
  end

  test "workspace shutdown stops its transactions", %{ws: ws, names: names, id: id} do
    parent = self()

    held =
      Task.async(fn ->
        external(ws, fn tx ->
          insert(tx, "abort")
          gate(parent)
          {:ok, nil}
        end)
      end)

    assert_receive {:entered, worker}
    monitor = Process.monitor(worker)
    DynamicSupervisor.terminate_child(names.workspace_supervisor, ws)
    assert_receive {:DOWN, ^monitor, :process, ^worker, _}
    assert {:error, "backend_unavailable", _, true} = Task.await(held)
    {:ok, replacement} = WheelSync.Runtime.workspace(names.runtime, id)

    assert {:ok, %{seq: 1}} =
             external(replacement, fn tx ->
               insert(tx, "survives")
               {:ok, nil}
             end)

    assert [["survives"]] =
             Postgrex.query!(
               names.postgres,
               "select id from wire_widgets where workspace_id=$1",
               [id]
             ).rows
  end

  @tag write_pool_size: 1, write_queue_size: 0
  test "source invalidation survives write saturation", %{ws: ws, id: id} do
    WheelSync.Test.SourceWidgetsAll.reset()
    on_exit(&WheelSync.Test.SourceWidgetsAll.stop/0)
    principal = principal(id)

    {:ok, _} =
      WheelSync.Workspace.join(ws, %{
        pid: self(),
        client_id: "reader",
        owner_client_id: "reader",
        principal: principal
      })

    {:ok, _} = WheelSync.Workspace.subscribe(ws, self(), "source_widgets.all", %{})
    parent = self()

    held =
      Task.async(fn ->
        external(ws, fn tx ->
          gate(parent)
          insert(tx, "held")
          {:ok, nil}
        end)
      end)

    assert_receive {:entered, worker}
    WheelSync.Test.SourceWidgetsAll.invalidate()
    send(worker, :commit)
    assert {:ok, %{seq: 1}} = Task.await(held)
    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 2}}, 2_000
  end

  test "50 simultaneous writers preserve every effect and sequence", %{
    ws: ws,
    names: names,
    id: id
  } do
    for shared <- [false, true] do
      row = if shared, do: "shared", else: "unused"

      if shared,
        do:
          external(ws, fn tx ->
            insert(tx, row)
            {:ok, nil}
          end)

      outcomes =
        1..50
        |> Task.async_stream(
          fn n ->
            external(ws, fn tx ->
              if shared do
                WheelSync.Tx.exec!(
                  tx,
                  "update wire_widgets set position=position+1 where workspace_id=$1 and id=$2",
                  [id, row]
                )

                WheelSync.Tx.touch!(tx, "widgets")
              else
                insert(tx, "writer-#{n}")
              end

              {:ok, n}
            end)
          end,
          max_concurrency: 50,
          timeout: 10_000
        )
        |> Enum.to_list()

      assert Enum.all?(outcomes, &match?({:ok, {:ok, %{seq: _}}}, &1))
    end

    assert [[50.0]] =
             Postgrex.query!(
               names.postgres,
               "select position from wire_widgets where workspace_id=$1 and id='shared'",
               [id]
             ).rows

    assert Enum.to_list(1..101) ==
             Enum.map(WheelSync.Storage.changes_after(names.postgres, id, 0), & &1.seq)
  end

  defp options(name, tags) do
    options = System.fetch_env!("DATABASE_URL") |> WheelSync.Test.WireApp.options(0)

    Keyword.merge(options,
      serve: false,
      name: name,
      supervisor_name: Module.concat(name, Supervisor),
      write_pool_size: Map.get(tags, :write_pool_size, 2),
      write_queue_size: Map.get(tags, :write_queue_size, 128),
      write_timeout: Map.get(tags, :write_timeout, 25_000),
      mutations: [
        ControlledCreate | Enum.reject(options[:mutations], &(&1 == WheelSync.Test.WidgetCreate))
      ]
    )
  end

  defp external(ws, callback),
    do: WheelSync.Workspace.external_write(ws, [source: "test", actor: "test"], callback)

  defp insert(tx, id) do
    WheelSync.Tx.exec!(
      tx,
      "insert into wire_widgets(workspace_id,id,title,position,sort_order,active) values($1,$2,$2,0,0,true)",
      [tx.workspace_id, id]
    )

    WheelSync.Tx.touch!(tx, "widgets")
  end

  defp gate(parent) do
    send(parent, {:entered, self()})

    receive do
      :commit -> :ok
    after
      5_000 -> raise "test did not release write"
    end
  end

  # Observe the actual PostgreSQL wait, not elapsed time, before releasing a gate.
  defp wait_for_lock(db, attempts \\ 200)
  defp wait_for_lock(_db, 0), do: flunk("transaction never waited for a database lock")

  defp wait_for_lock(db, attempts) do
    [[count]] =
      Postgrex.query!(
        db,
        "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'",
        []
      ).rows

    if count == 0 do
      Process.sleep(5)
      wait_for_lock(db, attempts - 1)
    end
  end

  defp request do
    %{
      "clientId" => "client",
      "mutationId" => @mutation,
      "calls" => [
        %{
          "name" => "widgets.create",
          "args" => %{"title" => "one", "position" => 1.0, "active" => true, "note" => nil},
          "ids" => [@widget]
        }
      ]
    }
  end

  defp principal(id),
    do: %WheelSync.Principal{workspace_id: id, actor: "user:test", session_id: "session:test"}
end
