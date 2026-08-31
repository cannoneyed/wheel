defmodule WheelSync.PostgresWorkspaceTest do
  use ExUnit.Case, async: false

  @moduletag :postgres

  @workspace_a "wheel-sync-test-a"
  @workspace_b "wheel-sync-test-b"
  @workspace_query "wheel-sync-test-query"
  @workspace_phase3 "wheel-sync-test-phase3"
  @workspace_external_error "wheel-sync-test-external-error"
  @widget_id "widget_0190b62e-0000-7000-8000-000000000021"
  @mutation_id "m_0190b62e-0000-7000-8000-000000000021"

  test "workspaces isolate rows, sequences, and duplicate mutation ids" do
    database_url = System.fetch_env!("DATABASE_URL")

    options =
      database_url
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.put(:serve, false)
      |> Keyword.put(:name, __MODULE__)
      |> Keyword.put(:supervisor_name, Module.concat(__MODULE__, Supervisor))

    supervisor = start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    cleanup(names.postgres)

    on_exit(fn ->
      if Process.alive?(supervisor), do: cleanup(names.postgres)
    end)

    {:ok, workspace_a} = WheelSync.Runtime.workspace(names.runtime, @workspace_a)
    {:ok, workspace_b} = WheelSync.Runtime.workspace(names.runtime, @workspace_b)

    request = %{
      "clientId" => "client:shared-id",
      "mutationId" => @mutation_id,
      "calls" => [
        %{
          "name" => "widgets.create",
          "args" => %{
            "title" => "Shared id",
            "position" => 1.0,
            "active" => true,
            "note" => nil
          },
          "ids" => [@widget_id]
        }
      ]
    }

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(workspace_a, request, principal(@workspace_a))

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(workspace_b, request, principal(@workspace_b))

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(workspace_a, request, principal(@workspace_a))

    move = %{
      "clientId" => "client:a",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000022",
      "calls" => [
        %{
          "name" => "widgets.move",
          "args" => %{"widgetId" => @widget_id, "position" => 2.0},
          "ids" => []
        }
      ]
    }

    assert {:ok, %{"ok" => true, "seq" => 2}} =
             WheelSync.Workspace.mutate_group(workspace_a, move, principal(@workspace_a))

    grouped_id = "widget_0190b62e-0000-7000-8000-000000000023"

    grouped = %{
      "clientId" => "client:a",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000023",
      "calls" => [
        %{
          "name" => "widgets.create",
          "args" => %{
            "title" => "Grouped",
            "position" => 1.0,
            "active" => true,
            "note" => nil
          },
          "ids" => [grouped_id]
        },
        %{
          "name" => "widgets.move",
          "args" => %{"widgetId" => grouped_id, "position" => 3.0},
          "ids" => []
        }
      ]
    }

    assert {:ok, %{"ok" => true, "seq" => 3}} =
             WheelSync.Workspace.mutate_group(workspace_a, grouped, principal(@workspace_a))

    assert [[3.0]] =
             Postgrex.query!(
               names.postgres,
               "select position from wire_widgets where workspace_id = $1 and id = $2",
               [@workspace_a, grouped_id]
             ).rows

    assert [["widgets.create,widgets.move"]] =
             Postgrex.query!(
               names.postgres,
               "select name from wheel_sync_log where workspace_id = $1 and seq = 3",
               [@workspace_a]
             ).rows

    rejected = %{
      "clientId" => "client:a",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000024",
      "calls" => [
        %{
          "name" => "widgets.move",
          "args" => %{"widgetId" => @widget_id, "position" => 9.0},
          "ids" => []
        },
        %{
          "name" => "widgets.reject",
          "args" => %{"widgetId" => @widget_id},
          "ids" => []
        }
      ]
    }

    assert {:ok,
            %{
              "ok" => false,
              "rejection" => %{"code" => "forbidden", "kind" => "rejection"}
            }} =
             WheelSync.Workspace.mutate_group(
               workspace_a,
               rejected,
               principal(@workspace_a)
             )

    assert [[2.0]] =
             Postgrex.query!(
               names.postgres,
               "select position from wire_widgets where workspace_id = $1 and id = $2",
               [@workspace_a, @widget_id]
             ).rows

    oversized = %{
      "clientId" => "client:a",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000025",
      "calls" =>
        List.duplicate(
          %{
            "name" => "widgets.move",
            "args" => %{"widgetId" => @widget_id, "position" => 10.0},
            "ids" => []
          },
          129
        )
    }

    assert {:ok, %{"ok" => false, "error" => %{"code" => "group_too_large"}}} =
             WheelSync.Workspace.mutate_group(
               workspace_a,
               oversized,
               principal(@workspace_a)
             )

    assert WheelSync.Storage.current_seq(names.postgres, @workspace_a) == 3
    assert WheelSync.Storage.current_seq(names.postgres, @workspace_b) == 1

    assert [
             [@workspace_a, @widget_id, 2.0],
             [@workspace_a, ^grouped_id, 3.0],
             [@workspace_b, @widget_id, 1.0]
           ] =
             Postgrex.query!(
               names.postgres,
               """
               select workspace_id, id, position
               from wire_widgets
               where workspace_id in ($1, $2)
               order by workspace_id, id
               """,
               [@workspace_a, @workspace_b]
             ).rows

    cleanup(names.postgres)
  end

  test "query failure telemetry matches stale and live events" do
    database_url = System.fetch_env!("DATABASE_URL")

    options =
      database_url
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.put(:serve, false)
      |> Keyword.put(:name, Module.concat(__MODULE__, QueryRuntime))
      |> Keyword.put(:supervisor_name, Module.concat(__MODULE__, QuerySupervisor))

    supervisor = start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    cleanup(names.postgres)
    handler_id = {__MODULE__, self()}

    on_exit(fn ->
      :telemetry.detach(handler_id)
      if Process.alive?(supervisor), do: cleanup(names.postgres)
    end)

    :ok =
      :telemetry.attach_many(
        handler_id,
        [[:wheel_sync, :query, :failure], [:wheel_sync, :query, :recovery]],
        &__MODULE__.handle_query_telemetry/4,
        self()
      )

    principal = principal(@workspace_query)
    {:ok, workspace} = WheelSync.Runtime.workspace(names.runtime, @workspace_query)

    assert {:ok, []} =
             WheelSync.Workspace.join(workspace, %{
               pid: self(),
               client_id: "conn:query",
               owner_client_id: "client:query",
               principal: principal
             })

    assert {:ok, snapshot} = WheelSync.Workspace.subscribe(workspace, self(), "widgets.all", %{})
    assert snapshot["status"] == %{"kind" => "live"}

    create = %{
      "clientId" => "client:query",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000031",
      "calls" => [
        %{
          "name" => "widgets.create",
          "args" => %{
            "title" => "Kept row",
            "position" => 1.0,
            "active" => true,
            "note" => nil
          },
          "ids" => ["widget_0190b62e-0000-7000-8000-000000000031"]
        }
      ]
    }

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate_group(workspace, create, principal)

    assert_receive {:wheel_event, %{"type" => "delta", "delta" => %{"seq" => 1}}}
    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}

    break_query = %{
      "clientId" => "client:query",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000032",
      "calls" => [%{"name" => "widgets.breakQuery", "args" => %{}, "ids" => []}]
    }

    assert {:ok, %{"ok" => true, "seq" => 2}} =
             WheelSync.Workspace.mutate_group(workspace, break_query, principal)

    assert_receive {:wheel_event,
                    %{
                      "type" => "query_status",
                      "status" => %{
                        "seq" => 2,
                        "status" => %{
                          "kind" => "stale",
                          "error" => %{
                            "code" => "query_error",
                            "message" => "The live query failed."
                          }
                        }
                      }
                    }}

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 2}}

    assert_receive {:query_telemetry, [:wheel_sync, :query, :failure], %{count: 1}, metadata}
    assert metadata.query == "widgets.all"
    assert metadata.status == "stale"
    assert metadata.workspace_id == @workspace_query

    recover_query = %{
      "clientId" => "client:query",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000033",
      "calls" => [%{"name" => "widgets.recoverQuery", "args" => %{}, "ids" => []}]
    }

    assert {:ok, %{"ok" => true, "seq" => 3}} =
             WheelSync.Workspace.mutate_group(workspace, recover_query, principal)

    assert_receive {:wheel_event,
                    %{
                      "type" => "query_status",
                      "status" => %{"seq" => 3, "status" => %{"kind" => "live"}}
                    }}

    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 3}}
    assert_receive {:query_telemetry, [:wheel_sync, :query, :recovery], %{count: 1}, metadata}
    assert metadata.status == "live"

    cleanup(names.postgres)
  end

  test "groups exact query terms and isolates a failed principal" do
    options =
      System.fetch_env!("DATABASE_URL")
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.put(:serve, false)
      |> Keyword.put(:name, Module.concat(__MODULE__, Phase3Runtime))
      |> Keyword.put(:supervisor_name, Module.concat(__MODULE__, Phase3Supervisor))

    supervisor = start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    cleanup(names.postgres)

    on_exit(fn ->
      :erlang.trace_pattern({WheelSync.Test.WidgetsAll, :sql, 2}, false, [])
      if Process.alive?(supervisor), do: cleanup(names.postgres)
    end)

    {:ok, workspace} = WheelSync.Runtime.workspace(names.runtime, @workspace_phase3)
    shared = principal(@workspace_phase3)
    failed = %{shared | actor: "user:query-failure", session_id: "session:failed"}

    {first, first_snapshot} = subscribe_process(workspace, shared, "client:first")
    {second, second_snapshot} = subscribe_process(workspace, shared, "client:second")
    {isolated, isolated_snapshot} = subscribe_process(workspace, failed, "client:isolated")

    on_exit(fn ->
      for pid <- [first, second, isolated], Process.alive?(pid), do: Process.exit(pid, :shutdown)
    end)

    assert first_snapshot["status"] == %{"kind" => "live"}
    assert second_snapshot["status"] == %{"kind" => "live"}
    assert isolated_snapshot["status"] == %{"kind" => "live"}

    :erlang.trace_pattern({WheelSync.Test.WidgetsAll, :sql, 2}, true, [])
    :erlang.trace(workspace, true, [:call])

    assert {:ok, %{seq: 1, value: :inserted}} =
             WheelSync.external_write(
               names.runtime,
               @workspace_phase3,
               [source: "job:phase3", actor: "system:phase3"],
               fn tx ->
                 insert_widget(
                   tx,
                   @workspace_phase3,
                   "widget_0190b62e-0000-7000-8000-000000000041",
                   "External"
                 )

                 :ok = WheelSync.Tx.touch!(tx, "widgets")
                 {:ok, :inserted}
               end
             )

    assert_receive {:trace, ^workspace, :call, {WheelSync.Test.WidgetsAll, :sql, [%{}, ^shared]}}

    assert_receive {:trace, ^workspace, :call, {WheelSync.Test.WidgetsAll, :sql, [%{}, ^failed]}}

    refute_receive {:trace, ^workspace, :call, {WheelSync.Test.WidgetsAll, :sql, _}}, 50

    for pid <- [first, second] do
      assert_receive {:subscriber_event, ^pid, %{"type" => "delta", "delta" => %{"seq" => 1}}}

      assert_receive {:subscriber_event, ^pid, %{"type" => "checkpoint", "seq" => 1}}
    end

    assert_receive {:subscriber_event, ^isolated,
                    %{
                      "type" => "query_status",
                      "status" => %{"seq" => 1, "status" => %{"kind" => "stale"}}
                    }}

    assert_receive {:subscriber_event, ^isolated, %{"type" => "checkpoint", "seq" => 1}}

    assert [[mutation_id, "job:phase3", ["widgets"], "system:phase3", "server:external"]] =
             Postgrex.query!(
               names.postgres,
               """
               select mutation_id, name, touched, actor, client_id
               from wheel_sync_log
               where workspace_id = $1 and seq = 1
               """,
               [@workspace_phase3]
             ).rows

    assert String.starts_with?(mutation_id, "external_")
    cleanup(names.postgres)
  end

  test "an external write rollback leaves no application or log row" do
    options =
      System.fetch_env!("DATABASE_URL")
      |> WheelSync.Test.WireApp.options(0)
      |> Keyword.put(:serve, false)
      |> Keyword.put(:name, Module.concat(__MODULE__, ExternalErrorRuntime))
      |> Keyword.put(:supervisor_name, Module.concat(__MODULE__, ExternalErrorSupervisor))

    supervisor = start_supervised!({WheelSync.Supervisor, options})
    names = WheelSync.Names.from_options(options)
    cleanup(names.postgres)

    on_exit(fn ->
      if Process.alive?(supervisor), do: cleanup(names.postgres)
    end)

    {:ok, workspace} = WheelSync.Runtime.workspace(names.runtime, @workspace_external_error)

    assert {:error, :cancelled} =
             WheelSync.external_write(names.runtime, @workspace_external_error, fn tx ->
               insert_widget(
                 tx,
                 @workspace_external_error,
                 "widget_0190b62e-0000-7000-8000-000000000042",
                 "Rollback"
               )

               :ok = WheelSync.Tx.touch!(tx, "widgets")
               {:error, :cancelled}
             end)

    assert [[0]] =
             Postgrex.query!(
               names.postgres,
               "select count(*) from wire_widgets where workspace_id = $1",
               [@workspace_external_error]
             ).rows

    assert [[0]] =
             Postgrex.query!(
               names.postgres,
               "select count(*) from wheel_sync_log where workspace_id = $1",
               [@workspace_external_error]
             ).rows

    assert WheelSync.Storage.current_seq(names.postgres, @workspace_external_error) == 0
    assert Process.alive?(workspace)
    cleanup(names.postgres)
  end

  def handle_query_telemetry(event, measurements, metadata, test_pid) do
    send(test_pid, {:query_telemetry, event, measurements, metadata})
  end

  defp principal(workspace_id) do
    %WheelSync.Principal{
      actor: "user:test",
      workspace_id: workspace_id,
      session_id: "session:test"
    }
  end

  defp subscribe_process(workspace, principal, client_id) do
    parent = self()

    pid =
      spawn(fn ->
        {:ok, []} =
          WheelSync.Workspace.join(workspace, %{
            pid: self(),
            client_id: client_id,
            owner_client_id: client_id,
            principal: principal
          })

        {:ok, snapshot} =
          WheelSync.Workspace.subscribe(workspace, self(), "widgets.all", %{})

        send(parent, {:subscriber_ready, self(), snapshot})
        relay_events(parent)
      end)

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

  defp insert_widget(tx, workspace_id, id, title) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into wire_widgets
        (workspace_id, id, title, position, sort_order, active, note)
      values ($1, $2, $3, 1, 1, true, null)
      """,
      [workspace_id, id, title]
    )
  end

  defp cleanup(postgres) do
    for workspace_id <- [
          @workspace_a,
          @workspace_b,
          @workspace_query,
          @workspace_phase3,
          @workspace_external_error
        ] do
      Postgrex.query!(postgres, "delete from wire_widgets where workspace_id = $1", [workspace_id])

      Postgrex.query!(postgres, "delete from wire_query_control where workspace_id = $1", [
        workspace_id
      ])

      Postgrex.query!(postgres, "delete from wheel_sync_workspaces where workspace_id = $1", [
        workspace_id
      ])
    end
  end
end
