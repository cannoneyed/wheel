defmodule WheelSync.WorkspaceSupervisor do
  @moduledoc false

  def fetch(names, registry, workspace_id, options) do
    case Registry.lookup(names.workspace_registry, workspace_id) do
      [{pid, _}] ->
        {:ok, pid}

      [] ->
        spec =
          {WheelSync.Workspace,
           names: names,
           registry: registry,
           workspace_id: workspace_id,
           presence_filter: Keyword.get(options, :presence_filter),
           detailed_errors: Keyword.get(options, :detailed_errors, false),
           write_timeout: Keyword.get(options, :write_timeout, 25_000),
           query_cache_bytes: Keyword.get(options, :query_cache_bytes, 128 * 1024 * 1024)}

        case DynamicSupervisor.start_child(names.workspace_supervisor, spec) do
          {:ok, pid} -> {:ok, pid}
          {:error, {:already_started, pid}} -> {:ok, pid}
          other -> other
        end
    end
  end

  def stop_all(names) do
    for {_id, pid, _type, _modules} <-
          DynamicSupervisor.which_children(names.workspace_supervisor) do
      DynamicSupervisor.terminate_child(names.workspace_supervisor, pid)
    end

    :ok
  end
end
