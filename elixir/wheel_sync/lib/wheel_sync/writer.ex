defmodule WheelSync.Writer do
  @moduledoc false
  use GenServer
  @mutation_id ~r/^m_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  @id ~r/^[A-Za-z][A-Za-z0-9_-]*_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  # Postgrex owns checkout and its bounded wait policy. The runtime task supervisor
  # caps active plus waiting writes across every workspace, including source writes.
  def start_link(state), do: GenServer.start_link(__MODULE__, state)

  @impl true
  def init(state) do
    Process.flag(:trap_exit, true)

    {:ok,
     Map.merge(state, %{
       names: %{state.names | postgres: state.names.writer_postgres},
       tasks: %{},
       sources: MapSet.new(),
       source_timer: nil
     })}
  end

  @impl true
  def handle_cast({:request, request, from}, state) do
    case start_write(state, request, from) do
      {:ok, state} ->
        {:noreply, state}

      :full ->
        :telemetry.execute([:wheel_sync, :write, :rejected], %{count: 1}, %{
          workspace_id: state.workspace_id
        })

        reply(state, from, unavailable("The write queue is full."))
        {:noreply, state}
    end
  end

  def handle_cast({:source, {key, _params, _principal}}, state) do
    {:noreply, drain_sources(%{state | sources: MapSet.put(state.sources, key)})}
  end

  @impl true
  def handle_info({:write_result, pid, result}, state) do
    case Map.pop(state.tasks, pid) do
      {nil, _} ->
        {:noreply, state}

      {entry, tasks} ->
        Process.demonitor(entry.monitor, [:flush])
        Process.cancel_timer(entry.timer)
        state = %{state | tasks: tasks}
        state = finish(state, entry.from, result)
        {:noreply, drain_sources(state)}
    end
  end

  def handle_info({:DOWN, _ref, :process, pid, _reason}, state) do
    case Map.pop(state.tasks, pid) do
      {nil, _} ->
        {:noreply, state}

      {entry, tasks} ->
        Process.cancel_timer(entry.timer)

        state =
          finish(%{state | tasks: tasks}, entry.from, unavailable("The write worker stopped."))

        {:noreply, drain_sources(state)}
    end
  end

  def handle_info({:write_timeout, pid}, state) do
    # A timeout is an unknown commit outcome. Mutation retries resolve it by ID;
    # external callbacks must not be blindly retried.
    if Map.has_key?(state.tasks, pid), do: Process.exit(pid, :kill)
    {:noreply, state}
  end

  def handle_info(:retry_sources, state),
    do: {:noreply, drain_sources(%{state | source_timer: nil})}

  def handle_info({:EXIT, owner, reason}, %{owner: owner} = state),
    do: {:stop, reason, state}

  def handle_info({:EXIT, _pid, _reason}, state), do: {:noreply, state}

  @impl true
  def terminate(_reason, state) do
    for {pid, entry} <- state.tasks do
      Process.exit(pid, :kill)
      reply(state, entry.from, unavailable("The workspace stopped."))
    end
  end

  defp start_write(state, request, from) do
    writer = self()

    context =
      Map.take(state, [:names, :workspace_id, :registry, :detailed_errors, :write_timeout])

    case Task.Supervisor.start_child(state.names.write_tasks, fn ->
           # The link also kills the task if its writer is killed without terminate/2.
           Process.link(writer)
           result = execute(request, context)
           send(writer, {:write_result, self(), result})
         end) do
      {:ok, pid} ->
        entry = %{
          monitor: Process.monitor(pid),
          timer: Process.send_after(self(), {:write_timeout, pid}, state.write_timeout),
          from: from
        }

        {:ok, %{state | tasks: Map.put(state.tasks, pid, entry)}}

      {:error, :max_children} ->
        :full
    end
  end

  defp finish(state, {:source, _key}, :ok) do
    send(state.owner, :wheel_sync_catch_up)
    state
  end

  defp finish(state, {:source, key}, _error),
    do: schedule_sources(%{state | sources: MapSet.put(state.sources, key)})

  defp finish(state, from, result) do
    reply(state, from, result)
    send(state.owner, :wheel_sync_catch_up)
    state
  end

  defp reply(_state, {:source, _key}, _result), do: :ok

  defp reply(state, from, result) do
    WheelSync.Reply.send(from, result)
    send(state.owner, :write_finished)
  end

  defp drain_sources(%{source_timer: timer} = state) when timer != nil, do: state

  defp drain_sources(state) do
    busy = for {_pid, %{from: {:source, key}}} <- state.tasks, into: MapSet.new(), do: key

    Enum.reduce(MapSet.difference(state.sources, busy), state, fn key, state ->
      case start_write(state, {:source, key}, {:source, key}) do
        {:ok, state} -> %{state | sources: MapSet.delete(state.sources, key)}
        :full -> schedule_sources(state)
      end
    end)
  end

  defp schedule_sources(%{source_timer: nil} = state),
    do: %{state | source_timer: Process.send_after(self(), :retry_sources, 100)}

  defp schedule_sources(state), do: state

  defp unavailable(message), do: {:error, "backend_unavailable", message, true}

  defp execute({:source, key}, state), do: record_source_invalidation(state, key)

  defp execute({:mutate_group, request, principal}, state) do
    case validate_mutation_group(state.registry, request) do
      :ok ->
        case apply_mutation_group(state, request, principal) do
          {:committed, seq} ->
            {:ok, %{"ok" => true, "seq" => seq}}

          {:duplicate, seq} ->
            {:ok, %{"ok" => true, "seq" => seq}}

          {:rejection, code, message} ->
            value = %{
              "ok" => false,
              "rejection" => %{"kind" => "rejection", "code" => code, "message" => message}
            }

            {:ok, value}

          {:terminal, code, message} ->
            value = %{
              "ok" => false,
              "error" => %{"kind" => "error", "code" => code, "message" => message}
            }

            {:ok, value}

          {:transient, message} ->
            {:error, "backend_unavailable", message, true}
        end

      {:error, code, message} ->
        value = %{
          "ok" => false,
          "error" => %{"kind" => "error", "code" => code, "message" => message}
        }

        {:ok, value}
    end
  end

  defp execute({:external_write, options, callback}, state) do
    case apply_external_write(state, options, callback) do
      {:committed, seq, value} ->
        {:ok, %{seq: seq, value: value}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp transaction(state, callback) do
    started = System.monotonic_time()

    try do
      Postgrex.transaction(
        state.names.postgres,
        fn connection ->
          :telemetry.execute(
            [:wheel_sync, :write, :checkout],
            %{duration: System.monotonic_time() - started},
            %{workspace_id: state.workspace_id}
          )

          WheelSync.Storage.query!(
            connection,
            "set transaction isolation level read committed",
            []
          )

          callback.(connection)
        end,
        timeout: state.write_timeout
      )
    after
      :telemetry.execute(
        [:wheel_sync, :write, :stop],
        %{duration: System.monotonic_time() - started},
        %{workspace_id: state.workspace_id}
      )
    end
  end

  defp apply_mutation_group(state, request, principal) do
    result =
      transaction(state, fn connection ->
        WheelSync.Storage.lock!(
          connection,
          state.workspace_id,
          "wheel:mutation",
          request["mutationId"]
        )

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
      transaction(state, fn connection ->
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

  defp record_source_invalidation(state, query) do
    case transaction(state, fn connection ->
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

  defp classify_postgres_error(error) do
    if transient_postgres?(error),
      do: {:transient, Exception.message(error)},
      else: {:terminal, "handler_error", Exception.message(error)}
  end

  # Postgrex evicts the stale plan, but an aborted transaction must retry from
  # its receipt check. Other unsupported SQL remains a terminal handler error.
  defp transient_postgres?(%Postgrex.Error{
         postgres: %{code: :feature_not_supported, routine: "RevalidateCachedQuery"}
       }),
       do: true

  defp transient_postgres?(%Postgrex.Error{postgres: %{code: code}}),
    do: code in [:serialization_failure, :deadlock_detected]

  defp transient_postgres?(_error), do: false

  defp issue_id(prefix) do
    prefix <> "_" <> Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)
  end
end
