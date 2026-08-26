defmodule WheelSync.Ctx do
  @moduledoc false

  @enforce_keys [:ref, :principal, :client_id, :mutation_id]
  defstruct [:ref, :principal, :client_id, :mutation_id]

  @type t :: %__MODULE__{
          ref: reference(),
          principal: WheelSync.Principal.t(),
          client_id: String.t(),
          mutation_id: String.t()
        }

  @id_pattern ~r/^[A-Za-z][A-Za-z0-9_-]*_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  def open(principal, request) do
    ref = make_ref()
    Process.put({__MODULE__, ref}, request["ids"])

    %__MODULE__{
      ref: ref,
      principal: principal,
      client_id: request["clientId"],
      mutation_id: request["mutationId"]
    }
  end

  def close(%__MODULE__{ref: ref}), do: Process.delete({__MODULE__, ref})

  def now(%__MODULE__{}), do: System.system_time(:millisecond)

  def new_id!(%__MODULE__{ref: ref}, prefix) when is_binary(prefix) and prefix != "" do
    case Process.get({__MODULE__, ref}) do
      [id | rest] ->
        Process.put({__MODULE__, ref}, rest)
        validate_id!(id, prefix)

      [] ->
        raise WheelSync.Error,
          code: "id_stream_exhausted",
          message: "The mutation used more ids than the client supplied."

      _ ->
        raise WheelSync.Error,
          code: "invalid_id_stream",
          message: "The mutation id stream is unavailable."
    end
  end

  defp validate_id!(id, prefix) do
    if Regex.match?(@id_pattern, id) && String.starts_with?(id, prefix <> "_") do
      id
    else
      raise WheelSync.Error,
        code: "id_stream_mismatch",
        message: "The next client id does not match the requested prefix."
    end
  end
end
