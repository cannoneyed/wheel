defmodule WheelSync.PostgresWorkspaceTest do
  use ExUnit.Case, async: false

  @moduletag :postgres

  @workspace_a "wheel-sync-test-a"
  @workspace_b "wheel-sync-test-b"
  @workspace_query "wheel-sync-test-query"
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
      "name" => "widgets.create",
      "args" => %{
        "title" => "Shared id",
        "position" => 1.0,
        "active" => true,
        "note" => nil
      },
      "ids" => [@widget_id]
    }

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate(workspace_a, request, principal(@workspace_a))

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate(workspace_b, request, principal(@workspace_b))

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate(workspace_a, request, principal(@workspace_a))

    move = %{
      "clientId" => "client:a",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000022",
      "name" => "widgets.move",
      "args" => %{"widgetId" => @widget_id, "position" => 2.0},
      "ids" => []
    }

    assert {:ok, %{"ok" => true, "seq" => 2}} =
             WheelSync.Workspace.mutate(workspace_a, move, principal(@workspace_a))

    assert WheelSync.Storage.current_seq(names.postgres, @workspace_a) == 2
    assert WheelSync.Storage.current_seq(names.postgres, @workspace_b) == 1

    assert [[@workspace_a, @widget_id, 2.0], [@workspace_b, @widget_id, 1.0]] =
             Postgrex.query!(
               names.postgres,
               """
               select workspace_id, id, position
               from wire_widgets
               where workspace_id in ($1, $2)
               order by workspace_id
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
      "name" => "widgets.create",
      "args" => %{
        "title" => "Kept row",
        "position" => 1.0,
        "active" => true,
        "note" => nil
      },
      "ids" => ["widget_0190b62e-0000-7000-8000-000000000031"]
    }

    assert {:ok, %{"ok" => true, "seq" => 1}} =
             WheelSync.Workspace.mutate(workspace, create, principal)

    assert_receive {:wheel_event, %{"type" => "delta", "delta" => %{"seq" => 1}}}
    assert_receive {:wheel_event, %{"type" => "checkpoint", "seq" => 1}}

    break_query = %{
      "clientId" => "client:query",
      "mutationId" => "m_0190b62e-0000-7000-8000-000000000032",
      "name" => "widgets.breakQuery",
      "args" => %{},
      "ids" => []
    }

    assert {:ok, %{"ok" => true, "seq" => 2}} =
             WheelSync.Workspace.mutate(workspace, break_query, principal)

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
      "name" => "widgets.recoverQuery",
      "args" => %{},
      "ids" => []
    }

    assert {:ok, %{"ok" => true, "seq" => 3}} =
             WheelSync.Workspace.mutate(workspace, recover_query, principal)

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

  defp cleanup(postgres) do
    for workspace_id <- [@workspace_a, @workspace_b, @workspace_query] do
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
