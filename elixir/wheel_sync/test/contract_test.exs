defmodule WheelSync.Test.QueryWithBothPaths do
  @behaviour WheelSync.Query

  def name, do: "widgets.all"
  def sql(_params, _principal), do: {"select 1", []}
  def run(_params, _principal), do: []
end

defmodule WheelSync.Test.QueryWithNoPath do
  @behaviour WheelSync.Query

  def name, do: "widgets.all"
end

defmodule WheelSync.Test.SourceWithoutSubscription do
  @behaviour WheelSync.Query

  def name, do: "source_widgets.all"
  def run(_params, _principal), do: []
end

defmodule WheelSync.ContractTest do
  use ExUnit.Case, async: true

  test "loads the generated wire contract and rejects extra fields" do
    registry = WheelSync.Registry.build!(registry_options())

    create = registry.contract.mutations["widgets.create"]["validator"]

    assert :ok =
             WheelSync.Contract.validate(create, %{
               "title" => "Alpha",
               "position" => 1.25,
               "active" => true,
               "note" => nil
             })

    assert {:error, _} =
             WheelSync.Contract.validate(create, %{
               "title" => "Alpha",
               "position" => 1.25,
               "active" => true,
               "note" => nil,
               "extra" => true
             })
  end

  test "query handlers define one execution path and one invalidation source" do
    for module <- [WheelSync.Test.QueryWithBothPaths, WheelSync.Test.QueryWithNoPath] do
      assert_raise ArgumentError, ~r/exactly one of sql\/2 or run\/2/, fn ->
        WheelSync.Registry.build!(registry_options([module, WheelSync.Test.SourceWidgetsAll]))
      end
    end

    assert_raise ArgumentError, ~r/dependsOn tables or implement subscribe\/3/, fn ->
      WheelSync.Registry.build!(
        registry_options([WheelSync.Test.WidgetsAll, WheelSync.Test.SourceWithoutSubscription])
      )
    end
  end

  test "the id stream preserves order and checks its prefix" do
    principal = %WheelSync.Principal{actor: "a", workspace_id: "w", session_id: "s"}

    ctx =
      WheelSync.Ctx.open(principal, %{
        "clientId" => "c",
        "mutationId" => "m_0190b62e-0000-7000-8000-000000000001",
        "ids" => ["widget_0190b62e-0000-7000-8000-000000000001"]
      })

    assert WheelSync.Ctx.new_id!(ctx, "widget") ==
             "widget_0190b62e-0000-7000-8000-000000000001"

    assert_raise WheelSync.Error, ~r/more ids/, fn ->
      WheelSync.Ctx.new_id!(ctx, "widget")
    end

    WheelSync.Ctx.close(ctx)
  end

  defp registry_options(queries \\ [WheelSync.Test.WidgetsAll, WheelSync.Test.SourceWidgetsAll]) do
    [
      schema_path: Path.expand("../../../test/wire/fixtures/schema.json", __DIR__),
      authenticator: WheelSync.Test.WireAuthenticator,
      queries: queries,
      mutations: [
        WheelSync.Test.WidgetCreate,
        WheelSync.Test.WidgetMove,
        WheelSync.Test.WidgetReorder,
        WheelSync.Test.WidgetTouch,
        WheelSync.Test.WidgetBreakQuery,
        WheelSync.Test.WidgetRecoverQuery,
        WheelSync.Test.SystemNoop,
        WheelSync.Test.WidgetDelete,
        WheelSync.Test.WidgetPair,
        WheelSync.Test.WidgetReject,
        WheelSync.Test.WidgetFail
      ]
    ]
  end
end
