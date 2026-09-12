defmodule WheelSync.Storage do
  @moduledoc false

  @change_channel "wheel_sync_changes"

  @core_schema [
    """
    create table if not exists wheel_sync_workspaces (
      workspace_id text primary key,
      last_seq bigint not null default 0 check (last_seq >= 0)
    )
    """,
    """
    create table if not exists wheel_sync_log (
      workspace_id text not null,
      seq bigint not null,
      mutation_id text not null,
      name text not null,
      touched text[] not null,
      actor text not null,
      client_id text not null,
      committed_at timestamptz not null default now(),
      primary key (workspace_id, seq),
      unique (workspace_id, mutation_id),
      foreign key (workspace_id) references wheel_sync_workspaces(workspace_id) on delete cascade
    )
    """
  ]

  # Postgrex checks SQL equality and closes/replaces colliding named statements.
  # Fixed slots bound both driver and server plans without another cache process.
  def query!(connection, sql, params \\ [], options \\ []) do
    sql = IO.iodata_to_binary(sql)
    name = "wheel_#{:erlang.phash2(sql, 256)}"
    Postgrex.query!(connection, sql, params, Keyword.put(options, :cache_statement, name))
  end

  def ensure_schema!(postgres, statements) do
    Enum.each(@core_schema ++ statements, &Postgrex.query!(postgres, &1, []))
  end

  def current_seq(postgres, workspace_id) do
    case query!(
           postgres,
           "select last_seq from wheel_sync_workspaces where workspace_id = $1",
           [workspace_id]
         ).rows do
      [[seq]] -> seq
      [] -> 0
    end
  end

  def changes_after(postgres, workspace_id, seq) do
    query!(
      postgres,
      """
      select seq, name, touched, client_id
      from wheel_sync_log
      where workspace_id = $1 and seq > $2
      order by seq
      limit 256
      """,
      [workspace_id, seq]
    ).rows
    |> Enum.map(fn [next_seq, name, touched, client_id] ->
      %{seq: next_seq, name: name, touched: touched, client_id: client_id}
    end)
  end

  def lock!(connection, workspace_id, namespace, key) do
    # Stable across nodes, with length framing and a distinct namespace. A hash
    # collision only serializes unrelated commands; the log checks the full ID.
    <<key::signed-64, _::binary>> =
      :crypto.hash(:sha256, :erlang.term_to_binary({namespace, workspace_id, key}))

    query!(connection, "select pg_advisory_xact_lock($1)", [key])
  end

  def find_committed(connection, workspace_id, mutation_id) do
    case query!(
           connection,
           "select seq from wheel_sync_log where workspace_id = $1 and mutation_id = $2",
           [workspace_id, mutation_id]
         ).rows do
      [[seq]] -> {:ok, seq}
      [] -> :missing
    end
  end

  def next_seq!(connection, workspace_id) do
    started = System.monotonic_time()

    query!(
      connection,
      "insert into wheel_sync_workspaces (workspace_id) values ($1) on conflict do nothing",
      [workspace_id]
    )

    [[seq]] =
      query!(
        connection,
        "update wheel_sync_workspaces set last_seq = last_seq + 1 where workspace_id = $1 returning last_seq",
        [workspace_id]
      ).rows

    :telemetry.execute(
      [:wheel_sync, :write, :sequence],
      %{duration: System.monotonic_time() - started},
      %{workspace_id: workspace_id}
    )

    seq
  end

  def append_log!(connection, workspace_id, seq, entry) do
    query!(
      connection,
      """
      insert into wheel_sync_log
        (workspace_id, seq, mutation_id, name, touched, actor, client_id)
      values ($1, $2, $3, $4, $5, $6, $7)
      """,
      [
        workspace_id,
        seq,
        entry.mutation_id,
        entry.name,
        entry.touched |> MapSet.to_list() |> Enum.sort(),
        entry.actor,
        entry.client_id
      ]
    )

    # PostgreSQL delivers this only after the surrounding transaction commits.
    query!(connection, "select pg_notify($1, $2)", [
      @change_channel,
      notification_key(workspace_id)
    ])
  end

  def change_channel, do: @change_channel

  def notification_key(workspace_id) do
    :sha256
    |> :crypto.hash(workspace_id)
    |> Base.url_encode64(padding: false)
  end

  def rows(%Postgrex.Result{columns: columns, rows: rows}) when is_list(columns) do
    Enum.map(rows, fn values ->
      columns
      |> Enum.zip(values)
      |> Map.new(fn {column, value} -> {column, json_value!(value)} end)
    end)
  end

  def rows(%Postgrex.Result{columns: nil}), do: []

  def json_value!(nil), do: nil
  def json_value!(value) when is_binary(value) or is_boolean(value), do: value
  def json_value!(value) when is_integer(value), do: value

  def json_value!(value)
      when is_float(value) and value == value and value <= 1.7976931348623157e308 and
             value >= -1.7976931348623157e308,
      do: value

  def json_value!(%Decimal{} = value), do: Decimal.to_float(value)
  def json_value!(value) when is_list(value), do: Enum.map(value, &json_value!/1)

  def json_value!(value) when is_map(value) and not is_struct(value) do
    Map.new(value, fn {key, child} when is_binary(key) -> {key, json_value!(child)} end)
  end

  def json_value!(value) do
    raise WheelSync.Error,
      code: "invalid_json_value",
      message: "Postgres returned a value outside the JSON value domain: #{inspect(value)}"
  end
end
