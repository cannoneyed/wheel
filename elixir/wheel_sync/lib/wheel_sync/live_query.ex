defmodule WheelSync.LiveQuery do
  @moduledoc false
  use GenServer
  require Logger

  @max_rows 20_000
  @max_result_bytes 16 * 1024 * 1024

  def start_link(state), do: GenServer.start_link(__MODULE__, state)

  @impl true
  def init(state) do
    Process.flag(:trap_exit, true)

    {:ok,
     Map.merge(state, %{
       rows: nil,
       status: live_status(),
       subscribers: %{},
       cleanup: nil,
       retained_bytes: 0,
       retry: nil
     })}
  end

  @impl true
  def handle_cast({:subscribe, id, relay, from}, state) do
    with {:ok, state} <- attach(state) do
      state = if state.rows == nil, do: refresh(state, state.seq), else: state

      snapshot = %{
        "subscriptionId" => id,
        "query" => state.query,
        "seq" => state.seq,
        "rows" => Enum.map(state.rows, &elem(&1, 1)),
        "status" => state.status
      }

      send(relay, {:snapshot, id, state.key, state.seq, from, {:ok, snapshot}})
      {:noreply, %{state | subscribers: Map.put(state.subscribers, id, relay)}}
    else
      {:error, code, message} ->
        send(relay, {:snapshot, id, state.key, state.seq, from, {:error, code, message}})
        send(state.owner, {:query_subscribe_failed, id})
        {:noreply, state}
    end
  end

  def handle_cast({:unsubscribe, id}, state) do
    {:noreply, %{state | subscribers: Map.delete(state.subscribers, id)}}
  end

  def handle_cast({:invalidate, seq}, state) do
    # Notifications collapse to one refresh at the newest known sequence.
    seq = drain_invalidations(seq)
    state = if seq > state.seq, do: refresh(state, seq), else: state

    if state.status["kind"] == "live" do
      for {_id, relay} <- state.subscribers, do: send(relay, {:applied, state.key, state.seq})
    end

    {:noreply, state}
  end

  @impl true
  def handle_info({:EXIT, _pid, reason}, state), do: {:stop, reason, state}

  def handle_info(:retry, state) do
    state = refresh(%{state | retry: nil}, state.seq)

    if state.status["kind"] == "live" do
      for {_id, relay} <- state.subscribers, do: send(relay, {:applied, state.key, state.seq})
    end

    {:noreply, state}
  end

  @impl true
  def terminate(_reason, state) do
    :atomics.sub(state.cache_budget, 1, state.retained_bytes)
    if is_function(state.cleanup, 0), do: run_cleanup(state.cleanup)
    :ok
  end

  defp drain_invalidations(seq) do
    receive do
      {:"$gen_cast", {:invalidate, next}} -> drain_invalidations(max(seq, next))
    after
      0 -> seq
    end
  end

  defp attach(%{cleanup: nil} = state) do
    module = state.module

    if function_exported?(module, :subscribe, 3) do
      owner = state.owner
      key = state.key

      cleanup =
        module.subscribe(
          state.params,
          fn -> send(owner, {:source_invalidate, key}) end,
          state.principal
        )

      unless is_function(cleanup, 0),
        do: raise("query subscribe/3 must return a zero-argument cleanup function")

      {:ok, %{state | cleanup: cleanup}}
    else
      {:ok, state}
    end
  rescue
    error -> {:error, "query_source_error", Exception.message(error)}
  catch
    kind, reason -> {:error, "query_source_error", Exception.format_banner(kind, reason)}
  end

  defp attach(state), do: {:ok, state}

  defp refresh(state, seq) do
    started = System.monotonic_time()
    # seq is a lower bound, not an exact snapshot version. The SELECT starts
    # after this log entry committed; newer commits schedule another refresh.
    {result, state} =
      state |> run_query(state.query, state.params, state.principal) |> reserve_result(state)

    {result, state} =
      case result do
        {:retry, message} ->
          timer = state.retry || Process.send_after(self(), :retry, 500 + :rand.uniform(500))
          {{:error, "backend_unavailable", message}, %{state | retry: timer}}

        result ->
          if state.retry, do: Process.cancel_timer(state.retry)
          {result, %{state | retry: nil}}
      end

    state = %{state | seq: seq}
    previous = state.rows || []

    for {id, relay} <- state.subscribers do
      subscription = %{
        id: id,
        pid: relay,
        query: state.query,
        params: state.params,
        principal: state.principal,
        rows: previous,
        status: state.status
      }

      apply_query_result(state, subscription, result)
    end

    state =
      case result do
        {:ok, rows} ->
          %{state | rows: rows, status: live_status()}

        {:error, code, message} ->
          if state.rows == nil,
            do: log_query_failure(state, state.query, state.params, nil, "initial", code, message)

          kind =
            if state.rows == nil or state.status["kind"] == "error", do: "error", else: "stale"

          %{state | rows: previous, status: failed_status(kind)}
      end

    :telemetry.execute(
      [:wheel_sync, :query, :stop],
      %{
        duration: System.monotonic_time() - started,
        rows: length(state.rows),
        memory: elem(Process.info(self(), :memory), 1)
      },
      %{workspace_id: state.workspace_id, query: state.query, status: state.status["kind"]}
    )

    state
  end

  defp reserve_result({:ok, rows}, state) do
    bytes =
      :erts_debug.flat_size(rows) * :erlang.system_info(:wordsize) + :erlang.external_size(rows)

    delta = bytes - state.retained_bytes

    if reserve(state.cache_budget, state.cache_limit, delta) do
      {{:ok, rows}, %{state | retained_bytes: bytes}}
    else
      {{:error, "query_cache_limit",
        "The workspace live-query memory budget is full. Narrow the query scope."}, state}
    end
  end

  defp reserve_result(error, state), do: {error, state}

  defp reserve(budget, limit, delta) do
    current = :atomics.get(budget, 1)

    cond do
      current + delta > limit -> false
      :atomics.compare_exchange(budget, 1, current, current + delta) == :ok -> true
      true -> reserve(budget, limit, delta)
    end
  end

  defp run_query(state, query_name, params, principal) do
    module = state.module
    collection = state.collection

    try do
      case query_rows(state, module, params, principal) do
        {:ok, rows} ->
          if length(rows) > @max_rows or :erlang.external_size(rows) > @max_result_bytes do
            raise WheelSync.Error,
              code: "query_result_limit",
              message: "Live query exceeds its row or byte limit. Narrow the query scope."
          end

          {:ok, key_rows!(query_name, collection, rows)}

        {:error, code, message} ->
          {:error, code, message}
      end
    rescue
      error in DBConnection.ConnectionError -> {:retry, Exception.message(error)}
      error in WheelSync.Error -> {:error, error.code, error.message}
      error -> {:error, "query_error", Exception.message(error)}
    end
  end

  defp query_rows(state, module, params, principal) do
    if function_exported?(module, :sql, 2) do
      {sql, sql_params} = module.sql(params, principal)

      query = state.query
      workspace_id = state.workspace_id

      log = fn entry ->
        :telemetry.execute(
          [:wheel_sync, :query, :database],
          %{
            query_time: entry.connection_time || 0,
            queue_time: entry.pool_time || 0,
            decode_time: entry.decode_time || 0
          },
          %{query: query, workspace_id: workspace_id}
        )
      end

      rows =
        state.names.postgres
        |> Postgrex.query!(sql, sql_params, log: log)
        |> WheelSync.Storage.rows()

      {:ok, rows}
    else
      case module.run(params, principal) do
        rows when is_list(rows) ->
          {:ok, rows}

        {:ok, rows} when is_list(rows) ->
          {:ok, rows}

        {:error, code, message} when is_binary(code) and is_binary(message) ->
          {:error, code, message}

        other ->
          raise WheelSync.Error,
            code: "query_error",
            message: "Query callback returned #{inspect(other)} instead of rows."
      end
    end
  end

  defp key_rows!(query_name, collection, rows) do
    Enum.reduce(rows, {[], MapSet.new()}, fn row, {keyed, keys} ->
      case WheelSync.Contract.validate(collection["validator"], row) do
        :ok ->
          :ok

        {:error, _} ->
          raise WheelSync.Error,
            code: "invalid_row",
            message:
              "Query #{inspect(query_name)} returned a row outside its collection contract."
      end

      key =
        collection["key"]["fields"]
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
        |> Enum.join(collection["key"]["separator"])

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

  defp run_cleanup(cleanup) do
    cleanup.()
  rescue
    error -> Logger.error("wheel: query source cleanup failed error=#{inspect(error)}")
  catch
    kind, reason ->
      Logger.error(
        "wheel: query source cleanup failed error=#{Exception.format_banner(kind, reason)}"
      )
  end
end
