defmodule WheelTracker.ConcurrentMutationsTest do
  use ExUnit.Case, async: false
  @moduletag :postgres

  setup do
    options = WheelSync.PostgresOptions.from_url!(System.fetch_env!("DATABASE_URL"))
    db = start_supervised!({Postgrex, options ++ [pool_size: 4]})
    WheelSync.Storage.ensure_schema!(db, WheelTracker.Schema.statements())
    workspace = "tracker-concurrent-#{System.unique_integer([:positive])}"

    Postgrex.query!(
      db,
      "insert into teams(workspace_id,id,name,key,color,icon) values($1,'team','Team','TEAM','blue','team')",
      [workspace]
    )

    on_exit(fn ->
      {:ok, conn} = Postgrex.start_link(options)

      for table <- ["activity", "issue_labels", "issues", "teams", "favorites"] do
        Postgrex.query!(conn, "delete from #{table} where workspace_id=$1", [workspace])
      end

      GenServer.stop(conn)
    end)

    %{db: db, workspace: workspace}
  end

  test "concurrent creates allocate different numbers", context do
    parent = self()

    first =
      Task.async(fn ->
        transaction(context, fn tx, ctx ->
          :ok = WheelTracker.Mutations.run("issues.create", tx, create("a"), ctx)
          gate(parent)
        end)
      end)

    assert_receive {:held, worker}

    second =
      Task.async(fn ->
        transaction(context, &WheelTracker.Mutations.run("issues.create", &1, create("b"), &2))
      end)

    wait_for_lock(context.db)
    send(worker, :release)
    assert {:ok, :ok} = Task.await(first)
    assert {:ok, :ok} = Task.await(second)

    assert [[1], [2]] =
             Postgrex.query!(
               context.db,
               "select number from issues where workspace_id=$1 order by number",
               [context.workspace]
             ).rows
  end

  test "opposing parent changes cannot create a cycle", context do
    for id <- ["a", "b"] do
      assert {:ok, :ok} =
               transaction(
                 context,
                 &WheelTracker.Mutations.run("issues.create", &1, create(id), &2)
               )
    end

    parent = self()

    first =
      Task.async(fn ->
        transaction(context, fn tx, ctx ->
          :ok =
            WheelTracker.Mutations.run(
              "issues.setParent",
              tx,
              %{"issueId" => "a", "parentId" => "b"},
              ctx
            )

          gate(parent)
        end)
      end)

    assert_receive {:held, worker}

    second =
      Task.async(fn ->
        transaction(
          context,
          &WheelTracker.Mutations.run(
            "issues.setParent",
            &1,
            %{"issueId" => "b", "parentId" => "a"},
            &2
          )
        )
      end)

    wait_for_lock(context.db)
    send(worker, :release)
    assert {:ok, :ok} = Task.await(first)
    assert {:error, "cycle"} = Task.await(second)

    assert [["a", "b"], ["b", nil]] =
             Postgrex.query!(
               context.db,
               "select id,parent_id from issues where workspace_id=$1 order by id",
               [context.workspace]
             ).rows
  end

  test "a concurrent archive is observed before an edit", context do
    transaction(context, &WheelTracker.Mutations.run("issues.create", &1, create("a"), &2))
    parent = self()

    first =
      Task.async(fn ->
        transaction(context, fn tx, ctx ->
          :ok = WheelTracker.Mutations.run("issues.archive", tx, %{"issueIds" => ["a"]}, ctx)
          gate(parent)
        end)
      end)

    assert_receive {:held, worker}

    second =
      Task.async(fn ->
        transaction(
          context,
          &WheelTracker.Mutations.run(
            "issues.update",
            &1,
            %{"issueId" => "a", "patch" => %{"title" => "changed"}},
            &2
          )
        )
      end)

    wait_for_lock(context.db)
    send(worker, :release)
    assert {:ok, :ok} = Task.await(first)
    assert {:error, "archived"} = Task.await(second)
  end

  defp transaction(context, callback) do
    Postgrex.transaction(context.db, fn conn ->
      tx = WheelSync.Tx.open(conn, context.workspace)

      principal = %WheelSync.Principal{
        workspace_id: context.workspace,
        actor: "user:test",
        session_id: "test"
      }

      ctx =
        WheelSync.Ctx.open(principal, %{
          "ids" => [],
          "clientId" => "test",
          "mutationId" => "m_#{System.unique_integer([:positive])}"
        })

      try do
        callback.(tx, ctx)
      rescue
        error in WheelSync.Rejection -> Postgrex.rollback(conn, error.code)
      after
        WheelSync.Tx.close(tx)
        WheelSync.Ctx.close(ctx)
      end
    end)
  end

  defp create(id),
    do: %{
      "issueId" => id,
      "teamId" => "team",
      "title" => id,
      "description" => "",
      "stateId" => "state",
      "priority" => 0,
      "sortOrder" => 0,
      "boardOrder" => 0,
      "labelIds" => []
    }

  defp gate(parent) do
    send(parent, {:held, self()})

    receive do
      :release -> :ok
    after
      5_000 -> raise "test did not release transaction"
    end
  end

  defp wait_for_lock(db, attempts \\ 200)
  defp wait_for_lock(_db, 0), do: flunk("transaction did not acquire its conflict lock")

  defp wait_for_lock(db, attempts) do
    [[count]] =
      Postgrex.query!(
        db,
        "select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock'",
        []
      ).rows

    if count == 0 do
      Process.sleep(5)
      wait_for_lock(db, attempts - 1)
    end
  end
end
