defmodule WheelSync.WritePerformanceTest do
  use ExUnit.Case, async: false
  @moduletag postgres: true, benchmark: true

  # Opt-in PostgreSQL unit benchmark. Every case verifies all writes and log
  # entries; timing is reported, never used as a flaky pass/fail threshold.
  for pool <- [1, 2, 4, 8], shared <- [false, true] do
    @pool pool
    @shared shared
    test "50 writers, pool #{@pool}, shared row #{@shared}" do
      options =
        System.fetch_env!("DATABASE_URL")
        |> WheelSync.Test.WireApp.options(0)
        |> Keyword.merge(
          serve: false,
          name: __MODULE__,
          supervisor_name: __MODULE__.Supervisor,
          write_pool_size: @pool,
          queue_target: 5_000
        )

      start_supervised!({WheelSync.Supervisor, options})
      names = WheelSync.Names.from_options(options)
      id = "write-benchmark-#{System.unique_integer([:positive])}"
      {:ok, ws} = WheelSync.Runtime.workspace(names.runtime, id)

      on_exit(fn ->
        {:ok, conn} =
          Postgrex.start_link(
            WheelSync.PostgresOptions.from_url!(System.fetch_env!("DATABASE_URL"))
          )

        Postgrex.query!(conn, "delete from wire_widgets where workspace_id=$1", [id])
        Postgrex.query!(conn, "delete from wheel_sync_workspaces where workspace_id=$1", [id])
        GenServer.stop(conn)
      end)

      Postgrex.query!(
        names.postgres,
        "insert into wire_widgets(workspace_id,id,title,position,sort_order,active) select $1,n::text,'benchmark',0,n,true from generate_series(1,50) n",
        [id]
      )

      started = System.monotonic_time(:microsecond)

      samples =
        1..50
        |> Task.async_stream(
          fn client ->
            for _ <- 1..2 do
              before = System.monotonic_time(:microsecond)

              {:ok, %{seq: seq}} =
                WheelSync.Workspace.external_write(
                  ws,
                  [source: "benchmark", actor: "test"],
                  fn tx ->
                    row = if @shared, do: "1", else: to_string(client)

                    WheelSync.Tx.exec!(
                      tx,
                      "update wire_widgets set position=position+1 where workspace_id=$1 and id=$2",
                      [id, row]
                    )

                    # Hold the row lock while simulating 10ms of transaction work.
                    WheelSync.Tx.exec!(tx, "select pg_sleep(0.01)")
                    WheelSync.Tx.touch!(tx, "widgets")
                    {:ok, nil}
                  end
                )

              {(System.monotonic_time(:microsecond) - before) / 1000, seq}
            end
          end,
          max_concurrency: 50,
          timeout: 15_000
        )
        |> Enum.flat_map(fn {:ok, results} -> results end)

      elapsed_ms = (System.monotonic_time(:microsecond) - started) / 1000
      assert Enum.sort(Enum.map(samples, &elem(&1, 1))) == Enum.to_list(1..100)

      assert [[100.0]] =
               Postgrex.query!(
                 names.postgres,
                 "select sum(position) from wire_widgets where workspace_id=$1",
                 [id]
               ).rows

      assert length(WheelSync.Storage.changes_after(names.postgres, id, 0)) == 100
      durations = samples |> Enum.map(&elem(&1, 0)) |> Enum.sort()

      IO.puts(
        "WHEEL_WRITE_BENCHMARK=" <>
          Jason.encode!(%{
            pool: @pool,
            shared_row: @shared,
            clients: 50,
            writes: 100,
            handler_delay_ms: 10,
            elapsed_ms: elapsed_ms,
            writes_per_second: 100_000 / elapsed_ms,
            p50_ms: Enum.at(durations, 49),
            p95_ms: Enum.at(durations, 94),
            p99_ms: Enum.at(durations, 98)
          })
      )
    end
  end
end
