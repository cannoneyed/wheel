defmodule WheelSync.Writer do
  @moduledoc false
  use GenServer
  require Logger
  @mutation_id ~r/^m_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  @id ~r/^[A-Za-z][A-Za-z0-9_-]*_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  def start_link(state), do: GenServer.start_link(__MODULE__, state)
  @impl true
  def init(state),
    do: {:ok, %{state | names: %{state.names | postgres: state.names.writer_postgres}}}

  @impl true
  def handle_cast({:request, request, from}, state) do
    {:reply, result, state} = handle_call(request, from, state)
    WheelSync.Reply.send(from, result)
    send(state.owner, :wheel_sync_catch_up)
    send(state.owner, :write_finished)
    {:noreply, state}
  end

  def handle_cast({:source, key}, state) do
    case record_source_invalidation(state, key) do
      :ok -> send(state.owner, :wheel_sync_catch_up)
      {:error, reason} -> Logger.error("wheel: source invalidation failed #{inspect(reason)}")
    end

    {:noreply, state}
  end

  @impl true
  def handle_call({:mutate_group, request, principal}, _from, state) do
    case validate_mutation_group(state.registry, request) do
      :ok ->
        case apply_mutation_group(state, request, principal) do
          {:committed, seq} ->
            state = state
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
      {:committed, seq, value} ->
        {:reply, {:ok, %{seq: seq, value: value}}, state}

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

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

              {:committed, seq, value}

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

    {:committed, seq}
  end

  defp validate_touched!(state, touched, options \\ []) do
    declared =
      state.registry.contract.queries
      |> Map.values()
      |> Enum.flat_map(& &1["dependsOn"])
      |> MapSet.new()

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

  defp record_source_invalidation(state, {query, _params, _principal}) do
    case Postgrex.transaction(state.names.postgres, fn connection ->
           seq = WheelSync.Storage.next_seq!(connection, state.workspace_id)

           WheelSync.Storage.append_log!(connection, state.workspace_id, seq, %{
             mutation_id: issue_id("source"),
             name: "source:" <> query,
             touched: MapSet.new(),
             actor: "system:query-source",
             client_id: "server:source"
           })

           seq
         end) do
      {:ok, _seq} -> :ok
      {:error, reason} -> {:error, reason}
    end
  rescue
    error -> {:error, error}
  catch
    kind, reason -> {:error, {kind, reason}}
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
