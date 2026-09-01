defmodule WheelSpoke.Seed do
  @moduledoc false

  @workspaces ["acme", "orbit"]
  @tables ~w(spoke_channel_reads spoke_messages spoke_channel_members spoke_channels spoke_members)

  def bootstrap(postgres, _config) do
    {:ok, :ok} =
      Postgrex.transaction(postgres, fn connection ->
        if System.get_env("SPOKE_RESET_DATABASE") == "1" do
          for table <- @tables do
            Postgrex.query!(connection, "delete from #{table} where workspace_id = any($1)", [
              @workspaces
            ])
          end

          Postgrex.query!(
            connection,
            "delete from wheel_sync_workspaces where workspace_id = any($1)",
            [@workspaces]
          )
        end

        seed_acme(connection)
        seed_orbit(connection)
        :ok
      end)

    :ok
  end

  defp seed_acme(connection) do
    query!(
      connection,
      "insert into spoke_members values ('acme','ada','Ada'),('acme','lin','Lin') on conflict do nothing"
    )

    query!(connection, """
    insert into spoke_channels values
      ('acme','channel_general','general',false,1730000000000),
      ('acme','channel_leads','leads',true,1730000000001)
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_channel_members values
      ('acme','channel_general','ada'),('acme','channel_general','lin'),
      ('acme','channel_leads','ada')
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_messages values
      ('acme','message_acme_general','channel_general','ada','Welcome to Acme',1730000000100,null),
      ('acme','message_acme_private','channel_leads','ada','Acme launch is private',1730000000200,null)
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_channel_reads values
      ('acme','channel_general','ada',1730000000100),
      ('acme','channel_general','lin',0),
      ('acme','channel_leads','ada',1730000000200)
    on conflict do nothing
    """)
  end

  defp seed_orbit(connection) do
    query!(
      connection,
      "insert into spoke_members values ('orbit','max','Max') on conflict do nothing"
    )

    query!(connection, """
    insert into spoke_channels values
      ('orbit','channel_general','general',false,1730000000000),
      ('orbit','channel_ops','ops',true,1730000000001)
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_channel_members values
      ('orbit','channel_general','max'),('orbit','channel_ops','max')
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_messages values
      ('orbit','message_orbit_general','channel_general','max','Welcome to Orbit',1730000000100,null),
      ('orbit','message_orbit_private','channel_ops','max','Orbit operations only',1730000000200,null)
    on conflict do nothing
    """)

    query!(connection, """
    insert into spoke_channel_reads values
      ('orbit','channel_general','max',1730000000100),
      ('orbit','channel_ops','max',1730000000200)
    on conflict do nothing
    """)
  end

  defp query!(connection, sql), do: Postgrex.query!(connection, sql, [])
end
