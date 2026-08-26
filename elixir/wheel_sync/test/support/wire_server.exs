database_url =
  System.get_env("DATABASE_URL") ||
    raise "DATABASE_URL must point to the wire conformance Postgres database"

port = System.get_env("PORT", "4001") |> String.to_integer()

ip =
  System.get_env("WHEEL_SYNC_IP", "127.0.0.1")
  |> String.to_charlist()
  |> :inet.parse_address()
  |> case do
    {:ok, address} -> address
    {:error, :einval} -> raise "WHEEL_SYNC_IP must be an IPv4 or IPv6 address"
  end

{:ok, _supervisor} =
  WheelSync.Supervisor.start_link(
    database_url
    |> WheelSync.Test.WireApp.options(port)
    |> Keyword.put(:ip, ip)
  )

IO.puts("wheel_sync wire server listening on port #{port}")
Process.sleep(:infinity)
