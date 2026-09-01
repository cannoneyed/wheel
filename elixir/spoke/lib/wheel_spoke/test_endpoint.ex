defmodule WheelSpoke.TestEndpoint do
  @moduledoc false
  @behaviour Plug

  @impl true
  def init(options), do: options

  @impl true
  def call(conn, options) do
    conn = Plug.Conn.fetch_query_params(conn)
    runtime = Keyword.fetch!(options, :runtime)

    case {conn.method, conn.request_path} do
      {"POST", "/__test/missed-message"} -> missed_message(conn, runtime)
      {"POST", "/__test/catch-up"} -> catch_up(conn, runtime)
      _ -> WheelSpoke.Endpoint.call(conn, options)
    end
  end

  defp missed_message(conn, runtime) do
    with {:ok, conn, workspace_id, channel_id, body} <- WheelSpoke.Endpoint.read_message(conn),
         {:ok, {seq, message_id}} <-
           commit_without_notification(runtime, workspace_id, channel_id, body) do
      WheelSpoke.Endpoint.json(conn, 201, %{"ok" => true, "messageId" => message_id, "seq" => seq})
    else
      {:error, %Plug.Conn{} = conn} ->
        WheelSpoke.Endpoint.json(conn, 400, %{"ok" => false})

      {:error, :unknown_channel} ->
        WheelSpoke.Endpoint.json(conn, 404, %{"ok" => false, "error" => "unknown_channel"})

      {:error, reason} ->
        WheelSpoke.Endpoint.json(conn, 500, %{"ok" => false, "error" => inspect(reason)})
    end
  end

  defp catch_up(conn, runtime) do
    workspace_id = conn.query_params["workspace"]

    if workspace_id in ["acme", "orbit"] do
      {:ok, workspace} = WheelSync.Runtime.workspace(runtime, workspace_id)
      send(workspace, :wheel_sync_periodic_catch_up)
      WheelSpoke.Endpoint.json(conn, 200, %{"ok" => true})
    else
      WheelSpoke.Endpoint.json(conn, 400, %{"ok" => false})
    end
  end

  defp commit_without_notification(runtime, workspace_id, channel_id, body) do
    %{names: names} = WheelSync.Runtime.config(runtime)

    Postgrex.transaction(names.postgres, fn connection ->
      message_id =
        "message_missed_" <> Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false)

      if Postgrex.query!(
           connection,
           "select 1 from spoke_channels where workspace_id=$1 and id=$2",
           [workspace_id, channel_id]
         ).rows == [] do
        Postgrex.rollback(connection, :unknown_channel)
      end

      Postgrex.query!(
        connection,
        """
        insert into spoke_messages
          (workspace_id,id,channel_id,author_id,body,created_at,edited_at)
        values ($1,$2,$3,'bot',$4,$5,null)
        """,
        [workspace_id, message_id, channel_id, body, System.system_time(:millisecond)]
      )

      seq = WheelSync.Storage.next_seq!(connection, workspace_id)

      Postgrex.query!(
        connection,
        """
        insert into wheel_sync_log
          (workspace_id,seq,mutation_id,name,touched,actor,client_id)
        values ($1,$2,$3,'test:missed',$4,'bot:spoke','server:test')
        """,
        [workspace_id, seq, "missed_#{message_id}", ["messages"]]
      )

      {seq, message_id}
    end)
  end
end
