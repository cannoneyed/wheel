defmodule WheelSync.Query do
  @moduledoc false

  @callback name() :: String.t()
  @callback sql(params :: map(), principal :: WheelSync.Principal.t()) ::
              {String.t(), [term()]}
end
