defmodule WheelSync.Delivery do
  @moduledoc false
  use GenServer

  def start_link(connection), do: GenServer.start_link(__MODULE__, connection)

  @impl true
  def init(connection) do
    Process.monitor(connection)

    {:ok,
     %{
       connection: connection,
       required: %{},
       applied: %{},
       target: 0,
       sent: 0,
       subscriptions: %{}
     }}
  end

  @impl true
  def handle_info({:track, id, key, seq, worker, from}, state) do
    GenServer.cast(worker, {:subscribe, id, self(), from})

    state = %{
      state
      | subscriptions: Map.put(state.subscriptions, id, key),
        required: Map.update(state.required, key, seq, &max(&1, seq))
    }

    {:noreply, checkpoint(state)}
  end

  def handle_info({:untrack, id}, state) do
    {key, subscriptions} = Map.pop(state.subscriptions, id)
    state = %{state | subscriptions: subscriptions}

    state =
      if key not in Map.values(subscriptions),
        do: %{
          state
          | required: Map.delete(state.required, key),
            applied: Map.delete(state.applied, key)
        },
        else: state

    {:noreply, checkpoint(state)}
  end

  def handle_info({:snapshot, id, key, seq, from, result}, state) do
    # Snapshot and subsequent deltas come from the same worker. Forwarding them
    # here also orders the snapshot response before the first delta on the socket.
    if Map.has_key?(state.subscriptions, id) do
      WheelSync.Reply.send(from, result)
      state = %{state | applied: Map.update(state.applied, key, seq, &max(&1, seq))}
      {:noreply, checkpoint(state)}
    else
      WheelSync.Reply.send(from, {:error, "cancelled", "The subscription was cancelled."})
      {:noreply, state}
    end
  end

  def handle_info({:advance, seq, keys}, state) do
    required =
      Enum.reduce(keys, state.required, fn key, required ->
        if Map.has_key?(required, key), do: Map.put(required, key, seq), else: required
      end)

    {:noreply, checkpoint(%{state | target: max(seq, state.target), required: required})}
  end

  def handle_info({:applied, key, seq}, state) do
    state =
      if Map.has_key?(state.required, key),
        do: %{state | applied: Map.update(state.applied, key, seq, &max(&1, seq))},
        else: state

    {:noreply, checkpoint(state)}
  end

  def handle_info({:wheel_event, event}, state) do
    id =
      case event do
        %{"delta" => delta} -> delta["subscriptionId"]
        %{"status" => status} -> status["subscriptionId"]
      end

    if Map.has_key?(state.subscriptions, id), do: forward(state, {:wheel_event, event})
    {:noreply, state}
  end

  def handle_info({:DOWN, _ref, :process, _pid, _reason}, state), do: {:stop, :normal, state}

  defp checkpoint(state) do
    if state.target > state.sent and
         Enum.all?(state.required, fn {key, seq} -> Map.get(state.applied, key, -1) >= seq end) do
      forward(state, {:wheel_event, %{"type" => "checkpoint", "seq" => state.target}})
      %{state | sent: state.target}
    else
      state
    end
  end

  defp forward(state, message) do
    case Process.info(state.connection, :message_queue_len) do
      {:message_queue_len, size} when size < 256 -> send(state.connection, message)
      nil -> :ok
      _ -> Process.exit(state.connection, :shutdown)
    end
  end
end
