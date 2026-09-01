defmodule WheelSync.Socket do
  @moduledoc false
  @behaviour WebSock

  @protocol 3

  @impl true
  def init(handshake) do
    config = WheelSync.Runtime.config(handshake.runtime)
    application_version = Map.fetch!(config, :application_version)
    minimum_client_version = Map.get(config, :minimum_client_version, application_version)
    row_schema_fingerprint = Map.fetch!(config, :row_schema_fingerprint)

    mismatch =
      cond do
        handshake.client_protocol != @protocol ->
          "protocol_mismatch"

        handshake.client_application_version > application_version ->
          "server_updating"

        handshake.client_application_version < minimum_client_version ->
          "client_outdated"

        handshake.client_row_schema_fingerprint != row_schema_fingerprint ->
          "row_schema_mismatch"

        true ->
          nil
      end

    if mismatch do
      frame = %{
        "protocol" => @protocol,
        "type" => "version_mismatch",
        "reason" => mismatch,
        "clientProtocol" => handshake.client_protocol,
        "serverProtocol" => @protocol,
        "clientApplicationVersion" => handshake.client_application_version,
        "serverApplicationVersion" => application_version,
        "minimumClientVersion" => minimum_client_version,
        "clientRowSchemaFingerprint" => handshake.client_row_schema_fingerprint,
        "serverRowSchemaFingerprint" => row_schema_fingerprint
      }

      {:stop, :normal, {4410, mismatch}, {:text, encode(frame)}, handshake}
    else
      connection_id = issue_connection_id()

      {:ok, workspace} =
        WheelSync.Runtime.workspace(handshake.runtime, handshake.principal.workspace_id)

      connection = %{
        pid: self(),
        client_id: connection_id,
        owner_client_id: handshake.owner_client_id,
        principal: handshake.principal
      }

      {:ok, presence} = WheelSync.Workspace.join(workspace, connection)

      hello = %{
        "protocol" => @protocol,
        "type" => "hello",
        "connectionId" => connection_id,
        "applicationVersion" => application_version,
        "schemaVersion" => Map.fetch!(config, :schema_version)
      }

      stream_hello = event(%{"type" => "hello", "clientId" => connection_id})

      state =
        Map.merge(handshake, %{
          workspace: workspace,
          connection_id: connection_id,
          messages_started_at: System.monotonic_time(:millisecond),
          messages_count: 0,
          messages_per_minute: Map.get(config, :messages_per_minute, 1_200),
          detailed_errors: Map.get(config, :detailed_errors, false)
        })

      frames =
        Enum.map([hello, stream_hello | Enum.map(presence, &event/1)], &{:text, encode(&1)})

      {:push, frames, state}
    end
  end

  @impl true
  def handle_in({raw, opcode: :text}, state) do
    case rate(state) do
      {:error, state} ->
        {:stop, :normal, {4400, "rate_limited"}, state}

      {:ok, state} ->
        case decode_request(raw) do
          {:ok, request} -> handle_request(request, state)
          {:error, _reason} -> {:stop, :normal, {4400, "invalid_message"}, state}
        end
    end
  end

  def handle_in({_raw, opcode: :binary}, state),
    do: {:stop, :normal, {4400, "invalid_message"}, state}

  @impl true
  def handle_info({:wheel_event, payload}, state),
    do: {:push, {:text, encode(event(payload))}, state}

  def handle_info({:wheel_close, code, reason}, state),
    do: {:stop, :normal, {code, reason}, state}

  def handle_info(_message, state), do: {:ok, state}

  @impl true
  def terminate(_reason, %{workspace: workspace}) do
    WheelSync.Workspace.leave(workspace, self())
    :ok
  end

  def terminate(_reason, _state), do: :ok

  defp handle_request(request, state) do
    result =
      case request["type"] do
        "subscribe" ->
          WheelSync.Workspace.subscribe(
            state.workspace,
            self(),
            request["query"],
            request["params"]
          )

        "unsubscribe" ->
          :ok =
            WheelSync.Workspace.unsubscribe(
              state.workspace,
              self(),
              request["subscriptionId"]
            )

          {:ok, %{}}

        "presence" ->
          case WheelSync.Workspace.presence(state.workspace, self(), request["state"]) do
            :ok -> {:ok, %{}}
            error -> error
          end

        "mutateGroup" ->
          command = Map.put(request["command"], "clientId", state.connection_id)
          WheelSync.Workspace.mutate_group(state.workspace, command, state.principal)
      end

    response = response(request["requestId"], result, state.detailed_errors)
    {:push, {:text, encode(response)}, state}
  rescue
    error ->
      response =
        response(
          request["requestId"],
          {:error, "internal_error", Exception.message(error), true},
          state.detailed_errors
        )

      {:push, {:text, encode(response)}, state}
  end

  defp response(request_id, {:ok, value}, _detailed) do
    %{
      "protocol" => @protocol,
      "type" => "response",
      "requestId" => request_id,
      "ok" => true,
      "value" => value
    }
  end

  defp response(request_id, {:error, code, message}, detailed),
    do: response(request_id, {:error, code, message, false}, detailed)

  defp response(request_id, {:error, code, message, retryable}, detailed) do
    public_message =
      cond do
        detailed -> message
        retryable -> "The sync service is recovering. Retry shortly."
        true -> "The sync operation was rejected."
      end

    %{
      "protocol" => @protocol,
      "type" => "response",
      "requestId" => request_id,
      "ok" => false,
      "error" => %{"code" => code, "message" => public_message, "retryable" => retryable}
    }
  end

  defp decode_request(raw) when is_binary(raw) do
    with {:ok, request} when is_map(request) <- Jason.decode(raw),
         true <- request["protocol"] == @protocol,
         request_id when is_binary(request_id) and byte_size(request_id) in 1..128 <-
           request["requestId"],
         :ok <- validate_request(request) do
      {:ok, request}
    else
      _ -> {:error, :invalid_message}
    end
  end

  defp validate_request(%{"type" => "subscribe", "query" => query})
       when is_binary(query) and query != "",
       do: :ok

  defp validate_request(%{"type" => "unsubscribe", "subscriptionId" => id})
       when is_binary(id) and id != "",
       do: :ok

  defp validate_request(%{"type" => "presence", "state" => nil}), do: :ok

  defp validate_request(%{"type" => "presence", "state" => state})
       when is_map(state) and not is_struct(state),
       do: :ok

  defp validate_request(%{"type" => "mutateGroup", "command" => command})
       when is_map(command) do
    if is_binary(command["mutationId"]) && is_list(command["calls"]) &&
         Enum.all?(command["calls"], fn call ->
           is_map(call) && is_binary(call["name"]) && is_list(call["ids"]) &&
             Enum.all?(call["ids"], &is_binary/1)
         end),
       do: :ok,
       else: :error
  end

  defp validate_request(_request), do: :error

  defp rate(state) do
    now = System.monotonic_time(:millisecond)

    state =
      if now - state.messages_started_at >= 60_000 do
        %{state | messages_started_at: now, messages_count: 0}
      else
        state
      end

    state = %{state | messages_count: state.messages_count + 1}
    if state.messages_count <= state.messages_per_minute, do: {:ok, state}, else: {:error, state}
  end

  defp event(payload), do: %{"protocol" => @protocol, "type" => "event", "event" => payload}
  defp encode(value), do: Jason.encode!(value)

  defp issue_connection_id do
    "conn_" <> Base.url_encode64(:crypto.strong_rand_bytes(18), padding: false)
  end
end
