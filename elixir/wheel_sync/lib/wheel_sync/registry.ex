defmodule WheelSync.Registry do
  @moduledoc false

  @enforce_keys [:contract, :queries, :mutations, :authenticator]
  defstruct [:contract, :queries, :mutations, :authenticator]

  def build!(options) do
    contract = options |> Keyword.fetch!(:schema_path) |> WheelSync.Contract.load!()
    queries = modules_by_name!(Keyword.get(options, :queries, []), "query")
    mutations = modules_by_name!(Keyword.get(options, :mutations, []), "mutation")

    assert_same_names!(Map.keys(contract.queries), Map.keys(queries), "query")
    assert_same_names!(Map.keys(contract.mutations), Map.keys(mutations), "mutation")

    for {_name, query} <- contract.queries, table <- query["rerunOn"] do
      unless Map.has_key?(contract.tables, table) do
        raise ArgumentError,
              "query #{inspect(query["name"])} reruns on undeclared table #{inspect(table)}"
      end
    end

    %__MODULE__{
      contract: contract,
      queries: queries,
      mutations: mutations,
      authenticator: Keyword.fetch!(options, :authenticator)
    }
  end

  defp modules_by_name!(modules, kind) do
    Enum.reduce(modules, %{}, fn module, result ->
      name = module.name()

      if Map.has_key?(result, name) do
        raise ArgumentError, "duplicate #{kind} handler #{inspect(name)}"
      end

      Map.put(result, name, module)
    end)
  end

  defp assert_same_names!(declared, handled, kind) do
    declared = MapSet.new(declared)
    handled = MapSet.new(handled)
    missing = MapSet.difference(declared, handled) |> MapSet.to_list() |> Enum.sort()
    extra = MapSet.difference(handled, declared) |> MapSet.to_list() |> Enum.sort()

    if missing != [] or extra != [] do
      raise ArgumentError,
            "#{kind} handlers do not match the schema spec; missing=#{inspect(missing)} extra=#{inspect(extra)}"
    end
  end
end
