defmodule WheelSync.Workspace do
  @moduledoc false
  use GenServer
  require Logger

  @catch_up_interval_ms 30_000
  @max_subscriptions 128
  @max_queries 2048
  @max_writes 128

  def start_link(options) do
    names = Keyword.fetch!(options, :names)
    workspace_id = Keyword.fetch!(options, :workspace_id)

    GenServer.start_link(__MODULE__, options,
      name: {:via, Registry, {names.workspace_registry, workspace_id}}
    )
  end

  def join(server, connection), do: GenServer.call(server, {:join, connection})
  def leave(server, pid), do: GenServer.cast(server, {:leave, pid})

  def subscribe(server, pid, query, params),
    do: GenServer.call(server, {:subscribe, pid, query, params}, 30_000)

  def unsubscribe(server, pid, subscription_id),
    do: GenServer.call(server, {:unsubscribe, pid, subscription_id})

  def mutate_group(server, request, principal),
    do: GenServer.call(server, {:mutate_group, request, principal}, 30_000)

  def external_write(server, options, callback),
    do: GenServer.call(server, {:external_write, options, callback}, 30_000)

  def presence(server, pid, presence), do: GenServer.call(server, {:presence, pid, presence})

  def request(server, pid, request, principal) do
    GenServer.cast(server, {:request, pid, request, principal})
  end

  @impl true
  def init(options) do
    Process.flag(:trap_exit, true)
    names = Keyword.fetch!(options, :names)
    workspace_id = Keyword.fetch!(options, :workspace_id)

    {:ok, _} =
      Registry.register(
        names.workspace_registry,
        {:change, WheelSync.Storage.notification_key(workspace_id)},
        nil
      )

    Process.send_after(self(), :wheel_sync_periodic_catch_up, @catch_up_interval_ms)

    context = %{
      names: names,
      registry: Keyword.fetch!(options, :registry),
      workspace_id: workspace_id,
      owner: self(),
      detailed_errors: Keyword.get(options, :detailed_errors, false)
    }

    {:ok, writer} = WheelSync.Writer.start_link(context)

    {:ok,
     Map.merge(context, %{
       presence_filter: Keyword.get(options, :presence_filter),
       cache_budget: :atomics.new(1, []),
       cache_limit: Keyword.get(options, :query_cache_bytes, 128 * 1024 * 1024),
       seq: WheelSync.Storage.current_seq(names.postgres, workspace_id),
       connections: %{},
       owners: %{},
       subscriptions: %{},
       queries: %{},
       writer: writer,
       writes: 0,
       catch_up: nil,
       catch_up_again: false
     })}
  end

  @impl true
  def handle_call({:join, connection}, _from, state) do
    owner_key =
      {connection.principal.session_id, connection.principal.actor, connection.owner_client_id}

    state =
      case Map.get(state.owners, owner_key) do
        nil ->
          state

        old_pid when old_pid == connection.pid ->
          state

        old_pid ->
          send(old_pid, {:wheel_close, 4409, "superseded"})
          remove_connection(state, old_pid)
      end

    Process.monitor(connection.pid)

    existing_presence =
      for {_pid, peer} <- state.connections,
          peer.presence != nil,
          presence_visible?(state, peer.principal, connection.principal, peer.presence) do
        presence_event(peer.client_id, peer.principal.actor, peer.presence)
      end

    {:ok, relay} = WheelSync.Delivery.start_link(connection.pid)
    connection = connection |> Map.put(:presence, nil) |> Map.put(:relay, relay)

    state = %{
      state
      | connections: Map.put(state.connections, connection.pid, connection),
        owners: Map.put(state.owners, owner_key, connection.pid)
    }

    {:reply, {:ok, existing_presence}, state}
  end

  def handle_call({:subscribe, pid, query, params}, from, state) do
    with {:ok, connection} <- fetch_connection(state, pid),
         {:ok, spec} <- fetch_named(state.registry.contract.queries, query, "unknown_query"),
         :ok <- validate(spec["validator"], params, "invalid_params"),
         :ok <- subscription_capacity(state, pid, {query, params, connection.principal}) do
      key = {query, params, connection.principal}

      {entry, state} =
        case Map.fetch(state.queries, key) do
          {:ok, entry} ->
            {entry, state}

          :error ->
            context =
              Map.take(state, [:names, :workspace_id, :owner, :seq, :cache_budget, :cache_limit])

            {:ok, worker} =
              WheelSync.LiveQuery.start_link(
                Map.merge(
                  context,
                  %{
                    key: key,
                    query: query,
                    params: params,
                    principal: connection.principal,
                    module: Map.fetch!(state.registry.queries, query),
                    collection: Map.fetch!(state.registry.contract.collections, spec["into"])
                  }
                )
              )

            entry = %{
              pid: worker,
              depends_on: MapSet.new(spec["dependsOn"]),
              seq: state.seq,
              subscribers: MapSet.new()
            }

            {entry, %{state | queries: Map.put(state.queries, key, entry)}}
        end

      id = issue_id("sub")
      send(connection.relay, {:track, id, key, entry.seq, entry.pid, from})
      entry = %{entry | subscribers: MapSet.put(entry.subscribers, id)}

      {:noreply,
       %{
         state
         | queries: Map.put(state.queries, key, entry),
           subscriptions: Map.put(state.subscriptions, id, %{pid: pid, key: key})
       }}
    else
      error -> {:reply, error, state}
    end
  end

  def handle_call({:unsubscribe, pid, id}, _from, state) do
    {:reply, :ok, remove_subscription(state, pid, id)}
  end

  def handle_call({:presence, pid, presence}, _from, state) do
    with {:ok, connection} <- fetch_connection(state, pid),
         :ok <- validate_presence(state.registry.contract.presence, presence) do
      previous = connection.presence
      connections = Map.put(state.connections, pid, %{connection | presence: presence})
      broadcast_presence(state, connections, connection, previous, presence, pid)
      {:reply, :ok, %{state | connections: connections}}
    else
      {:error, code, message} -> {:reply, {:error, code, message}, state}
    end
  end

  def handle_call({kind, _a, _b} = request, from, state)
      when kind in [:mutate_group, :external_write] do
    if state.writes >= @max_writes do
      {:reply, {:error, "backend_unavailable", "The write queue is full.", true}, state}
    else
      GenServer.cast(state.writer, {:request, request, from})
      {:noreply, %{state | writes: state.writes + 1}}
    end
  end

  @impl true
  def handle_cast({:request, pid, request, principal}, state) do
    from = {:socket, pid, request["requestId"]}

    call =
      case request["type"] do
        "subscribe" -> {:subscribe, pid, request["query"], request["params"]}
        "unsubscribe" -> {:unsubscribe, pid, request["subscriptionId"]}
        "presence" -> {:presence, pid, request["state"]}
        "mutateGroup" -> {:mutate_group, request["command"], principal}
      end

    case handle_call(call, from, state) do
      {:reply, result, next} ->
        WheelSync.Reply.send(from, if(result == :ok, do: {:ok, %{}}, else: result))
        {:noreply, next}

      {:noreply, next} ->
        {:noreply, next}
    end
  end

  def handle_cast({:leave, pid}, state), do: {:noreply, remove_connection(state, pid)}

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, %{catch_up: ref} = state) do
    Logger.error("wheel: catch-up failed #{inspect(reason)}")
    {:noreply, %{state | catch_up: nil}}
  end

  def handle_info({:DOWN, _ref, :process, pid, _reason}, state),
    do: {:noreply, remove_connection(state, pid)}

  def handle_info({:EXIT, pid, reason}, state) do
    if pid == state.writer or Enum.any?(state.queries, fn {_key, query} -> query.pid == pid end) do
      {:stop, {:worker_failed, reason}, state}
    else
      case Enum.find(state.connections, fn {_connection, entry} -> entry.relay == pid end) do
        {connection, _entry} ->
          send(connection, {:wheel_close, 1012, "sync_restarting"})
          {:noreply, remove_connection(state, connection)}

        nil ->
          {:noreply, state}
      end
    end
  end

  def handle_info({:source_invalidate, key}, state) do
    if Map.has_key?(state.queries, key), do: GenServer.cast(state.writer, {:source, key})
    {:noreply, state}
  end

  def handle_info(:write_finished, state), do: {:noreply, %{state | writes: state.writes - 1}}
  def handle_info(:wheel_sync_catch_up, state), do: {:noreply, catch_up(state)}

  def handle_info(:wheel_sync_periodic_catch_up, state) do
    Process.send_after(self(), :wheel_sync_periodic_catch_up, @catch_up_interval_ms)
    {:noreply, if(map_size(state.subscriptions) == 0, do: state, else: catch_up(state))}
  end

  def handle_info({ref, changes}, %{catch_up: ref} = state) do
    Process.demonitor(ref, [:flush])
    state = %{state | catch_up: nil}

    state =
      case changes do
        [] ->
          state

        _ ->
          seq = List.last(changes).seq
          touched = changes |> Enum.flat_map(& &1.touched) |> MapSet.new()

          sources =
            for %{client_id: "server:source", name: "source:" <> query} <- changes,
                into: MapSet.new(),
                do: query

          affected =
            for {{query, _, _} = key, entry} <- state.queries,
                not MapSet.disjoint?(entry.depends_on, touched) or MapSet.member?(sources, query),
                do: key

          for {_pid, connection} <- state.connections,
              do: send(connection.relay, {:advance, seq, affected})

          queries =
            Enum.reduce(affected, state.queries, fn key, queries ->
              entry = Map.fetch!(queries, key)
              GenServer.cast(entry.pid, {:invalidate, seq})
              Map.put(queries, key, %{entry | seq: seq})
            end)

          %{state | seq: seq, queries: queries}
      end

    again = state.catch_up_again or length(changes) == 256
    state = %{state | catch_up_again: false}
    {:noreply, if(again, do: catch_up(state), else: state)}
  end

  @impl true
  def terminate(_reason, state) do
    for {pid, connection} <- state.connections do
      send(pid, {:wheel_close, 1012, "sync_restarting"})
      Process.exit(connection.relay, :shutdown)
    end

    for {_key, query} <- state.queries, do: Process.exit(query.pid, :shutdown)
    Process.exit(state.writer, :shutdown)
    :ok
  end

  defp catch_up(%{catch_up: nil} = state) do
    postgres = state.names.postgres
    workspace = state.workspace_id
    seq = state.seq

    task =
      Task.Supervisor.async_nolink(state.names.tasks, fn ->
        WheelSync.Storage.changes_after(postgres, workspace, seq)
      end)

    %{state | catch_up: task.ref}
  end

  defp catch_up(state), do: %{state | catch_up_again: true}

  defp subscription_capacity(state, pid, key) do
    count = Enum.count(state.subscriptions, fn {_id, sub} -> sub.pid == pid end)

    if count >= @max_subscriptions or
         (map_size(state.queries) >= @max_queries and not Map.has_key?(state.queries, key)),
       do: {:error, "subscription_limit", "Too many live queries."},
       else: :ok
  end

  defp remove_subscription(state, pid, id) do
    case Map.get(state.subscriptions, id) do
      %{pid: ^pid, key: key} ->
        if connection = state.connections[pid], do: send(connection.relay, {:untrack, id})
        entry = Map.fetch!(state.queries, key)
        subscribers = MapSet.delete(entry.subscribers, id)

        queries =
          if MapSet.size(subscribers) == 0 do
            Process.exit(entry.pid, :shutdown)
            Map.delete(state.queries, key)
          else
            GenServer.cast(entry.pid, {:unsubscribe, id})
            Map.put(state.queries, key, %{entry | subscribers: subscribers})
          end

        %{state | queries: queries, subscriptions: Map.delete(state.subscriptions, id)}

      _ ->
        state
    end
  end

  defp remove_connection(state, pid) do
    case Map.get(state.connections, pid) do
      nil ->
        state

      connection ->
        if connection.presence != nil,
          do:
            broadcast_presence(
              state,
              Map.delete(state.connections, pid),
              connection,
              connection.presence,
              nil,
              nil
            )

        state =
          Enum.reduce(state.subscriptions, state, fn {id, _sub}, state ->
            remove_subscription(state, pid, id)
          end)

        Process.exit(connection.relay, :shutdown)

        %{
          state
          | connections: Map.delete(state.connections, pid),
            owners: Map.reject(state.owners, fn {_key, owner} -> owner == pid end)
        }
    end
  end

  defp fetch_connection(state, pid) do
    case Map.fetch(state.connections, pid) do
      {:ok, connection} -> {:ok, connection}
      :error -> {:error, "unknown_connection", "The sync connection is not registered."}
    end
  end

  defp fetch_named(entries, name, code) do
    case Map.fetch(entries, name) do
      {:ok, entry} -> {:ok, entry}
      :error -> {:error, code, "No entry named #{inspect(name)} is registered."}
    end
  end

  defp validate(root, value, code) do
    case WheelSync.Contract.validate(root, value) do
      :ok -> :ok
      {:error, _} -> {:error, code, "The value does not match its JSON Schema contract."}
    end
  end

  defp validate_presence(_spec, nil), do: :ok

  defp validate_presence(nil, value) when is_map(value) and not is_struct(value), do: :ok

  defp validate_presence(spec, value) when is_map(value) and not is_struct(value) do
    validate(spec["validator"], value, "invalid_presence")
  end

  defp validate_presence(_spec, _value),
    do: {:error, "invalid_presence", "Presence must be an object or null."}

  defp presence_event(client_id, actor, state) do
    %{"type" => "presence", "clientId" => client_id, "actor" => actor, "state" => state}
  end

  defp presence_visible?(%{presence_filter: nil}, _sender, _recipient, _presence), do: true

  defp presence_visible?(state, sender, recipient, presence) do
    state.presence_filter.(sender, recipient, presence)
  rescue
    error ->
      Logger.error(
        "wheel: presence visibility check failed sender=#{inspect(sender)} " <>
          "recipient=#{inspect(recipient)} error=#{Exception.message(error)}"
      )

      false
  end

  defp broadcast_presence(state, connections, sender, previous, next, except_pid) do
    for {pid, recipient} <- connections, pid != except_pid do
      saw_previous =
        previous != nil and
          presence_visible?(state, sender.principal, recipient.principal, previous)

      sees_next =
        next != nil and presence_visible?(state, sender.principal, recipient.principal, next)

      cond do
        sees_next ->
          send(
            pid,
            {:wheel_event, presence_event(sender.client_id, sender.principal.actor, next)}
          )

        saw_previous ->
          send(pid, {:wheel_event, presence_event(sender.client_id, sender.principal.actor, nil)})

        true ->
          :ok
      end
    end
  end

  defp issue_id(prefix) do
    prefix <> "_" <> Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)
  end
end
