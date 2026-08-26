defmodule WheelTracker.Mutations do
  @moduledoc false

  @mutation_modules [
    {WheelTracker.Mutation.CommentCreate, "comments.create"},
    {WheelTracker.Mutation.CommentDelete, "comments.delete"},
    {WheelTracker.Mutation.CommentEdit, "comments.edit"},
    {WheelTracker.Mutation.FavoriteAdd, "favorites.add"},
    {WheelTracker.Mutation.FavoriteRemove, "favorites.remove"},
    {WheelTracker.Mutation.FavoriteReorder, "favorites.reorder"},
    {WheelTracker.Mutation.RelationAdd, "issue_relations.add"},
    {WheelTracker.Mutation.RelationRemove, "issue_relations.remove"},
    {WheelTracker.Mutation.IssueAddLabel, "issues.addLabel"},
    {WheelTracker.Mutation.IssueArchive, "issues.archive"},
    {WheelTracker.Mutation.IssueBulkUpdate, "issues.bulkUpdate"},
    {WheelTracker.Mutation.IssueCreate, "issues.create"},
    {WheelTracker.Mutation.IssueDelete, "issues.delete"},
    {WheelTracker.Mutation.IssueMove, "issues.move"},
    {WheelTracker.Mutation.IssueRemoveLabel, "issues.removeLabel"},
    {WheelTracker.Mutation.IssueReorder, "issues.reorder"},
    {WheelTracker.Mutation.IssueSetParent, "issues.setParent"},
    {WheelTracker.Mutation.IssueUnarchive, "issues.unarchive"},
    {WheelTracker.Mutation.IssueUpdate, "issues.update"},
    {WheelTracker.Mutation.NotificationSetRead, "notifications.setRead"},
    {WheelTracker.Mutation.ProjectCreate, "projects.create"},
    {WheelTracker.Mutation.ProjectDelete, "projects.delete"},
    {WheelTracker.Mutation.ProjectUpdate, "projects.update"},
    {WheelTracker.Mutation.ReactionAdd, "reactions.add"},
    {WheelTracker.Mutation.ReactionRemove, "reactions.remove"},
    {WheelTracker.Mutation.TeamUpdate, "teams.update"},
    {WheelTracker.Mutation.ViewCreate, "views.create"},
    {WheelTracker.Mutation.ViewDelete, "views.delete"}
  ]

  for {module, mutation_name} <- @mutation_modules do
    defmodule module do
      @behaviour WheelSync.Mutation
      @name mutation_name

      @impl true
      def name, do: @name

      @impl true
      def run(tx, args, ctx), do: WheelTracker.Mutations.run(@name, tx, args, ctx)
    end
  end

  def modules, do: Enum.map(@mutation_modules, &elem(&1, 0))

  def run("teams.update", tx, args, _ctx) do
    update_patch(tx, "teams", args["teamId"], args["patch"], %{
      "name" => "name",
      "color" => "color",
      "cycleLengthWeeks" => "cycle_length_weeks",
      "estimatesEnabled" => "estimates_enabled"
    })

    touch(tx, ["teams"])
  end

  def run("issues.create", tx, args, ctx) do
    [[next]] =
      WheelSync.Tx.exec!(
        tx,
        "select coalesce(max(number), 0) + 1 from issues where workspace_id = $1 and team_id = $2",
        [tx.workspace_id, args["teamId"]]
      ).rows

    now = WheelSync.Ctx.now(ctx)

    WheelSync.Tx.exec!(
      tx,
      """
      insert into issues
        (workspace_id, id, team_id, number, title, description, state_id, priority,
         assignee_id, creator_id, estimate, due_date, parent_id, project_id, cycle_id,
         sort_order, board_order, archived_at, created_at, updated_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,null,null,$14,$15,null,$16,$16)
      on conflict (workspace_id, id) do update set title = excluded.title,
        description = excluded.description, state_id = excluded.state_id,
        priority = excluded.priority, assignee_id = excluded.assignee_id,
        updated_at = excluded.updated_at
      """,
      [
        tx.workspace_id,
        args["issueId"],
        args["teamId"],
        next,
        args["title"],
        args["description"],
        args["stateId"],
        args["priority"],
        args["assigneeId"],
        actor_id(ctx),
        args["estimate"],
        args["dueDate"],
        args["parentId"],
        args["sortOrder"],
        args["boardOrder"],
        now
      ]
    )

    for label_id <- args["labelIds"] do
      WheelSync.Tx.exec!(
        tx,
        """
        insert into issue_labels (workspace_id, issue_id, label_id, team_id)
        values ($1,$2,$3,$4) on conflict (workspace_id, issue_id, label_id) do nothing
        """,
        [tx.workspace_id, args["issueId"], label_id, args["teamId"]]
      )
    end

    log_activity(tx, ctx, args["issueId"], "created", "")
    touch(tx, ["issues", "issue_labels", "activity"])
  end

  def run("issues.update", tx, args, ctx) do
    require_active!(tx, args["issueId"])
    apply_issue_patch(tx, args["issueId"], args["patch"], WheelSync.Ctx.now(ctx))

    for {field, kind} <- patch_activity(), Map.has_key?(args["patch"], field) do
      log_activity(tx, ctx, args["issueId"], kind, to_string(args["patch"][field] || ""))
    end

    touch(tx, ["issues", "activity", "notifications"])
  end

  def run("issues.move", tx, args, ctx) do
    require_active!(tx, args["issueId"])

    prior =
      one(tx, "select state_id from issues where workspace_id = $1 and id = $2", [
        tx.workspace_id,
        args["issueId"]
      ])

    WheelSync.Tx.exec!(
      tx,
      """
      update issues set state_id=$1, sort_order=$2, board_order=$3, updated_at=$4
      where workspace_id=$5 and id=$6
      """,
      [
        args["stateId"],
        args["sortOrder"],
        args["boardOrder"],
        WheelSync.Ctx.now(ctx),
        tx.workspace_id,
        args["issueId"]
      ]
    )

    if prior && hd(prior) != args["stateId"] do
      log_activity(tx, ctx, args["issueId"], "status", args["stateId"])
    end

    touch(tx, ["issues", "activity", "notifications"])
  end

  def run("issues.reorder", tx, args, _ctx) do
    require_active!(tx, args["issueId"])
    maybe_update(tx, "issues", args["issueId"], "sort_order", args, "sortOrder")
    maybe_update(tx, "issues", args["issueId"], "board_order", args, "boardOrder")
    touch(tx, ["issues"])
  end

  def run("issues.archive", tx, args, ctx) do
    now = WheelSync.Ctx.now(ctx)

    for issue_id <- args["issueIds"] do
      result =
        WheelSync.Tx.exec!(
          tx,
          """
          update issues set archived_at=$1, updated_at=$1
          where workspace_id=$2 and id=$3 and archived_at is null returning id
          """,
          [now, tx.workspace_id, issue_id]
        )

      if result.num_rows > 0, do: log_activity(tx, ctx, issue_id, "archived", "")
    end

    touch(tx, ["issues", "activity"])
  end

  def run("issues.unarchive", tx, args, ctx) do
    now = WheelSync.Ctx.now(ctx)

    for issue_id <- args["issueIds"] do
      result =
        WheelSync.Tx.exec!(
          tx,
          """
          update issues set archived_at=null, updated_at=$1
          where workspace_id=$2 and id=$3 and archived_at is not null returning id
          """,
          [now, tx.workspace_id, issue_id]
        )

      if result.num_rows > 0, do: log_activity(tx, ctx, issue_id, "unarchived", "")
    end

    touch(tx, ["issues", "activity"])
  end

  def run("issues.delete", tx, args, _ctx) do
    for issue_id <- args["issueIds"] do
      case one(tx, "select archived_at from issues where workspace_id=$1 and id=$2", [
             tx.workspace_id,
             issue_id
           ]) do
        [nil] ->
          reject!("not-archived", "Only archived issues can be permanently deleted.")

        _ ->
          :ok
      end

      WheelSync.Tx.exec!(tx, "delete from issue_labels where workspace_id=$1 and issue_id=$2", [
        tx.workspace_id,
        issue_id
      ])

      WheelSync.Tx.exec!(tx, "delete from issues where workspace_id=$1 and id=$2", [
        tx.workspace_id,
        issue_id
      ])
    end

    touch(tx, ["issues", "issue_labels"])
  end

  def run("issues.bulkUpdate", tx, args, ctx) do
    Enum.each(args["updates"], &require_active!(tx, &1["issueId"]))
    now = WheelSync.Ctx.now(ctx)

    for update <- args["updates"] do
      apply_issue_patch(tx, update["issueId"], update["patch"], now)

      for {field, kind} <- patch_activity(), Map.has_key?(update["patch"], field) do
        log_activity(tx, ctx, update["issueId"], kind, to_string(update["patch"][field] || ""))
      end
    end

    touch(tx, ["issues", "activity", "notifications"])
  end

  def run("issues.setParent", tx, args, ctx) do
    require_active!(tx, args["issueId"])
    validate_parent!(tx, args["issueId"], args["parentId"])

    WheelSync.Tx.exec!(
      tx,
      "update issues set parent_id=$1, updated_at=$2 where workspace_id=$3 and id=$4",
      [args["parentId"], WheelSync.Ctx.now(ctx), tx.workspace_id, args["issueId"]]
    )

    log_activity(tx, ctx, args["issueId"], "parented", args["parentId"] || "")
    touch(tx, ["issues", "activity"])
  end

  def run("issues.addLabel", tx, args, _ctx) do
    require_active!(tx, args["issueId"])

    WheelSync.Tx.exec!(
      tx,
      """
      insert into issue_labels (workspace_id, issue_id, label_id, team_id)
      values ($1,$2,$3,$4) on conflict (workspace_id, issue_id, label_id) do nothing
      """,
      [tx.workspace_id, args["issueId"], args["labelId"], args["teamId"]]
    )

    touch(tx, ["issue_labels"])
  end

  def run("issues.removeLabel", tx, args, _ctx) do
    require_active!(tx, args["issueId"])

    WheelSync.Tx.exec!(
      tx,
      "delete from issue_labels where workspace_id=$1 and issue_id=$2 and label_id=$3",
      [tx.workspace_id, args["issueId"], args["labelId"]]
    )

    touch(tx, ["issue_labels"])
  end

  def run("issue_relations.add", tx, args, ctx) do
    require_active!(tx, args["issueId"])

    WheelSync.Tx.exec!(
      tx,
      """
      insert into issue_relations (workspace_id,id,team_id,issue_id,related_id,kind)
      values ($1,$2,$3,$4,$5,$6) on conflict (workspace_id,id) do nothing
      """,
      [
        tx.workspace_id,
        args["relationId"],
        args["teamId"],
        args["issueId"],
        args["relatedId"],
        args["kind"]
      ]
    )

    log_activity(tx, ctx, args["issueId"], "related", "#{args["kind"]}:#{args["relatedId"]}")
    touch(tx, ["issue_relations", "activity"])
  end

  def run("issue_relations.remove", tx, args, ctx) do
    row =
      one(
        tx,
        "select issue_id,kind,related_id from issue_relations where workspace_id=$1 and id=$2",
        [tx.workspace_id, args["relationId"]]
      )

    WheelSync.Tx.exec!(tx, "delete from issue_relations where workspace_id=$1 and id=$2", [
      tx.workspace_id,
      args["relationId"]
    ])

    if row do
      [issue_id, kind, related_id] = row
      log_activity(tx, ctx, issue_id, "unrelated", "#{kind}:#{related_id}")
    end

    touch(tx, ["issue_relations", "activity"])
  end

  def run("comments.create", tx, args, ctx) do
    created_at = Map.get(args, "createdAt", WheelSync.Ctx.now(ctx))

    WheelSync.Tx.exec!(
      tx,
      """
      insert into comments (workspace_id,id,issue_id,author_id,body,edited_at,created_at)
      values ($1,$2,$3,$4,$5,null,$6)
      on conflict (workspace_id,id) do update set body=excluded.body, edited_at=null
      """,
      [
        tx.workspace_id,
        args["commentId"],
        args["issueId"],
        actor_id(ctx),
        args["body"],
        created_at
      ]
    )

    if not Map.has_key?(args, "createdAt") do
      log_activity(tx, ctx, args["issueId"], "commented", "")
    end

    touch(tx, ["comments", "activity", "notifications"])
  end

  def run("comments.edit", tx, args, ctx) do
    require_comment_author!(tx, args["commentId"], ctx)

    WheelSync.Tx.exec!(
      tx,
      "update comments set body=$1, edited_at=$2 where workspace_id=$3 and id=$4",
      [args["body"], WheelSync.Ctx.now(ctx), tx.workspace_id, args["commentId"]]
    )

    touch(tx, ["comments"])
  end

  def run("comments.delete", tx, args, ctx) do
    require_comment_author!(tx, args["commentId"], ctx)

    WheelSync.Tx.exec!(tx, "delete from reactions where workspace_id=$1 and comment_id=$2", [
      tx.workspace_id,
      args["commentId"]
    ])

    WheelSync.Tx.exec!(tx, "delete from comments where workspace_id=$1 and id=$2", [
      tx.workspace_id,
      args["commentId"]
    ])

    touch(tx, ["comments", "reactions"])
  end

  def run("reactions.add", tx, args, ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into reactions (workspace_id,comment_id,issue_id,user_id,emoji)
      values ($1,$2,$3,$4,$5)
      on conflict (workspace_id,comment_id,user_id,emoji) do nothing
      """,
      [tx.workspace_id, args["commentId"], args["issueId"], actor_id(ctx), args["emoji"]]
    )

    touch(tx, ["reactions"])
  end

  def run("reactions.remove", tx, args, ctx) do
    WheelSync.Tx.exec!(
      tx,
      "delete from reactions where workspace_id=$1 and comment_id=$2 and user_id=$3 and emoji=$4",
      [tx.workspace_id, args["commentId"], actor_id(ctx), args["emoji"]]
    )

    touch(tx, ["reactions"])
  end

  def run("notifications.setRead", tx, args, ctx) do
    for update <- args["updates"] do
      WheelSync.Tx.exec!(
        tx,
        "update notifications set read_at=$1 where workspace_id=$2 and id=$3 and user_id=$4",
        [update["readAt"], tx.workspace_id, update["notificationId"], actor_id(ctx)]
      )
    end

    touch(tx, ["notifications"])
  end

  def run("projects.create", tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into projects (workspace_id,id,name,description,status_kind,lead_id,target_date,position)
      values ($1,$2,$3,$4,'planned',$5,$6,$7)
      on conflict (workspace_id,id) do update set name=excluded.name,
        description=excluded.description,lead_id=excluded.lead_id,target_date=excluded.target_date
      """,
      [
        tx.workspace_id,
        args["projectId"],
        args["name"],
        args["description"],
        args["leadId"],
        args["targetDate"],
        args["position"]
      ]
    )

    touch(tx, ["projects"])
  end

  def run("projects.update", tx, args, _ctx) do
    update_patch(tx, "projects", args["projectId"], args["patch"], %{
      "name" => "name",
      "description" => "description",
      "statusKind" => "status_kind",
      "leadId" => "lead_id",
      "targetDate" => "target_date"
    })

    touch(tx, ["projects"])
  end

  def run("projects.delete", tx, args, _ctx) do
    WheelSync.Tx.exec!(
      tx,
      "update issues set project_id=null where workspace_id=$1 and project_id=$2",
      [
        tx.workspace_id,
        args["projectId"]
      ]
    )

    WheelSync.Tx.exec!(tx, "delete from projects where workspace_id=$1 and id=$2", [
      tx.workspace_id,
      args["projectId"]
    ])

    touch(tx, ["projects", "issues"])
  end

  def run("favorites.add", tx, args, ctx) do
    require_favorite_owner!(tx, args["favoriteId"], ctx)

    WheelSync.Tx.exec!(
      tx,
      """
      insert into favorites (workspace_id,id,user_id,kind,target_id,position)
      values ($1,$2,$3,$4,$5,$6)
      on conflict (workspace_id,id) do update set position=excluded.position
      """,
      [
        tx.workspace_id,
        args["favoriteId"],
        actor_id(ctx),
        args["kind"],
        args["targetId"],
        args["position"]
      ]
    )

    touch(tx, ["favorites"])
  end

  def run(name, tx, args, ctx) when name in ["favorites.remove", "favorites.reorder"] do
    require_favorite_owner!(tx, args["favoriteId"], ctx)

    if name == "favorites.remove" do
      WheelSync.Tx.exec!(tx, "delete from favorites where workspace_id=$1 and id=$2", [
        tx.workspace_id,
        args["favoriteId"]
      ])
    else
      WheelSync.Tx.exec!(
        tx,
        "update favorites set position=$1 where workspace_id=$2 and id=$3",
        [args["position"], tx.workspace_id, args["favoriteId"]]
      )
    end

    touch(tx, ["favorites"])
  end

  def run("views.create", tx, args, ctx) do
    WheelSync.Tx.exec!(
      tx,
      """
      insert into views (workspace_id,id,team_id,name,creator_id,filters,display,created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      on conflict (workspace_id,id) do update set name=excluded.name,
        filters=excluded.filters,display=excluded.display
      """,
      [
        tx.workspace_id,
        args["viewId"],
        args["teamId"],
        args["name"],
        actor_id(ctx),
        args["filters"],
        args["display"],
        Map.get(args, "createdAt", WheelSync.Ctx.now(ctx))
      ]
    )

    touch(tx, ["views"])
  end

  def run("views.delete", tx, args, _ctx) do
    WheelSync.Tx.exec!(tx, "delete from views where workspace_id=$1 and id=$2", [
      tx.workspace_id,
      args["viewId"]
    ])

    touch(tx, ["views"])
  end

  defp require_active!(tx, issue_id) do
    case one(tx, "select archived_at from issues where workspace_id=$1 and id=$2", [
           tx.workspace_id,
           issue_id
         ]) do
      nil -> reject!("missing", "This issue no longer exists.")
      [nil] -> :ok
      _ -> reject!("archived", "This issue is archived — unarchive it first.")
    end
  end

  defp apply_issue_patch(tx, issue_id, patch, now) do
    update_patch(tx, "issues", issue_id, patch, %{
      "title" => "title",
      "description" => "description",
      "stateId" => "state_id",
      "priority" => "priority",
      "assigneeId" => "assignee_id",
      "estimate" => "estimate",
      "dueDate" => "due_date",
      "projectId" => "project_id",
      "cycleId" => "cycle_id"
    })

    WheelSync.Tx.exec!(tx, "update issues set updated_at=$1 where workspace_id=$2 and id=$3", [
      now,
      tx.workspace_id,
      issue_id
    ])
  end

  defp update_patch(tx, table, id, patch, fields) do
    for {field, column} <- fields, Map.has_key?(patch, field) do
      WheelSync.Tx.exec!(
        tx,
        "update #{table} set #{column}=$1 where workspace_id=$2 and id=$3",
        [patch[field], tx.workspace_id, id]
      )
    end
  end

  defp maybe_update(tx, table, id, column, args, field) do
    if Map.has_key?(args, field) do
      WheelSync.Tx.exec!(
        tx,
        "update #{table} set #{column}=$1 where workspace_id=$2 and id=$3",
        [args[field], tx.workspace_id, id]
      )
    end
  end

  defp validate_parent!(_tx, _issue_id, nil), do: :ok

  defp validate_parent!(tx, issue_id, parent_id) do
    if issue_id == parent_id, do: reject!("cycle", "An issue cannot be its own parent.")

    child =
      one(tx, "select team_id from issues where workspace_id=$1 and id=$2", [
        tx.workspace_id,
        issue_id
      ])

    parent =
      one(tx, "select team_id from issues where workspace_id=$1 and id=$2", [
        tx.workspace_id,
        parent_id
      ])

    if parent == nil, do: reject!("missing", "The parent issue no longer exists.")

    if child != nil and child != parent,
      do: reject!("team", "Sub-issues must belong to one team.")

    walk_parent!(tx, issue_id, parent_id)
  end

  defp walk_parent!(_tx, _issue_id, nil), do: :ok

  defp walk_parent!(tx, issue_id, cursor) do
    case one(tx, "select parent_id from issues where workspace_id=$1 and id=$2", [
           tx.workspace_id,
           cursor
         ]) do
      [^issue_id] -> reject!("cycle", "That parent is already a sub-issue of this issue.")
      [next] -> walk_parent!(tx, issue_id, next)
      nil -> :ok
    end
  end

  defp require_comment_author!(tx, comment_id, ctx) do
    actor = actor_id(ctx)

    case one(tx, "select author_id from comments where workspace_id=$1 and id=$2", [
           tx.workspace_id,
           comment_id
         ]) do
      nil -> reject!("missing", "This comment no longer exists.")
      [author] when author == actor -> :ok
      _ -> reject!("forbidden", "Only the comment author can change it.")
    end
  end

  defp require_favorite_owner!(tx, favorite_id, ctx) do
    actor = actor_id(ctx)

    case one(tx, "select user_id from favorites where workspace_id=$1 and id=$2", [
           tx.workspace_id,
           favorite_id
         ]) do
      nil -> :ok
      [owner] when owner == actor -> :ok
      _ -> reject!("forbidden", "Favorite belongs to another user.")
    end
  end

  defp log_activity(tx, ctx, issue_id, kind, detail) do
    suffix = ctx.mutation_id |> String.replace_prefix("m_", "")
    tail = String.slice(issue_id, max(String.length(issue_id) - 8, 0), 8)
    id = "activity_#{suffix}:#{tail}:#{kind}"

    WheelSync.Tx.exec!(
      tx,
      """
      insert into activity (workspace_id,id,issue_id,kind,actor_id,detail,created_at)
      values ($1,$2,$3,$4,$5,$6,$7) on conflict (workspace_id,id) do nothing
      """,
      [tx.workspace_id, id, issue_id, kind, actor_id(ctx), detail, WheelSync.Ctx.now(ctx)]
    )
  end

  defp one(tx, sql, params) do
    case WheelSync.Tx.exec!(tx, sql, params).rows do
      [row | _] -> row
      [] -> nil
    end
  end

  defp touch(tx, tables) do
    Enum.each(tables, &WheelSync.Tx.touch!(tx, &1))
    :ok
  end

  defp actor_id(ctx), do: String.replace_prefix(ctx.principal.actor, "user:", "")

  defp reject!(code, message), do: raise(WheelSync.Rejection, code: code, message: message)

  defp patch_activity do
    [
      {"title", "renamed"},
      {"description", "description"},
      {"stateId", "status"},
      {"priority", "priority"},
      {"assigneeId", "assignee"},
      {"estimate", "estimate"},
      {"dueDate", "due-date"},
      {"projectId", "project"},
      {"cycleId", "cycle"}
    ]
  end
end
