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

    postgres_options =
      database_url
      |> WheelSync.PostgresOptions.from_url!()
      |> Keyword.merge(
        name: names.postgres,
        pool_size: Keyword.get(options, :pool_size, 10)
      )

    children = [
      {Postgrex, postgres_options},
      {Registry, keys: :unique, name: names.workspace_registry},
      {DynamicSupervisor, strategy: :one_for_one, name: names.workspace_supervisor},
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
