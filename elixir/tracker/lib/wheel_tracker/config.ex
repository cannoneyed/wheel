defmodule WheelTracker.Config do
  @moduledoc false

  def options do
    [
      name: WheelTracker.Sync,
      supervisor_name: WheelTracker.Sync.Supervisor,
      database_url: fetch_env!("DATABASE_URL"),
      pool_size: integer_env("TRACKER_DATABASE_POOL_SIZE", 10),
      port: integer_env("TRACKER_PORT", integer_env("PORT", 4797)),
      serve: true,
      application_version: 1,
      minimum_client_version: 1,
      schema_version: 1,
      detailed_errors: System.get_env("TRACKER_MODE", "demo") == "demo",
      max_message_bytes: integer_env("TRACKER_MAX_BODY_BYTES", 256 * 1024),
      messages_per_minute: integer_env("TRACKER_REQUESTS_PER_MINUTE", 1_200),
      schema_path: schema_path(),
      authenticator: WheelTracker.Authenticator,
      queries: WheelTracker.Queries.modules(),
      mutations: WheelTracker.Mutations.modules(),
      migrations: WheelTracker.Schema.statements(),
      bootstrapper: WheelTracker.Seed
    ]
  end

  defp schema_path do
    Path.expand("../../../../packages/tracker/server/schema-spec.json", __DIR__)
  end

  defp fetch_env!(name) do
    System.get_env(name) || raise "#{name} is required"
  end

  defp integer_env(name, fallback) do
    case System.get_env(name) do
      nil -> fallback
      value -> String.to_integer(value)
    end
  end
end
