defmodule WheelSync.Names do
  @moduledoc false

  @enforce_keys [:postgres, :notifications, :workspace_registry, :workspace_supervisor, :runtime]
  defstruct [:postgres, :notifications, :workspace_registry, :workspace_supervisor, :runtime]

  def from_options(options) do
    namespace = Keyword.get(options, :name, WheelSync)

    %__MODULE__{
      postgres: Keyword.get(options, :postgres_name, Module.concat(namespace, Postgres)),
      notifications: Module.concat(namespace, Notifications),
      workspace_registry:
        Keyword.get(
          options,
          :workspace_registry_name,
          Module.concat(namespace, WorkspaceRegistry)
        ),
      workspace_supervisor:
        Keyword.get(
          options,
          :workspace_supervisor_name,
          Module.concat(namespace, WorkspaceSupervisor)
        ),
      runtime: Keyword.get(options, :runtime_name, Module.concat(namespace, Runtime))
    }
  end
end
