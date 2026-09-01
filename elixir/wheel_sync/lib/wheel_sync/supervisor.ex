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

    connection_options = WheelSync.PostgresOptions.from_url!(database_url)

    postgres_options =
      Keyword.merge(connection_options,
        name: names.postgres,
        pool_size: Keyword.get(options, :pool_size, 10)
      )

    notification_options =
      Keyword.merge(connection_options, name: names.notifications, auto_reconnect: true)

    children = [
      {Postgrex, postgres_options},
      {Postgrex.Notifications, notification_options},
      {Registry, keys: :unique, name: names.workspace_registry},
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
