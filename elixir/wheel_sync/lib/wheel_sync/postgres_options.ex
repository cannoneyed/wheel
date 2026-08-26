defmodule WheelSync.PostgresOptions do
  @moduledoc false

  @ssl_modes ~w(require verify-ca verify-full)

  def from_url!(database_url) when is_binary(database_url) do
    uri = URI.parse(database_url)

    unless uri.scheme in ["postgres", "postgresql"] and is_binary(uri.host) do
      raise ArgumentError, "database_url must be a postgres:// or postgresql:// URL"
    end

    database = uri.path |> to_string() |> String.trim_leading("/") |> URI.decode()

    if database == "" do
      raise ArgumentError, "database_url must include a database name"
    end

    {username, password} = credentials(uri.userinfo)
    query = URI.decode_query(uri.query || "")

    [
      hostname: uri.host,
      port: uri.port || 5432,
      database: database
    ]
    |> put_if(:username, username)
    |> put_if(:password, password)
    |> put_ssl(query)
  end

  def from_url!(_database_url) do
    raise ArgumentError, "database_url must be a postgres:// or postgresql:// URL"
  end

  defp credentials(nil), do: {nil, nil}

  defp credentials(userinfo) do
    case String.split(userinfo, ":", parts: 2) do
      [username, password] -> {URI.decode(username), URI.decode(password)}
      [username] -> {URI.decode(username), nil}
    end
  end

  defp put_if(options, _key, nil), do: options
  defp put_if(options, key, value), do: Keyword.put(options, key, value)

  defp put_ssl(options, %{"ssl" => "true"}), do: Keyword.put(options, :ssl, true)

  defp put_ssl(options, %{"sslmode" => mode}) when mode in @ssl_modes,
    do: Keyword.put(options, :ssl, true)

  defp put_ssl(options, _query), do: options
end
