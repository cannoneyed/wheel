defmodule WheelSync.Supervisor do
  @moduledoc false
  use Supervisor

  def start_link(options) do
    Supervisor.start_link(__MODULE__, options,
      name: Keyword.get(options, :supervisor_name, __MODULE__)
    )
  end

  @impl true
  def init(options) do
    names = WheelSync.Names.from_options(options)
    database_url = Keyword.fetch!(options, :database_url)
    registry = WheelSync.Registry.build!(options)

    connection_options =
      database_url
      |> WheelSync.PostgresOptions.from_url!()
      |> Keyword.put(:prepare, Keyword.get(options, :prepare, :named))

    postgres_options =
      Keyword.merge(connection_options,
        name: names.postgres,
        pool_size: Keyword.get(options, :pool_size, 10),
        queue_target: Keyword.get(options, :queue_target, 50),
        queue_interval: Keyword.get(options, :queue_interval, 1_000)
      )

    write_pool_size = Keyword.get(options, :write_pool_size, 2)
    write_queue_size = Keyword.get(options, :write_queue_size, 128)
    write_timeout = Keyword.get(options, :write_timeout, 25_000)

    unless is_integer(write_pool_size) and write_pool_size > 0 and
             is_integer(write_queue_size) and write_queue_size >= 0 and
             is_integer(write_timeout) and write_timeout > 0 do
      raise ArgumentError,
            "write_pool_size and write_timeout must be positive; write_queue_size must be nonnegative"
    end

    writer_options =
      Keyword.merge(connection_options,
        name: names.writer_postgres,
        pool_size: write_pool_size,
        queue_target: Keyword.get(options, :queue_target, 50),
        queue_interval: Keyword.get(options, :queue_interval, 1_000)
      )

    notification_options =
      Keyword.merge(connection_options, name: names.notifications, auto_reconnect: true)

    children = [
      {Postgrex, postgres_options},
      Supervisor.child_spec({Postgrex, writer_options}, id: names.writer_postgres),
      {Postgrex.Notifications, notification_options},
      {Registry, keys: :unique, name: names.workspace_registry},
      {Task.Supervisor, name: names.tasks},
      Supervisor.child_spec(
        {Task.Supervisor,
         name: names.write_tasks, max_children: write_pool_size + write_queue_size},
        id: names.write_tasks
      ),
      {DynamicSupervisor, strategy: :one_for_one, name: names.workspace_supervisor},
      {WheelSync.ChangeListener, names: names},
      {WheelSync.Runtime, names: names, registry: registry, options: options}
    ]

    children =
      if Keyword.get(options, :serve, true) do
        endpoint = Keyword.get(options, :endpoint, WheelSync.Endpoint)

        children ++
          [
            {Bandit,
             plug: {endpoint, runtime: names.runtime},
             scheme: :http,
             ip: Keyword.get(options, :ip, {127, 0, 0, 1}),
             port: Keyword.get(options, :port, 4001)}
          ]
      else
        children
      end

    Supervisor.init(children, strategy: :one_for_one)
  end
end
