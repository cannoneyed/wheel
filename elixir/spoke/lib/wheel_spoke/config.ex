defmodule WheelSpoke.Config do
  @moduledoc false

  def options do
    [
      name: WheelSpoke.Sync,
      supervisor_name: WheelSpoke.Sync.Supervisor,
      database_url: fetch_env!("DATABASE_URL"),
      pool_size: integer_env("SPOKE_DATABASE_POOL_SIZE", 10),
      ip: address_env("SPOKE_IP", {127, 0, 0, 1}),
      port: integer_env("SPOKE_PORT", integer_env("PORT", 4906)),
      serve: true,
      endpoint: endpoint(),
      application_version: 1,
      minimum_client_version: 1,
      schema_version: 1,
      detailed_errors: System.get_env("SPOKE_MODE", "demo") == "demo",
      allowed_origins: allowed_origins(),
      schema_path: schema_path(),
      authenticator: WheelSpoke.Authenticator,
      queries: WheelSpoke.Queries.modules(),
      mutations: WheelSpoke.Mutations.modules(),
      migrations: WheelSpoke.Schema.statements(),
      bootstrapper: WheelSpoke.Seed,
      presence_filter: &WheelSpoke.Presence.visible?/3
    ]
  end

  defp endpoint do
    if System.get_env("SPOKE_TEST_CONTROLS") == "1",
      do: WheelSpoke.TestEndpoint,
      else: WheelSpoke.Endpoint
  end

  defp schema_path do
    Path.expand("../../../../packages/spoke/server/schema-spec.json", __DIR__)
  end

  defp fetch_env!(name), do: System.get_env(name) || raise("#{name} is required")

  defp integer_env(name, fallback) do
    case System.get_env(name) do
      nil -> fallback
      value -> String.to_integer(value)
    end
  end

  defp address_env(name, fallback) do
    case System.get_env(name) do
      nil -> fallback
      value -> parse_address!(name, value)
    end
  end

  defp parse_address!(name, value) do
    case :inet.parse_address(String.to_charlist(value)) do
      {:ok, address} -> address
      {:error, :einval} -> raise "#{name} must be an IPv4 or IPv6 address"
    end
  end

  defp allowed_origins do
    case System.get_env("SPOKE_ALLOWED_ORIGINS") do
      nil -> nil
      value -> value |> String.split(",", trim: true) |> Enum.map(&String.trim/1)
    end
  end
end
