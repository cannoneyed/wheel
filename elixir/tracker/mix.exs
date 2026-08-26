defmodule WheelTracker.MixProject do
  use Mix.Project

  def project do
    [
      app: :wheel_tracker,
      version: "0.1.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: [{:wheel_sync, path: "../wheel_sync"}]
    ]
  end

  def application do
    [extra_applications: [:logger], mod: {WheelTracker.Application, []}]
  end
end
