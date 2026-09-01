defmodule WheelSync.EndpointTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test

  defmodule Runtime do
    use GenServer

    def start_link(config), do: GenServer.start_link(__MODULE__, config)
    def init(config), do: {:ok, config}
    def handle_call(:config, _from, config), do: {:reply, config, config}
  end

  defmodule RejectAuthenticator do
    @behaviour WheelSync.Authenticator

    def authenticate(_conn, _config), do: :error
  end

  test "same-origin checks omit default HTTP and HTTPS ports" do
    {:ok, runtime} = start_supervised({Runtime, config()})

    for {scheme, port} <- [{:http, 80}, {:https, 443}] do
      conn = request(scheme, port, "#{scheme}://example.com")
      assert WheelSync.Endpoint.call(conn, runtime: runtime).status == 401
    end
  end

  test "same-origin checks retain a non-default port" do
    {:ok, runtime} = start_supervised({Runtime, config()})
    conn = request(:https, 4443, "https://example.com:4443")

    assert WheelSync.Endpoint.call(conn, runtime: runtime).status == 401
  end

  test "a different origin is rejected" do
    {:ok, runtime} = start_supervised({Runtime, config()})
    conn = request(:https, 443, "https://other.example.com")

    response = WheelSync.Endpoint.call(conn, runtime: runtime)
    assert response.status == 403
    assert response.resp_body =~ "origin_forbidden"
  end

  test "allowed_origins supports a reverse proxy origin" do
    config = Map.put(config(), :allowed_origins, ["https://app.example.com"])
    {:ok, runtime} = start_supervised({Runtime, config})
    conn = request(:http, 4001, "https://app.example.com")

    assert WheelSync.Endpoint.call(conn, runtime: runtime).status == 401
  end

  defp config do
    %{registry: %{authenticator: RejectAuthenticator}}
  end

  defp request(scheme, port, origin) do
    conn(:get, "/sync/websocket?client=web&protocol=3&version=1&rowSchemaFingerprint=test")
    |> put_req_header("upgrade", "websocket")
    |> put_req_header("origin", origin)
    |> Map.merge(%{scheme: scheme, host: "example.com", port: port})
  end
end
