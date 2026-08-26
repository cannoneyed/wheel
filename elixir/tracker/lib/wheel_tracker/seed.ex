defmodule WheelTracker.Seed do
  @moduledoc false

  @tables ~w(
    favorites views notifications activity reactions comments issue_labels labels
    issue_relations issues cycles projects workflow_states teams users
  )

  def bootstrap(postgres, _config) do
    workspace_id = System.get_env("TRACKER_WORKSPACE_ID", "axle-demo")

    case Postgrex.transaction(
           postgres,
           fn connection ->
             Postgrex.query!(
               connection,
               "select set_config('wheel.workspace_id', $1, true)",
               [workspace_id]
             )

             if System.get_env("TRACKER_RESET_DATABASE") == "1" do
               reset(connection, workspace_id)
             end

             for %{"sql" => sql, "params" => params} <- operations() do
               Postgrex.query!(connection, postgres_sql(sql), params)
             end

             :ok
           end,
           timeout: 120_000
         ) do
      {:ok, :ok} -> :ok
      {:error, reason} -> raise "Tracker seed failed: #{inspect(reason)}"
    end
  end

  defp reset(connection, workspace_id) do
    for table <- @tables do
      Postgrex.query!(connection, "delete from #{table} where workspace_id = $1", [workspace_id])
    end

    Postgrex.query!(connection, "delete from wheel_sync_workspaces where workspace_id = $1", [
      workspace_id
    ])
  end

  defp operations do
    seed_path()
    |> File.read!()
    |> Jason.decode!()
  end

  defp seed_path do
    Path.expand("../../../../packages/tracker/server/seed-operations.json", __DIR__)
  end

  defp postgres_sql(sql) do
    sql
    |> String.replace("on conflict (id)", "on conflict (workspace_id, id)")
    |> String.replace(
      "on conflict (issue_id, label_id)",
      "on conflict (workspace_id, issue_id, label_id)"
    )
    |> String.replace(
      "on conflict (comment_id, user_id, emoji)",
      "on conflict (workspace_id, comment_id, user_id, emoji)"
    )
    |> placeholders()
  end

  defp placeholders(sql) do
    sql
    |> String.split("?")
    |> Enum.with_index()
    |> Enum.map_join(fn
      {part, 0} -> part
      {part, index} -> "$#{index}" <> part
    end)
  end
end
