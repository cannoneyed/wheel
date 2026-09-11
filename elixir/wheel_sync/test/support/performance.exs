# One-shot benchmark. Starts and stops its own runtime, uses an explicitly named
# private database, and removes only the workspace it created.
defmodule WheelSync.Performance do
  def run do
    url = System.fetch_env!("DATABASE_URL")

    unless URI.parse(url).path in ["/everybody_sync_perf_20260910", "/wheel_sync_perf"],
      do: raise("performance runs require a dedicated test database")

    clients = integer("WHEEL_PERF_CLIENTS", 50)
    rows = integer("WHEEL_PERF_ROWS", 100)
    delay = integer("WHEEL_PERF_DELAY_MS", 40)
    scopes = integer("WHEEL_PERF_SCOPES", 8)
    options = WheelSync.Test.WireApp.options(url, 0)
    schema = options[:schema_path] |> File.read!() |> Jason.decode!()
    template = Enum.find(schema["queries"], &(&1["name"] == "widgets.all"))

    modules =
      for n <- 1..scopes do
        name = "widgets.scope#{n}"
        module = Module.concat(__MODULE__, "Scope#{n}")

        Module.create(
          module,
          quote do
            def name, do: unquote(name)

            def sql(_params, principal) do
              {"with delay as materialized (select pg_sleep($2)) select id,title,position,active,note from wire_widgets cross join delay where workspace_id=$1 order by sort_order,id",
               [principal.workspace_id, unquote(delay) / 1000]}
            end
          end,
          Macro.Env.location(__ENV__)
        )

        module
      end

    schema = %{schema | "queries" => Enum.map(modules, &Map.put(template, "name", &1.name()))}

    schema_path =
      Path.join(System.tmp_dir!(), "wheel-perf-#{System.unique_integer([:positive])}.json")

    File.write!(schema_path, Jason.encode!(schema))

    options =
      Keyword.merge(options,
        schema_path: schema_path,
        queries: modules,
        serve: false,
        name: __MODULE__,
        supervisor_name: __MODULE__.Supervisor,
        pool_size: integer("WHEEL_PERF_POOL", 10)
      )

    {:ok, supervisor} = WheelSync.Supervisor.start_link(options)
    names = WheelSync.Names.from_options(options)
    id = "wheel-perf-#{System.unique_integer([:positive])}"

    try do
      Postgrex.query!(
        names.postgres,
        "insert into wire_widgets(workspace_id,id,title,position,sort_order,active,note) select $1,'widget_'||n,'Document '||n,n,n,true,repeat('x',128) from generate_series(1,$2::int) n",
        [id, rows]
      )

      {:ok, ws} = WheelSync.Runtime.workspace(names.runtime, id)
      before = :erlang.memory(:total)
      parent = self()
      sampler = spawn(fn -> sample(parent, 0) end)

      actors =
        for n <- 1..clients do
          spawn(fn ->
            principal = %WheelSync.Principal{
              workspace_id: id,
              actor: "user:#{n}",
              session_id: "session:#{n}"
            }

            {:ok, _} =
              WheelSync.Workspace.join(ws, %{
                pid: self(),
                principal: principal,
                client_id: "client:#{n}",
                owner_client_id: "client:#{n}"
              })

            send(parent, {:ready, self()})

            receive do
              :go -> :ok
            end

            started = System.monotonic_time(:microsecond)

            # Calls share one connection but each has its own response waiter, like the browser transport.
            tasks =
              Enum.map(modules, fn module ->
                caller = self()

                Task.async(fn ->
                  result =
                    try do
                      WheelSync.Workspace.subscribe(ws, caller, module.name(), %{})
                    catch
                      :exit, _reason -> {:error, :timeout}
                    end

                  elapsed = (System.monotonic_time(:microsecond) - started) / 1000
                  {elapsed, match?({:ok, %{"status" => %{"kind" => "live"}}}, result)}
                end)
              end)

            results = Enum.map(tasks, &Task.await(&1, 60_000))
            send(parent, {:results, self(), results})

            receive do
              :stop -> WheelSync.Workspace.leave(ws, self())
            end
          end)
        end

      for _ <- actors do
        receive do
          {:ready, _} -> :ok
        after
          10_000 -> raise "join timeout"
        end
      end

      started = System.monotonic_time(:millisecond)
      Enum.each(actors, &send(&1, :go))

      results =
        for _ <- actors do
          receive do
            {:results, _, values} -> values
          after
            60_000 -> raise "load timeout"
          end
        end

      elapsed = System.monotonic_time(:millisecond) - started
      live = :erlang.memory(:total)
      coordinator = Process.info(ws, [:memory, :message_queue_len]) |> Map.new()
      Enum.each(actors, &send(&1, :stop))
      Process.sleep(300)
      :erlang.garbage_collect(ws)
      after_cleanup = :erlang.memory(:total)
      send(sampler, :stop)

      peak =
        receive do
          {:peak, value} -> value
        after
          1000 -> live
        end

      samples = results |> List.flatten() |> Enum.map(&elem(&1, 0)) |> Enum.sort()
      failures = results |> List.flatten() |> Enum.count(&(not elem(&1, 1)))

      report = %{
        clients: clients,
        scopes: scopes,
        rows: rows,
        injected_query_ms: delay,
        pool: options[:pool_size],
        requests: length(samples),
        failures: failures,
        elapsed_ms: elapsed,
        p50_ms: percentile(samples, 0.5),
        p95_ms: percentile(samples, 0.95),
        p99_ms: percentile(samples, 0.99),
        max_ms: List.last(samples),
        beam_before: before,
        beam_live: live,
        beam_peak: peak,
        beam_after_cleanup: after_cleanup,
        coordinator: coordinator
      }

      IO.puts("WHEEL_PERFORMANCE=" <> Jason.encode!(report))
    after
      WheelSync.WorkspaceSupervisor.stop_all(names)
      Postgrex.query!(names.postgres, "delete from wire_widgets where workspace_id=$1", [id])

      Postgrex.query!(names.postgres, "delete from wheel_sync_workspaces where workspace_id=$1", [
        id
      ])

      Supervisor.stop(supervisor)
      File.rm!(schema_path)
    end
  end

  defp sample(parent, peak) do
    peak = max(peak, :erlang.memory(:total))

    receive do
      :stop -> send(parent, {:peak, peak})
    after
      50 -> sample(parent, peak)
    end
  end

  defp percentile(samples, p), do: Enum.at(samples, max(0, ceil(length(samples) * p) - 1))
  defp integer(name, default), do: System.get_env(name, to_string(default)) |> String.to_integer()
end

WheelSync.Performance.run()
