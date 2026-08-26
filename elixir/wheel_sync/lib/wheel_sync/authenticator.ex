defmodule WheelSync.Authenticator do
  @moduledoc false

  @callback authenticate(Plug.Conn.t(), map()) ::
              {:ok, WheelSync.Principal.t()} | :error | {:error, term()}
end

defmodule WheelSync.Principal do
  @moduledoc false

  @enforce_keys [:actor, :workspace_id, :session_id]
  defstruct [:actor, :workspace_id, :session_id]

  @type t :: %__MODULE__{
          actor: String.t(),
          workspace_id: String.t(),
          session_id: String.t()
        }

  def validate!(%__MODULE__{} = principal) do
    for {name, value} <- Map.from_struct(principal) do
      if !is_binary(value) || value == "" do
        raise ArgumentError, "principal #{name} must be a non-empty string"
      end
    end

    principal
  end
end
