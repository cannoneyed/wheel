defmodule WheelSync.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    if Application.get_env(:wheel_sync, :enabled, false) do
      WheelSync.Supervisor.start_link(Application.get_all_env(:wheel_sync))
    else
      Supervisor.start_link([], strategy: :one_for_one, name: WheelSync.DisabledSupervisor)
    end
  end
end
