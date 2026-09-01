defmodule WheelSpoke.MixProject do
  use Mix.Project

  def project do
    [
      app: :wheel_spoke,
      version: "0.2.0",
      elixir: "~> 1.18",
      start_permanent: Mix.env() == :prod,
      deps: [{:wheel_sync, path: "../wheel_sync"}]
    ]
  end

  def application do
    [extra_applications: [:logger], mod: {WheelSpoke.Application, []}]
  end
end
