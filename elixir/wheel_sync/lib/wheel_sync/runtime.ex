defmodule WheelSync.Runtime do
  @moduledoc false
  use GenServer

  def start_link(options) do
    names = Keyword.fetch!(options, :names)
    GenServer.start_link(__MODULE__, options, name: names.runtime)
  end

  def config(server), do: GenServer.call(server, :config)

  def workspace(server, workspace_id) do
    %{names: names, registry: registry} = config = config(server)

    WheelSync.WorkspaceSupervisor.fetch(names, registry, workspace_id,
      presence_filter: Map.get(config, :presence_filter)
    )
  end

  def reset(server), do: GenServer.call(server, :reset, 30_000)

  @impl true
  def init(options) do
    names = Keyword.fetch!(options, :names)
    registry = Keyword.fetch!(options, :registry)
    config = options |> Keyword.fetch!(:options) |> Map.new()
    WheelSync.Storage.ensure_schema!(names.postgres, Map.get(config, :migrations, []))

    case Map.get(config, :bootstrapper) do
      nil -> :ok
      bootstrapper -> :ok = bootstrapper.bootstrap(names.postgres, config)
    end

    {:ok,
     Map.merge(config, %{
       names: names,
       registry: registry,
       row_schema_fingerprint: registry.contract.row_schema_fingerprint
     })}
  end

  @impl true
  def handle_call(:config, _from, state), do: {:reply, state, state}

  def handle_call(:reset, _from, state) do
    :ok = WheelSync.WorkspaceSupervisor.stop_all(state.names)

    result =
      case Map.get(state, :resetter) do
        nil -> {:error, :reset_not_enabled}
        resetter -> resetter.reset(state.names.postgres)
      end

    {:reply, result, state}
  end
end
