defmodule WheelSync.Workspace do
  @moduledoc false
  use GenServer
  require Logger

  @mutation_id ~r/^m_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  @id ~r/^[A-Za-z][A-Za-z0-9_-]*_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

  @impl true
  def init(options) do
    names = Keyword.fetch!(options, :names)
    workspace_id = Keyword.fetch!(options, :workspace_id)

    {:ok,
     %{
       names: names,
       registry: Keyword.fetch!(options, :registry),
       workspace_id: workspace_id,
       seq: WheelSync.Storage.current_seq(names.postgres, workspace_id),
       connections: %{},
       owners: %{},
       subscriptions: %{}
     }}
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
      for {_pid, peer} <- state.connections, peer.presence != nil do
        presence_event(peer.client_id, peer.principal.actor, peer.presence)
      end

    connection = Map.put(connection, :presence, nil)

    state = %{
      state
      | connections: Map.put(state.connections, connection.pid, connection),
        owners: Map.put(state.owners, owner_key, connection.pid)
    }

    {:reply, {:ok, existing_presence}, state}
  end

  def handle_call({:subscribe, pid, query_name, params}, _from, state) do
    with {:ok, connection} <- fetch_connection(state, pid),
         {:ok, query_spec} <-
           fetch_named(state.registry.contract.queries, query_name, "unknown_query"),
         :ok <- validate(query_spec["validator"], params, "invalid_params") do
      subscription_id = issue_id("sub")

      {rows, status} =
        case run_query(state, query_name, params, connection.principal) do
          {:ok, rows} ->
            {rows, live_status()}

          {:error, code, message} ->
            log_query_failure(
              state,
              query_name,
              params,
              subscription_id,
              "initial",
              code,
              message
            )

            emit_query_telemetry(
              :failure,
              state,
              query_name,
              params,
              subscription_id,
              "error"
            )

            {[], failed_status("error")}
        end

      subscription = %{
        id: subscription_id,
        pid: pid,
        query: query_name,
        params: params,
        principal: connection.principal,
        rows: rows,
        status: status,
        rerun_on: MapSet.new(query_spec["rerunOn"])
      }

      snapshot = %{
        "subscriptionId" => subscription_id,
        "query" => query_name,
        "seq" => state.seq,
        "rows" => Enum.map(rows, &elem(&1, 1)),
        "status" => status
      }

      {:reply, {:ok, snapshot},
       %{state | subscriptions: Map.put(state.subscriptions, subscription_id, subscription)}}
    else
      {:error, code, message} -> {:reply, {:error, code, message}, state}
    end
  end

  def handle_call({:unsubscribe, pid, subscription_id}, _from, state) do
    subscriptions =
      case Map.get(state.subscriptions, subscription_id) do
        %{pid: ^pid} -> Map.delete(state.subscriptions, subscription_id)
        _ -> state.subscriptions
      end

    {:reply, :ok, %{state | subscriptions: subscriptions}}
  end

  def handle_call({:presence, pid, presence}, _from, state) do
    with {:ok, connection} <- fetch_connection(state, pid),
         :ok <- validate_presence(state.registry.contract.presence, presence) do
      connections = Map.put(state.connections, pid, %{connection | presence: presence})
      event = presence_event(connection.client_id, connection.principal.actor, presence)
      broadcast(connections, event, pid)
      {:reply, :ok, %{state | connections: connections}}
    else
      {:error, code, message} -> {:reply, {:error, code, message}, state}
    end
  end

  def handle_call({:mutate_group, request, principal}, _from, state) do
    case validate_mutation_group(state.registry, request) do
      :ok ->
        case apply_mutation_group(state, request, principal) do
          {:committed, seq, touched} ->
            state = %{state | seq: seq}
            state = rerun_subscriptions(state, touched)
            {:reply, {:ok, %{"ok" => true, "seq" => seq}}, state}

          {:duplicate, seq} ->
            {:reply, {:ok, %{"ok" => true, "seq" => seq}}, state}

          {:rejection, code, message} ->
            value = %{
              "ok" => false,
              "rejection" => %{"kind" => "rejection", "code" => code, "message" => message}
            }

            {:reply, {:ok, value}, state}

          {:terminal, code, message} ->
            value = %{
              "ok" => false,
              "error" => %{"kind" => "error", "code" => code, "message" => message}
            }

            {:reply, {:ok, value}, state}

          {:transient, message} ->
            {:reply, {:error, "backend_unavailable", message, true}, state}
        end

      {:error, code, message} ->
        value = %{
          "ok" => false,
          "error" => %{"kind" => "error", "code" => code, "message" => message}
        }

        {:reply, {:ok, value}, state}
    end
  end

  def handle_call({:external_write, options, callback}, _from, state) do
    case apply_external_write(state, options, callback) do
      {:committed, seq, touched, value} ->
        state = state |> Map.put(:seq, seq) |> rerun_subscriptions(touched)
        {:reply, {:ok, %{seq: seq, value: value}}, state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  @impl true
  def handle_cast({:leave, pid}, state), do: {:noreply, remove_connection(state, pid)}

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, state),
    do: {:noreply, remove_connection(state, pid)}

  defp apply_mutation_group(state, request, principal) do
    result =
      Postgrex.transaction(state.names.postgres, fn connection ->
        case WheelSync.Storage.find_committed(
               connection,
               state.workspace_id,
               request["mutationId"]
             ) do
          {:ok, seq} ->
            {:duplicate, seq}

          :missing ->
            run_handlers(state, connection, request, principal)
        end
      end)

    case result do
      {:ok, outcome} -> outcome
      {:error, outcome} -> outcome
    end
  rescue
    error in DBConnection.ConnectionError -> {:transient, Exception.message(error)}
    error in Postgrex.Error -> classify_postgres_error(error)
  end

  defp apply_external_write(state, options, callback) do
    result =
      Postgrex.transaction(state.names.postgres, fn connection ->
        tx = WheelSync.Tx.open(connection, state.workspace_id)

        try do
          case callback.(tx) do
            {:ok, value} ->
              touched = validate_touched!(state, WheelSync.Tx.touched(tx))
              seq = WheelSync.Storage.next_seq!(connection, state.workspace_id)

              WheelSync.Storage.append_log!(connection, state.workspace_id, seq, %{
                mutation_id: issue_id("external"),
                name: Keyword.fetch!(options, :source),
                touched: touched,
                actor: Keyword.fetch!(options, :actor),
                client_id: "server:external"
              })

              {:committed, seq, touched, value}

            {:error, reason} ->
              Postgrex.rollback(connection, reason)

            other ->
              Postgrex.rollback(connection, {:invalid_external_write_return, other})
          end
        after
          WheelSync.Tx.close(tx)
        end
      end)

    case result do
      {:ok, outcome} -> outcome
      {:error, reason} -> {:error, reason}
    end
  rescue
    error -> {:error, error}
  catch
    kind, reason -> {:error, {kind, reason}}
  end

  defp run_handlers(state, connection, request, principal) do
    tx = WheelSync.Tx.open(connection, state.workspace_id)

    try do
      Enum.each(request["calls"], fn call ->
        mutation = Map.fetch!(state.registry.mutations, call["name"])

        context_request =
          call
          |> Map.put("clientId", request["clientId"])
          |> Map.put("mutationId", request["mutationId"])

        ctx = WheelSync.Ctx.open(principal, context_request)

        try do
          case mutation.run(tx, call["args"], ctx) do
            :ok ->
              :ok

            {:ok, _value} ->
              :ok

            {:reject, code, message} ->
              Postgrex.rollback(connection, {:rejection, code, message})

            other ->
              raise "mutation handler returned #{inspect(other)}"
          end

          WheelSync.Ctx.assert_consumed!(ctx)
        after
          WheelSync.Ctx.close(ctx)
        end
      end)

      commit_handlers(state, tx, connection, request, principal)
    rescue
      error in WheelSync.Rejection ->
        Postgrex.rollback(connection, {:rejection, error.code, error.message})

      error in WheelSync.Error ->
        Postgrex.rollback(connection, {:terminal, error.code, error.message})

      error in DBConnection.ConnectionError ->
        reraise error, __STACKTRACE__

      error in Postgrex.Error ->
        if transient_postgres?(error) do
          reraise error, __STACKTRACE__
        else
          detail =
            if Map.get(state, :detailed_errors, false),
              do: Exception.message(error),
              else: "Mutation handler failed."

          Postgrex.rollback(connection, {:terminal, "handler_error", detail})
        end

      error ->
        detail =
          if Map.get(state, :detailed_errors, false),
            do: Exception.message(error),
            else: "Mutation handler failed."

        Postgrex.rollback(connection, {:terminal, "handler_error", detail})
    after
      WheelSync.Tx.close(tx)
    end
  end

  defp commit_handlers(state, tx, connection, request, principal) do
    touched = validate_touched!(state, WheelSync.Tx.touched(tx), allow_empty: true)

    seq = WheelSync.Storage.next_seq!(connection, state.workspace_id)

    WheelSync.Storage.append_log!(connection, state.workspace_id, seq, %{
      mutation_id: request["mutationId"],
      name: request["calls"] |> Enum.map(& &1["name"]) |> Enum.join(","),
      touched: touched,
      actor: principal.actor,
      client_id: request["clientId"]
    })

    {:committed, seq, touched}
  end

  defp validate_touched!(state, touched, options \\ []) do
    declared = Map.keys(state.registry.contract.tables) |> MapSet.new()

    case Enum.find(touched, &(not MapSet.member?(declared, &1))) do
      nil ->
        :ok

      table ->
        raise WheelSync.Error,
          code: "invalid_touched_table",
          message: "Mutation touched undeclared table #{inspect(table)}."
    end

    if MapSet.size(touched) == 0 and not Keyword.get(options, :allow_empty, false) do
      raise WheelSync.Error,
        code: "empty_touched_tables",
        message: "An external write must touch at least one declared table."
    end

    touched
  end

  defp validate_mutation_group(registry, request) when is_map(request) do
    with :ok <- validate_mutation_id(request["mutationId"]),
         :ok <- validate_calls_size(request["calls"]),
         :ok <- validate_calls(registry, request["calls"]) do
      :ok
    end
  end

  defp validate_mutation_group(_registry, _request),
    do: {:error, "invalid_mutation_group", "Mutation group request is invalid."}

  defp validate_calls_size(calls) when is_list(calls) and length(calls) in 1..128, do: :ok

  defp validate_calls_size(calls) when is_list(calls) and length(calls) > 128,
    do: {:error, "group_too_large", "A mutation group may contain at most 128 members."}

  defp validate_calls_size(_calls),
    do: {:error, "empty_mutation_group", "A mutation group must contain at least one member."}

  defp validate_calls(registry, calls) do
    Enum.reduce_while(calls, :ok, fn call, :ok ->
      result =
        if is_map(call) and is_binary(call["name"]) do
          with {:ok, mutation_spec} <-
                 fetch_named(registry.contract.mutations, call["name"], "unknown_mutation"),
               :ok <- validate_ids(call["ids"]),
               :ok <- validate(mutation_spec["validator"], call["args"], "invalid_args") do
            :ok
          end
        else
          {:error, "invalid_mutation", "Mutation group member is invalid."}
        end

      case result do
        :ok -> {:cont, :ok}
        error -> {:halt, error}
      end
    end)
  end

  defp validate_mutation_id(value) when is_binary(value) do
    if Regex.match?(@mutation_id, value),
      do: :ok,
      else: {:error, "invalid_mutation_id", "Mutation id is not a valid m_<uuidv7>."}
  end

  defp validate_mutation_id(_value),
    do: {:error, "invalid_mutation_id", "Mutation id is not a valid m_<uuidv7>."}

  defp validate_ids(values) when is_list(values) do
    if Enum.all?(values, &(is_binary(&1) && Regex.match?(@id, &1))),
      do: :ok,
      else: {:error, "invalid_id", "A pre-generated id is not a valid prefixed UUIDv7."}
  end

  defp validate_ids(_values),
    do: {:error, "invalid_id", "A pre-generated id is not a valid prefixed UUIDv7."}

  defp run_query(state, query_name, params, principal) do
    module = Map.fetch!(state.registry.queries, query_name)
    query_spec = Map.fetch!(state.registry.contract.queries, query_name)
    table = Map.fetch!(state.registry.contract.tables, query_spec["into"])

    try do
      {sql, sql_params} = module.sql(params, principal)

      rows =
        state.names.postgres
        |> Postgrex.query!(sql, sql_params)
        |> WheelSync.Storage.rows()

      {:ok, key_rows!(query_name, table, rows)}
    rescue
      error in WheelSync.Error -> {:error, error.code, error.message}
      error -> {:error, "query_error", Exception.message(error)}
    end
  end

  defp key_rows!(query_name, table, rows) do
    Enum.reduce(rows, {[], MapSet.new()}, fn row, {keyed, keys} ->
      case WheelSync.Contract.validate(table["validator"], row) do
        :ok ->
          :ok

        {:error, _} ->
          raise WheelSync.Error,
            code: "invalid_row",
            message: "Query #{inspect(query_name)} returned a row outside its table contract."
      end

      key =
        table["key"]["fields"]
        |> Enum.map(fn field ->
          case row[field] do
            value when is_binary(value) ->
              value

            _ ->
              raise WheelSync.Error,
                code: "invalid_row_key",
                message: "Query row key field #{inspect(field)} must be a string."
          end
        end)
        |> Enum.join(table["key"]["separator"])

      if MapSet.member?(keys, key) do
        raise WheelSync.Error,
          code: "duplicate_row_key",
          message: "Query #{inspect(query_name)} returned duplicate row key #{inspect(key)}."
      end

      {[{key, row} | keyed], MapSet.put(keys, key)}
    end)
    |> elem(0)
    |> Enum.reverse()
  end

  defp rerun_subscriptions(state, touched) do
    groups =
      state.subscriptions
      |> Enum.reject(fn {_id, subscription} ->
        MapSet.disjoint?(subscription.rerun_on, touched)
      end)
      |> Enum.group_by(fn {_id, subscription} ->
        {subscription.query, subscription.params, subscription.principal}
      end)

    subscriptions =
      Enum.reduce(groups, state.subscriptions, fn
        {{query, params, principal}, group}, subscriptions ->
          result = run_query(state, query, params, principal)

          Enum.reduce(group, subscriptions, fn {id, subscription}, subscriptions ->
            Map.put(subscriptions, id, apply_query_result(state, subscription, result))
          end)
      end)

    state = %{state | subscriptions: subscriptions}
    broadcast(state.connections, %{"type" => "checkpoint", "seq" => state.seq}, nil)
    state
  end

  defp apply_query_result(state, subscription, {:ok, next_rows}) do
    emit_delta(subscription, next_rows, state.seq)
    emit_query_recovery(state, subscription)
    %{subscription | rows: next_rows, status: live_status()}
  end

  defp apply_query_result(state, subscription, {:error, code, message}) do
    status_kind = if subscription.status["kind"] == "error", do: "error", else: "stale"
    status = failed_status(status_kind)

    log_query_failure(
      state,
      subscription.query,
      subscription.params,
      subscription.id,
      "rerun",
      code,
      message
    )

    emit_query_telemetry(
      :failure,
      state,
      subscription.query,
      subscription.params,
      subscription.id,
      status_kind
    )

    send(subscription.pid, {:wheel_event, query_status_event(subscription, state.seq, status)})
    %{subscription | status: status}
  end

  defp emit_delta(subscription, next_rows, seq) do
    previous = Map.new(subscription.rows)
    next = Map.new(next_rows)

    puts =
      for {key, row} <- next_rows, Map.get(previous, key) !== row do
        row
      end

    deletes = for {key, _row} <- subscription.rows, not Map.has_key?(next, key), do: key

    previous_order = Enum.map(subscription.rows, &elem(&1, 0))
    next_order = Enum.map(next_rows, &elem(&1, 0))

    if puts != [] or deletes != [] or previous_order != next_order do
      event = %{
        "type" => "delta",
        "delta" => %{
          "subscriptionId" => subscription.id,
          "query" => subscription.query,
          "seq" => seq,
          "puts" => puts,
          "deletes" => deletes,
          "order" => next_order
        }
      }

      send(subscription.pid, {:wheel_event, event})
    end
  end

  defp emit_query_recovery(state, subscription) do
    if subscription.status["kind"] != "live" do
      send(
        subscription.pid,
        {:wheel_event, query_status_event(subscription, state.seq, live_status())}
      )

      emit_query_telemetry(
        :recovery,
        state,
        subscription.query,
        subscription.params,
        subscription.id,
        "live"
      )
    end
  end

  defp query_status_event(subscription, seq, status) do
    %{
      "type" => "query_status",
      "status" => %{
        "subscriptionId" => subscription.id,
        "query" => subscription.query,
        "seq" => seq,
        "status" => status
      }
    }
  end

  defp live_status, do: %{"kind" => "live"}

  defp failed_status(kind) do
    %{
      "kind" => kind,
      "error" => %{"code" => "query_error", "message" => "The live query failed."}
    }
  end

  defp log_query_failure(state, query, params, subscription_id, phase, code, message) do
    Logger.error(
      "wheel: live query failed " <>
        "workspace=#{inspect(state.workspace_id)} query=#{inspect(query)} " <>
        "params=#{inspect(params)} subscription=#{inspect(subscription_id)} " <>
        "phase=#{phase} code=#{inspect(code)} error=#{inspect(message)}"
    )
  end

  defp emit_query_telemetry(kind, state, query, params, subscription_id, status) do
    :telemetry.execute(
      [:wheel_sync, :query, kind],
      %{count: 1},
      %{
        workspace_id: state.workspace_id,
        query: query,
        params: params,
        subscription_id: subscription_id,
        status: status
      }
    )
  end

  defp remove_connection(state, pid) do
    case Map.pop(state.connections, pid) do
      {nil, _connections} ->
        state

      {connection, connections} ->
        if connection.presence != nil do
          broadcast(
            connections,
            presence_event(connection.client_id, connection.principal.actor, nil),
            nil
          )
        end

        subscriptions =
          Map.reject(state.subscriptions, fn {_id, subscription} -> subscription.pid == pid end)

        owners = Map.reject(state.owners, fn {_owner, owner_pid} -> owner_pid == pid end)
        %{state | connections: connections, subscriptions: subscriptions, owners: owners}
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

  defp broadcast(connections, event, except_pid) do
    for {pid, _connection} <- connections, pid != except_pid do
      send(pid, {:wheel_event, event})
    end
  end

  defp classify_postgres_error(%Postgrex.Error{postgres: %{code: code}} = error)
       when code in [:serialization_failure, :deadlock_detected] do
    {:transient, Exception.message(error)}
  end

  defp classify_postgres_error(error), do: {:terminal, "handler_error", Exception.message(error)}

  defp transient_postgres?(%Postgrex.Error{postgres: %{code: code}}),
    do: code in [:serialization_failure, :deadlock_detected]

  defp transient_postgres?(_error), do: false

  defp issue_id(prefix) do
    prefix <> "_" <> Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)
  end
end
