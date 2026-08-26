defmodule WheelSync.Error do
  @moduledoc false
  defexception [:code, :message]

  @type t :: %__MODULE__{code: String.t(), message: String.t()}
end

defmodule WheelSync.Rejection do
  @moduledoc false
  defexception [:code, :message]
end
