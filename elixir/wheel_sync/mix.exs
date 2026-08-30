defmodule WheelSync.MixProject do
  use Mix.Project

  def project do
    [
      app: :wheel_sync,
      version: "0.1.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      elixirc_paths: elixirc_paths(Mix.env()),
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
