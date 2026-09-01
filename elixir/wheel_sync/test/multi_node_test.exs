defmodule WheelSync.MultiNodeTest do
  use ExUnit.Case, async: false

  @moduletag :postgres

  test "a committed change reaches both supervisors and duplicate notifications do nothing" do
    {_, names_a} = start_runtime(:live_a)
    {_, names_b} = start_runtime(:live_b)
    workspace_id = "wheel-sync-multi-live"
    cleanup(names_a.postgres, workspace_id)
    on_exit(fn -> cleanup_database(workspace_id) end)

    {:ok, workspace_a} = WheelSync.Runtime.workspace(names_a.runtime, workspace_id)
    {:ok, workspace_b} = WheelSync.Runtime.workspace(names_b.runtime, workspace_id)
    {subscriber_a, _snapshot_a} = subscribe_process(workspace_a, workspace_id, "client:a")
    {subscriber_b, _snapshot_b} = subscribe_process(workspace_b, workspace_id, "client:b")

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(
               workspace_a,
               create_request(
                 "m_0190b62e-0000-7000-8000-000000000061",
                 "widget_0190b62e-0000-7000-8000-000000000061",
                 "Across nodes"
               ),
               principal(workspace_id)
             )

    for subscriber <- [subscriber_a, subscriber_b] do
      assert_receive {:subscriber_event, ^subscriber,
                      %{"type" => "delta", "delta" => %{"seq" => 1}}}

      assert_receive {:subscriber_event, ^subscriber, %{"type" => "checkpoint", "seq" => 1}}
    end

    :erlang.trace_pattern({WheelSync.Test.WidgetsAll, :sql, 2}, true, [])
    :erlang.trace(workspace_b, true, [:call])

    on_exit(fn ->
      :erlang.trace_pattern({WheelSync.Test.WidgetsAll, :sql, 2}, false, [])
    end)

    for _ <- 1..2 do
      Postgrex.query!(names_a.postgres, "select pg_notify($1, $2)", [
        WheelSync.Storage.change_channel(),
        WheelSync.Storage.notification_key(workspace_id)
      ])
    end

    refute_receive {:trace, ^workspace_b, :call, {WheelSync.Test.WidgetsAll, :sql, _}}, 100
    refute_receive {:subscriber_event, ^subscriber_b, _event}, 50
  end

  test "the periodic check recovers a missed notification" do
    {_, names_a} = start_runtime(:periodic_a)
    {_, names_b} = start_runtime(:periodic_b)
    workspace_id = "wheel-sync-multi-periodic"
    cleanup(names_a.postgres, workspace_id)
    on_exit(fn -> cleanup_database(workspace_id) end)

    {:ok, workspace_b} = WheelSync.Runtime.workspace(names_b.runtime, workspace_id)
    {subscriber, _snapshot} = subscribe_process(workspace_b, workspace_id, "client:periodic")

    assert 1 ==
             commit_without_notification(
               names_a.postgres,
               workspace_id,
               "widget_0190b62e-0000-7000-8000-000000000062",
               "Recovered"
             )

    send(workspace_b, :wheel_sync_periodic_catch_up)

    assert_receive {:subscriber_event, ^subscriber,
                    %{
                      "type" => "delta",
                      "delta" => %{"seq" => 1, "puts" => [%{"title" => "Recovered"}]}
                    }},
                   500

    assert_receive {:subscriber_event, ^subscriber, %{"type" => "checkpoint", "seq" => 1}}
  end

  test "a listener restart catches up to the highest unseen sequence once" do
    {_, names_a} = start_runtime(:restart_a)
    {supervisor_b, names_b} = start_runtime(:restart_b)
    workspace_id = "wheel-sync-multi-restart"
    cleanup(names_a.postgres, workspace_id)
    on_exit(fn -> cleanup_database(workspace_id) end)

    {:ok, workspace_b} = WheelSync.Runtime.workspace(names_b.runtime, workspace_id)
    {subscriber, _snapshot} = subscribe_process(workspace_b, workspace_id, "client:restart")

    assert 1 ==
             commit_without_notification(
               names_a.postgres,
               workspace_id,
               "widget_0190b62e-0000-7000-8000-000000000063",
               "First"
             )

    assert 2 ==
             commit_without_notification(
               names_a.postgres,
               workspace_id,
               "widget_0190b62e-0000-7000-8000-000000000064",
               "Second"
             )

    old_listener = child_pid(supervisor_b, WheelSync.ChangeListener)
    monitor = Process.monitor(old_listener)
    Process.exit(old_listener, :kill)
    assert_receive {:DOWN, ^monitor, :process, ^old_listener, :killed}
    assert is_pid(wait_for_restarted_child(supervisor_b, WheelSync.ChangeListener, old_listener))

    assert_receive {:subscriber_event, ^subscriber,
                    %{
                      "type" => "delta",
                      "delta" => %{"seq" => 2, "puts" => puts}
                    }},
                   500

    assert Enum.map(puts, & &1["title"]) == ["First", "Second"]
    assert_receive {:subscriber_event, ^subscriber, %{"type" => "checkpoint", "seq" => 2}}
    refute_receive {:subscriber_event, ^subscriber, _event}, 50
  end

  test "a local commit includes an earlier unseen remote sequence" do
    {_, names_a} = start_runtime(:interleave_a)
    {_, names_b} = start_runtime(:interleave_b)
    workspace_id = "wheel-sync-multi-interleave"
    cleanup(names_a.postgres, workspace_id)
    on_exit(fn -> cleanup_database(workspace_id) end)

    {:ok, workspace_b} = WheelSync.Runtime.workspace(names_b.runtime, workspace_id)
    {subscriber, _snapshot} = subscribe_process(workspace_b, workspace_id, "client:interleave")

    assert 1 ==
             commit_without_notification(
               names_a.postgres,
               workspace_id,
               "widget_0190b62e-0000-7000-8000-000000000065",
               "Remote first"
             )

    assert {:ok, %{"ok" => true, "seq" => 2}} =
             WheelSync.Workspace.mutate_group(
               workspace_b,
               create_request(
                 "m_0190b62e-0000-7000-8000-000000000066",
                 "widget_0190b62e-0000-7000-8000-000000000066",
                 "Local second"
               ),
               principal(workspace_id)
             )

    assert_receive {:subscriber_event, ^subscriber,
                    %{"type" => "delta", "delta" => %{"seq" => 2, "puts" => puts}}}

    assert Enum.map(puts, & &1["title"]) == ["Remote first", "Local second"]
    assert_receive {:subscriber_event, ^subscriber, %{"type" => "checkpoint", "seq" => 2}}
    refute_receive {:subscriber_event, ^subscriber, _event}, 50
  end

  test "source invalidation reaches source subscriptions on both supervisors" do
    {_, names_a} = start_runtime(:source_a)
    {_, names_b} = start_runtime(:source_b)
    workspace_id = "wheel-sync-multi-source"
    cleanup(names_a.postgres, workspace_id)
    WheelSync.Test.SourceWidgetsAll.reset([source_widget("Before")])

    on_exit(fn ->
      WheelSync.Test.SourceWidgetsAll.stop()
      cleanup_database(workspace_id)
    end)

    {:ok, workspace_a} = WheelSync.Runtime.workspace(names_a.runtime, workspace_id)
    {:ok, workspace_b} = WheelSync.Runtime.workspace(names_b.runtime, workspace_id)

    {subscriber_a, _snapshot_a} =
      subscribe_process(workspace_a, workspace_id, "client:source-a", "source_widgets.all")

    {subscriber_b, _snapshot_b} =
      subscribe_process(workspace_b, workspace_id, "client:source-b", "source_widgets.all")

    WheelSync.Test.SourceWidgetsAll.put_rows([source_widget("After")])
    assert 1 == commit_source_invalidation(names_a.postgres, workspace_id)

    for subscriber <- [subscriber_a, subscriber_b] do
      assert_receive {:subscriber_event, ^subscriber,
                      %{
                        "type" => "delta",
                        "delta" => %{"seq" => 1, "puts" => [%{"title" => "After"}]}
                      }}

      assert_receive {:subscriber_event, ^subscriber, %{"type" => "checkpoint", "seq" => 1}}
    end
  end

  defp start_runtime(label) do
    namespace = Module.concat(__MODULE__, label |> Atom.to_string() |> Macro.camelize())

    options =
      System.fetch_env!("DATABASE_URL")
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.merge(
        serve: false,
        name: namespace,
        supervisor_name: Module.concat(namespace, Supervisor)
      )

    supervisor =
      start_supervised!({WheelSync.Supervisor, options},
        id: Module.concat(namespace, RootSupervisor)
      )

    {supervisor, WheelSync.Names.from_options(options)}
  end

  defp subscribe_process(workspace, workspace_id, client_id, query \\ "widgets.all") do
    parent = self()

    pid =
      spawn(fn ->
        {:ok, []} =
          WheelSync.Workspace.join(workspace, %{
            pid: self(),
            client_id: client_id,
            owner_client_id: client_id,
            principal: principal(workspace_id)
          })

        {:ok, snapshot} = WheelSync.Workspace.subscribe(workspace, self(), query, %{})
        send(parent, {:subscriber_ready, self(), snapshot})
        relay_events(parent)
      end)

    on_exit(fn -> if Process.alive?(pid), do: Process.exit(pid, :kill) end)
    assert_receive {:subscriber_ready, ^pid, snapshot}
    {pid, snapshot}
  end

  defp relay_events(parent) do
    receive do
      {:wheel_event, event} ->
        send(parent, {:subscriber_event, self(), event})
        relay_events(parent)
    end
  end

  defp commit_without_notification(postgres, workspace_id, id, title) do
    {:ok, seq} =
      Postgrex.transaction(postgres, fn connection ->
        Postgrex.query!(
          connection,
          """
          insert into wire_widgets
            (workspace_id, id, title, position, sort_order, active, note)
          values ($1, $2, $3, 1, 1, true, null)
          """,
          [workspace_id, id, title]
        )

        seq = WheelSync.Storage.next_seq!(connection, workspace_id)

        Postgrex.query!(
          connection,
          """
          insert into wheel_sync_log
            (workspace_id, seq, mutation_id, name, touched, actor, client_id)
          values ($1, $2, $3, 'test:missed', $4, 'system:test', 'server:test')
          """,
          [workspace_id, seq, "missed_#{id}", ["widgets"]]
        )

        seq
      end)

    seq
  end

  defp commit_source_invalidation(postgres, workspace_id) do
    {:ok, seq} =
      Postgrex.transaction(postgres, fn connection ->
        seq = WheelSync.Storage.next_seq!(connection, workspace_id)

        WheelSync.Storage.append_log!(connection, workspace_id, seq, %{
          mutation_id: "source_multi_node",
          name: "source:source_widgets.all",
          touched: MapSet.new(),
          actor: "system:query-source",
          client_id: "server:source"
        })

        seq
      end)

    seq
  end

  defp create_request(mutation_id, id, title) do
    %{
      "clientId" => "client:multi",
      "mutationId" => mutation_id,
      "calls" => [
        %{
          "name" => "widgets.create",
          "args" => %{
            "title" => title,
            "position" => 1.0,
            "active" => true,
            "note" => nil
          },
          "ids" => [id]
        }
      ]
    }
  end

  defp principal(workspace_id) do
    %WheelSync.Principal{
      actor: "user:multi",
      workspace_id: workspace_id,
      session_id: "session:multi"
    }
  end

  defp source_widget(title) do
    %{
      "id" => "widget_0190b62e-0000-7000-8000-000000000067",
      "title" => title,
      "position" => 1.0,
      "active" => true,
      "note" => nil
    }
  end

  defp child_pid(supervisor, id) do
    supervisor
    |> Supervisor.which_children()
    |> Enum.find_value(fn
      {^id, pid, _type, _modules} when is_pid(pid) -> pid
      _child -> nil
    end)
  end

  defp wait_for_restarted_child(supervisor, id, old_pid, attempts \\ 100)

  defp wait_for_restarted_child(_supervisor, _id, _old_pid, 0),
    do: flunk("child did not restart")

  defp wait_for_restarted_child(supervisor, id, old_pid, attempts) do
    case child_pid(supervisor, id) do
      pid when is_pid(pid) and pid != old_pid ->
        pid

      _pid ->
        Process.sleep(10)
        wait_for_restarted_child(supervisor, id, old_pid, attempts - 1)
    end
  end

  defp cleanup(postgres, workspace_id) do
    Postgrex.query!(postgres, "delete from wire_widgets where workspace_id = $1", [workspace_id])

    Postgrex.query!(postgres, "delete from wire_query_control where workspace_id = $1", [
      workspace_id
    ])

    Postgrex.query!(postgres, "delete from wheel_sync_workspaces where workspace_id = $1", [
      workspace_id
    ])
  end

  defp cleanup_database(workspace_id) do
    options =
      System.fetch_env!("DATABASE_URL")
      |> WheelSync.PostgresOptions.from_url!()

    {:ok, postgres} = Postgrex.start_link(options)
    cleanup(postgres, workspace_id)
    GenServer.stop(postgres)
  end
end
