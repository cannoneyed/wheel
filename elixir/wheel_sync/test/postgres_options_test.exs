defmodule WheelSync.PostgresOptionsTest do
  use ExUnit.Case, async: true

  test "parses a database URL into Postgrex 0.22 options" do
    assert WheelSync.PostgresOptions.from_url!(
             "postgres://wheel:p%40ss@db.example.test:5544/sync%20data?sslmode=require"
           ) == [
             ssl: true,
             password: "p@ss",
             username: "wheel",
             hostname: "db.example.test",
             port: 5544,
             database: "sync data"
           ]
  end

  test "rejects URLs without a Postgres scheme or database" do
    assert_raise ArgumentError, fn ->
      WheelSync.PostgresOptions.from_url!("https://db.example.test/sync")
    end

    assert_raise ArgumentError, fn ->
      WheelSync.PostgresOptions.from_url!("postgres://db.example.test")
    end
  end
end
