defmodule WheelTracker.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    options = WheelTracker.Config.options()
    Supervisor.start_link([{WheelSync, options}], strategy: :one_for_one, name: __MODULE__)
  end
end
