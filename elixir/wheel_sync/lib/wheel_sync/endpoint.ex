defmodule WheelSync.Endpoint do
  @moduledoc false
  @behaviour Plug

  import Plug.Conn

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, options) do
    conn = fetch_query_params(conn)
    runtime = Keyword.fetch!(options, :runtime)

    case {conn.method, conn.request_path} do
      {"GET", "/readyz"} -> json(conn, 200, %{"ok" => true})
      {"POST", "/__reset"} -> reset(conn, runtime)
      {_, "/sync/websocket"} -> websocket(conn, runtime)
      _ -> json(conn, 404, %{"ok" => false})
    end
  end

  defp websocket(conn, runtime) do
    config = WheelSync.Runtime.config(runtime)

    with :ok <- require_upgrade(conn),
         :ok <- allow_origin(conn, Map.get(config, :allowed_origins)),
         {:ok, principal} <- authenticate(conn, config),
         {:ok, owner_client_id} <- client_id(conn),
         {:ok, client_protocol, client_application_version, client_row_schema_fingerprint} <-
           versions(conn) do
      state = %{
        runtime: runtime,
        owner_client_id: owner_client_id,
        principal: principal,
        client_protocol: client_protocol,
        client_application_version: client_application_version,
        client_row_schema_fingerprint: client_row_schema_fingerprint
      }

      WebSockAdapter.upgrade(conn, WheelSync.Socket, state,
        timeout: Map.get(config, :socket_timeout, 60_000),
        max_frame_size: Map.get(config, :max_message_bytes, 256 * 1024)
      )
    else
      {:error, status, code, message} ->
        json(conn, status, %{"ok" => false, "error" => %{"code" => code, "message" => message}})
    end
  end

  defp require_upgrade(conn) do
    if conn.method == "GET" &&
         String.downcase(get_req_header(conn, "upgrade") |> List.first() || "") == "websocket" do
      :ok
    else
      {:error, 426, "websocket_required", "Use a WebSocket upgrade request."}
    end
  end

  defp allow_origin(conn, nil) do
    case get_req_header(conn, "origin") do
      [] ->
        :ok

      [origin | _] ->
        expected = "#{conn.scheme}://#{conn.host}:#{conn.port}"

        if origin == expected,
          do: :ok,
          else: {:error, 403, "origin_forbidden", "This WebSocket origin is not allowed."}
    end
  end

  defp allow_origin(conn, allowed) do
    case get_req_header(conn, "origin") do
      [] ->
        :ok

      [origin | _] ->
        if origin in allowed,
          do: :ok,
          else: {:error, 403, "origin_forbidden", "This WebSocket origin is not allowed."}
    end
  end

  defp authenticate(conn, config) do
    authenticator = config.registry.authenticator

    case authenticator.authenticate(conn, config) do
      {:ok, %WheelSync.Principal{} = principal} ->
        {:ok, WheelSync.Principal.validate!(principal)}

      :error ->
        {:error, 401, "unauthenticated", "Authentication is required."}

      {:error, _reason} ->
        {:error, 401, "unauthenticated", "Authentication is required."}
    end
  rescue
    ArgumentError -> {:error, 401, "unauthenticated", "Authentication is required."}
  end

  defp client_id(conn) do
    value = conn.query_params["client"] || ""

    if byte_size(value) in 1..256,
      do: {:ok, value},
      else: {:error, 400, "invalid_client", "client must contain 1 to 256 characters."}
  end

  defp versions(conn) do
    with {:ok, protocol} <- integer_param(conn.query_params["protocol"]),
         {:ok, version} <- integer_param(conn.query_params["version"]) do
      fingerprint = conn.query_params["rowSchemaFingerprint"] || ""

      if byte_size(fingerprint) <= 128,
        do: {:ok, protocol, version, fingerprint},
        else:
          {:error, 400, "invalid_row_schema_fingerprint",
           "rowSchemaFingerprint must contain 128 characters or fewer."}
    else
      _ -> {:error, 400, "invalid_version", "protocol and version must be integers."}
    end
  end

  defp integer_param(value) when is_binary(value) do
    case Integer.parse(value) do
      {number, ""} -> {:ok, number}
      _ -> :error
    end
  end

  defp integer_param(_value), do: :error

  defp reset(conn, runtime) do
    case WheelSync.Runtime.reset(runtime) do
      :ok -> json(conn, 200, %{"ok" => true})
      {:error, :reset_not_enabled} -> json(conn, 404, %{"ok" => false})
      {:error, reason} -> json(conn, 500, %{"ok" => false, "error" => inspect(reason)})
    end
  end

  defp json(conn, status, value) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(value))
  end
end
