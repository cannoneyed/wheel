# Wheel Sync

`wheel_sync` serves Wheel protocol v3 over WebSocket with Elixir and PostgreSQL.

## Install

Add the exact version to your dependencies:

```elixir
defp deps do
  [
    {:wheel_sync, "0.2.1"}
  ]
end
```

Start `WheelSync` under your application supervisor. The [Elixir backend guide](https://github.com/cannoneyed/wheel/blob/main/elixir/README.md) documents configuration, authentication, queries, mutations, and external writes.
