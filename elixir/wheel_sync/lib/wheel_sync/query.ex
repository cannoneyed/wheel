defmodule WheelSync.Query do
  @moduledoc false

  @callback name() :: String.t()
  @callback sql(params :: map(), principal :: WheelSync.Principal.t()) ::
              {String.t(), [term()]}
  @callback run(params :: map(), principal :: WheelSync.Principal.t()) ::
              [map()] | {:ok, [map()]} | {:error, String.t(), String.t()}
  @callback subscribe(
              params :: map(),
              invalidate :: (-> any()),
              principal :: WheelSync.Principal.t()
            ) :: (-> any())

  @optional_callbacks sql: 2, run: 2, subscribe: 3
end
