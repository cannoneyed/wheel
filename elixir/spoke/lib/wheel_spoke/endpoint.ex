defmodule WheelSpoke.Endpoint do
  @moduledoc false
  @behaviour Plug

  import Plug.Conn

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, options) do
    conn = fetch_query_params(conn)

    case {conn.method, conn.request_path} do
      {"POST", "/bot/message"} -> bot_message(conn, Keyword.fetch!(options, :runtime))
      _ -> WheelSync.Endpoint.call(conn, options)
    end
  end

  def read_message(conn) do
    with workspace_id when workspace_id in ["acme", "orbit"] <- conn.query_params["workspace"],
         {:ok, raw, conn} <- read_body(conn, length: 16_384),
         {:ok, %{"channelId" => channel_id, "body" => body}} <- Jason.decode(raw),
         true <- is_binary(channel_id) and is_binary(body),
         text <- String.trim(body),
         true <- text != "" and String.length(text) <= 240 do
      {:ok, conn, workspace_id, channel_id, text}
    else
      _ -> {:error, conn}
    end
  end

  def json(conn, status, value) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(value))
  end

  defp bot_message(conn, runtime) do
    with {:ok, conn, workspace_id, channel_id, body} <- read_message(conn),
         {:ok, %{seq: seq, value: message_id}} <-
           WheelSync.external_write(
             runtime,
             workspace_id,
             [source: "bot.message", actor: "bot:spoke"],
             fn tx -> insert_message(tx, channel_id, body, "message_bot") end
           ) do
      json(conn, 201, %{"ok" => true, "messageId" => message_id, "seq" => seq})
    else
      {:error, %Plug.Conn{} = conn} ->
        json(conn, 400, %{"ok" => false})

      {:error, :unknown_channel} ->
        json(conn, 404, %{"ok" => false, "error" => "unknown_channel"})

      {:error, reason} ->
        json(conn, 500, %{"ok" => false, "error" => inspect(reason)})
    end
  end

  defp insert_message(tx, channel_id, body, prefix) do
    case WheelSync.Tx.exec!(
           tx,
           "select 1 from spoke_channels where workspace_id=$1 and id=$2",
           [tx.workspace_id, channel_id]
         ).rows do
      [] ->
        {:error, :unknown_channel}

      _rows ->
        message_id =
          prefix <> "_" <> Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false)

        WheelSync.Tx.exec!(
          tx,
          """
          insert into spoke_messages
            (workspace_id,id,channel_id,author_id,body,created_at,edited_at)
          values ($1,$2,$3,'bot',$4,$5,null)
          """,
          [tx.workspace_id, message_id, channel_id, body, System.system_time(:millisecond)]
        )

        :ok = WheelSync.Tx.touch!(tx, "messages")
        {:ok, message_id}
    end
  end
end
