defmodule WheelSync.Tx do
  @moduledoc false

  @enforce_keys [:connection, :ref, :workspace_id]
  defstruct [:connection, :ref, :workspace_id]

  @type t :: %__MODULE__{connection: pid(), ref: reference(), workspace_id: String.t()}

  def open(connection, workspace_id) do
    tx = %__MODULE__{connection: connection, ref: make_ref(), workspace_id: workspace_id}
    Process.put({__MODULE__, tx.ref}, MapSet.new())
    tx
  end

  def close(%__MODULE__{ref: ref}), do: Process.delete({__MODULE__, ref})

  def touched(%__MODULE__{ref: ref}) do
    Process.get({__MODULE__, ref}, MapSet.new())
  end

  def touch!(%__MODULE__{ref: ref} = tx, table) when is_binary(table) and table != "" do
    Process.put({__MODULE__, ref}, MapSet.put(touched(tx), table))
    :ok
  end

  def exec!(%__MODULE__{connection: connection}, sql, params \\ []) do
    Postgrex.query!(connection, sql, params)
  end

  def query!(tx, sql, params \\ []) do
    tx
    |> exec!(sql, params)
    |> WheelSync.Storage.rows()
  end
end
