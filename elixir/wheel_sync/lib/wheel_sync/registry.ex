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

    for {name, query} <- contract.queries do
      for collection <- query["dependsOn"] do
        unless Map.has_key?(contract.collections, collection) do
          raise ArgumentError,
                "query #{inspect(query["name"])} depends on undeclared collection #{inspect(collection)}"
        end
      end

      assert_query_module!(Map.fetch!(queries, name), query)
    end

    %__MODULE__{
      contract: contract,
      queries: queries,
      mutations: mutations,
      authenticator: Keyword.fetch!(options, :authenticator)
    }
  end

  defp assert_query_module!(module, query) do
    sql? = function_exported?(module, :sql, 2)
    run? = function_exported?(module, :run, 2)

    if sql? == run? do
      raise ArgumentError,
            "query handler #{inspect(module)} for #{inspect(query["name"])} must define exactly one of sql/2 or run/2"
    end

    if query["dependsOn"] == [] and not function_exported?(module, :subscribe, 3) do
      raise ArgumentError,
            "query #{inspect(query["name"])} must declare physical dependencies or implement subscribe/3"
    end
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
