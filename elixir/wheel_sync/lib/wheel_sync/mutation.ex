defmodule WheelSync.Mutation do
  @moduledoc false

  @callback name() :: String.t()
  @callback run(WheelSync.Tx.t(), args :: map(), WheelSync.Ctx.t()) ::
              :ok | {:ok, term()} | {:reject, String.t(), String.t()}
end
