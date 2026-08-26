database_url =
  System.get_env("DATABASE_URL") ||
    raise "DATABASE_URL must point to the wire conformance Postgres database"

port = System.get_env("PORT", "4001") |> String.to_integer()

{:ok, _supervisor} =
  WheelSync.Supervisor.start_link(WheelSync.Test.WireApp.options(database_url, port))

IO.puts("wheel_sync wire server listening on http://127.0.0.1:#{port}")
Process.sleep(:infinity)
