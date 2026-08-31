defmodule WheelSync do
  @moduledoc false

  @protocol_version 3

  def protocol_version, do: @protocol_version

  def external_write(runtime, workspace_id, callback) when is_function(callback, 1),
    do: external_write(runtime, workspace_id, [], callback)

  def external_write(runtime, workspace_id, options, callback)
      when is_binary(workspace_id) and workspace_id != "" and is_function(callback, 1) do
    options =
      Keyword.validate!(options,
        source: "external.write",
        actor: "system:external"
      )

    for name <- [:source, :actor] do
      value = Keyword.fetch!(options, name)

      if !is_binary(value) or value == "" do
        raise ArgumentError, "#{name} must be a non-empty string"
      end
    end

    with {:ok, workspace} <- WheelSync.Runtime.workspace(runtime, workspace_id) do
      WheelSync.Workspace.external_write(workspace, options, callback)
    end
  end

  def child_spec(options) do
    %{
      id: __MODULE__,
      start: {WheelSync.Supervisor, :start_link, [options]},
      type: :supervisor
    }
  end
end
