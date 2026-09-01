defmodule WheelSync.ChangeListener do
  @moduledoc false
  use GenServer

  def start_link(options), do: GenServer.start_link(__MODULE__, options)

  @impl true
  def init(options) do
    names = Keyword.fetch!(options, :names)

    {_, ref} =
      Postgrex.Notifications.listen(names.notifications, WheelSync.Storage.change_channel())

    for {_, workspace, _, _} <- DynamicSupervisor.which_children(names.workspace_supervisor),
        do: send(workspace, :wheel_sync_catch_up)

    {:ok, %{names: names, ref: ref}}
  end

  @impl true
  def handle_info(
        {:notification, _pid, ref, channel, key},
        %{ref: ref, names: names} = state
      ) do
    if channel == WheelSync.Storage.change_channel() do
      case Registry.lookup(names.workspace_registry, {:change, key}) do
        [{workspace, _value}] -> send(workspace, :wheel_sync_catch_up)
        [] -> :ok
      end
    end

    {:noreply, state}
  end
end
