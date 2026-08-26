defmodule WheelSync.PostgresWorkspaceTest do
  use ExUnit.Case, async: false

  @moduletag :postgres

  @workspace_a "wheel-sync-test-a"
  @workspace_b "wheel-sync-test-b"
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

  defp principal(workspace_id) do
    %WheelSync.Principal{
      actor: "user:test",
      workspace_id: workspace_id,
      session_id: "session:test"
    }
  end

  defp cleanup(postgres) do
    for workspace_id <- [@workspace_a, @workspace_b] do
      Postgrex.query!(postgres, "delete from wire_widgets where workspace_id = $1", [workspace_id])

      Postgrex.query!(postgres, "delete from wheel_sync_workspaces where workspace_id = $1", [
        workspace_id
      ])
    end
  end
end
