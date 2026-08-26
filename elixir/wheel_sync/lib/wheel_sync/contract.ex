defmodule WheelSync.Contract do
  @moduledoc false

  def load!(path) do
    spec = path |> File.read!() |> Jason.decode!()

    unless spec["schemaSpecVersion"] == 1 do
      raise ArgumentError, "unsupported wheel schema spec version"
    end

    unless spec["protocolVersion"] == WheelSync.protocol_version() do
      raise ArgumentError, "schema spec protocol version does not match the server"
    end

    %{
      tables:
        index(spec["tables"], fn table ->
          Map.put(table, "validator", JSV.build!(table["jsonSchema"], warnings: :silent))
        end),
      queries:
        index(spec["queries"], fn query ->
          Map.put(query, "validator", JSV.build!(query["paramsSchema"], warnings: :silent))
        end),
      mutations:
        index(spec["mutations"], fn mutation ->
          Map.put(mutation, "validator", JSV.build!(mutation["argsSchema"], warnings: :silent))
        end),
      presence:
        case spec["presence"] do
          nil ->
            nil

          presence ->
            Map.put(presence, "validator", JSV.build!(presence["stateSchema"], warnings: :silent))
        end
    }
  end

  def validate(root, value) do
    case JSV.validate(value, root, cast: false) do
      {:ok, ^value} -> :ok
      {:ok, _cast} -> {:error, :changed}
      {:error, error} -> {:error, error}
    end
  end

  defp index(entries, transform) do
    Map.new(entries, fn entry -> {entry["name"], transform.(entry)} end)
  end
end
