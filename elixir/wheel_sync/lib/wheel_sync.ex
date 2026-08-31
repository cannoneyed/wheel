defmodule WheelSync do
  @moduledoc false

  @protocol_version 3

  def protocol_version, do: @protocol_version

  def child_spec(options) do
    %{
      id: __MODULE__,
      start: {WheelSync.Supervisor, :start_link, [options]},
      type: :supervisor
    }
  end
end
