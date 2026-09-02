defmodule WheelSync.MixProject do
  use Mix.Project

  def project do
    [
      app: :wheel_sync,
      version: "0.2.1",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
      description: "Wheel protocol v3 sync server for Elixir and PostgreSQL.",
      source_url: "https://github.com/cannoneyed/wheel/tree/main/elixir/wheel_sync",
      homepage_url: "https://wheel.dev",
      package: [
        licenses: ["LicenseRef-Cannoneyed-Proprietary"],
        links: %{"GitHub" => "https://github.com/cannoneyed/wheel"}
      ],
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:crypto, :logger],
      mod: {WheelSync.Application, []}
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_env), do: ["lib"]

  defp deps do
    [
      {:bandit, "~> 1.12"},
      {:jason, "~> 1.4"},
      {:jsv, "~> 0.22"},
      {:postgrex, "~> 0.22"},
      {:telemetry, "~> 1.0"},
      {:websock_adapter, "~> 0.5"}
    ]
  end
end
