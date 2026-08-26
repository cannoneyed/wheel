defmodule WheelTracker.Queries do
  @moduledoc false

  @query_modules [
    {WheelTracker.Query.ActivityByIssue, "activity.byIssue"},
    {WheelTracker.Query.CommentsByIssue, "comments.byIssue"},
    {WheelTracker.Query.CycleStatsByTeam, "cycle_stats.byTeam"},
    {WheelTracker.Query.CyclesByTeam, "cycles.byTeam"},
    {WheelTracker.Query.FavoritesMine, "favorites.mine"},
    {WheelTracker.Query.IssueLabelsByTeam, "issue_labels.byTeam"},
    {WheelTracker.Query.IssueRelationsByTeam, "issue_relations.byTeam"},
    {WheelTracker.Query.IssuesByProject, "issues.byProject"},
    {WheelTracker.Query.IssuesByTeam, "issues.byTeam"},
    {WheelTracker.Query.LabelsForTeam, "labels.forTeam"},
    {WheelTracker.Query.NotificationsInbox, "notifications.inbox"},
    {WheelTracker.Query.ProjectCountsAll, "project_counts.all"},
    {WheelTracker.Query.ProjectsAll, "projects.all"},
    {WheelTracker.Query.ReactionsByIssue, "reactions.byIssue"},
    {WheelTracker.Query.SearchResults, "search_results.results"},
    {WheelTracker.Query.TeamsAll, "teams.all"},
    {WheelTracker.Query.UsersAll, "users.all"},
    {WheelTracker.Query.ViewsByTeam, "views.byTeam"},
    {WheelTracker.Query.WorkflowStatesByTeam, "workflow_states.byTeam"}
  ]

  for {module, query_name} <- @query_modules do
    defmodule module do
      @behaviour WheelSync.Query
      @name query_name

      @impl true
      def name, do: @name

      @impl true
      def sql(params, principal), do: WheelTracker.Queries.sql(@name, params, principal)
    end
  end

  def modules, do: Enum.map(@query_modules, &elem(&1, 0))

  def sql("users.all", _params, principal) do
    {
      "select id, name, initials, avatar_color as \"avatarColor\" from users where workspace_id = $1 order by name",
      [principal.workspace_id]
    }
  end

  def sql("teams.all", _params, principal) do
    {
      """
      select id, name, key, color, icon, cycle_length_weeks as "cycleLengthWeeks",
             estimates_enabled as "estimatesEnabled", position
      from teams where workspace_id = $1 order by position
      """,
      [principal.workspace_id]
    }
  end

  def sql("workflow_states.byTeam", params, principal) do
    {
      """
      select id, team_id as "teamId", name, type, color, position
      from workflow_states where workspace_id = $1 and team_id = $2 order by position
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("issues.byTeam", params, principal),
    do: issues_query("team_id = $2", [principal.workspace_id, params["teamId"]])

  def sql("issues.byProject", params, principal),
    do: issues_query("project_id = $2", [principal.workspace_id, params["projectId"]])

  def sql("issue_relations.byTeam", params, principal) do
    {
      """
      select id, team_id as "teamId", issue_id as "issueId", related_id as "relatedId", kind
      from issue_relations where workspace_id = $1 and team_id = $2 order by id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("labels.forTeam", params, principal) do
    {
      """
      select id, team_id as "teamId", name, color from labels
      where workspace_id = $1 and (team_id = $2 or team_id is null) order by name, id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("issue_labels.byTeam", params, principal) do
    {
      """
      select issue_id as "issueId", label_id as "labelId", team_id as "teamId"
      from issue_labels where workspace_id = $1 and team_id = $2 order by issue_id, label_id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("comments.byIssue", params, principal) do
    {
      """
      select id, issue_id as "issueId", author_id as "authorId", body,
             edited_at as "editedAt", created_at as "createdAt"
      from comments where workspace_id = $1 and issue_id = $2 order by created_at, id
      """,
      [principal.workspace_id, params["issueId"]]
    }
  end

  def sql("reactions.byIssue", params, principal) do
    {
      """
      select comment_id as "commentId", issue_id as "issueId", user_id as "userId", emoji
      from reactions where workspace_id = $1 and issue_id = $2 order by comment_id, user_id, emoji
      """,
      [principal.workspace_id, params["issueId"]]
    }
  end

  def sql("activity.byIssue", params, principal) do
    {
      """
      select id, issue_id as "issueId", kind, actor_id as "actorId", detail,
             created_at as "createdAt"
      from activity where workspace_id = $1 and issue_id = $2
      order by created_at desc, id desc limit 50
      """,
      [principal.workspace_id, params["issueId"]]
    }
  end

  def sql("projects.all", _params, principal) do
    {
      """
      select id, name, description, status_kind as "statusKind", lead_id as "leadId",
             target_date as "targetDate", position
      from projects where workspace_id = $1 order by position, id
      """,
      [principal.workspace_id]
    }
  end

  def sql("project_counts.all", _params, principal) do
    {
      """
      select i.project_id as "projectId", count(*)::bigint as total,
             count(*) filter (where ws.type in ('completed', 'canceled'))::bigint as completed
      from issues i
      join workflow_states ws on ws.workspace_id = i.workspace_id and ws.id = i.state_id
      where i.workspace_id = $1 and i.project_id is not null and i.archived_at is null
      group by i.project_id order by i.project_id
      """,
      [principal.workspace_id]
    }
  end

  def sql("cycles.byTeam", params, principal) do
    {
      """
      select id, team_id as "teamId", number, starts_at as "startsAt", ends_at as "endsAt"
      from cycles where workspace_id = $1 and team_id = $2 order by number desc, id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("cycle_stats.byTeam", params, principal) do
    {
      """
      select c.id as "cycleId", count(i.id)::bigint as scope,
             count(i.id) filter (where ws.type = 'started')::bigint as started,
             count(i.id) filter (where ws.type in ('completed', 'canceled'))::bigint as completed
      from cycles c
      left join issues i on i.workspace_id = c.workspace_id and i.cycle_id = c.id and i.archived_at is null
      left join workflow_states ws on ws.workspace_id = i.workspace_id and ws.id = i.state_id
      where c.workspace_id = $1 and c.team_id = $2 group by c.id order by c.id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("notifications.inbox", params, principal) do
    actor = actor_id(principal)

    {
      """
      select id, user_id as "userId", issue_id as "issueId", kind, actor_id as "actorId",
             detail, read_at as "readAt", created_at as "createdAt"
      from notifications where workspace_id = $1 and user_id = $2 and $2 = $3
      order by created_at desc, id desc limit 100
      """,
      [principal.workspace_id, params["userId"], actor]
    }
  end

  def sql("views.byTeam", params, principal) do
    {
      """
      select id, team_id as "teamId", name, creator_id as "creatorId", filters, display,
             created_at as "createdAt"
      from views where workspace_id = $1 and team_id = $2 order by created_at, id
      """,
      [principal.workspace_id, params["teamId"]]
    }
  end

  def sql("favorites.mine", params, principal) do
    {
      """
      select id, user_id as "userId", kind, target_id as "targetId", position
      from favorites where workspace_id = $1 and user_id = $2 and $2 = $3 order by position, id
      """,
      [principal.workspace_id, params["userId"], actor_id(principal)]
    }
  end

  def sql("search_results.results", params, principal) do
    query = String.trim(params["q"])

    if String.length(query) < 2 do
      {
        "select ''::text as id, ''::text as \"teamId\", ''::text as title, ''::text as source, 0.0::double precision as rank where false",
        []
      }
    else
      {
        """
        with hits as (
          select i.id, i.team_id, i.title, 'issue'::text as source,
                 ts_rank(to_tsvector('simple', i.title || ' ' || i.description), websearch_to_tsquery('simple', $2))::double precision as rank
          from issues i
          where i.workspace_id = $1 and i.archived_at is null
            and to_tsvector('simple', i.title || ' ' || i.description) @@ websearch_to_tsquery('simple', $2)
          union all
          select i.id, i.team_id, i.title, 'comment'::text as source,
                 ts_rank(to_tsvector('simple', c.body), websearch_to_tsquery('simple', $2))::double precision as rank
          from comments c join issues i on i.workspace_id = c.workspace_id and i.id = c.issue_id
          where c.workspace_id = $1 and i.archived_at is null
            and to_tsvector('simple', c.body) @@ websearch_to_tsquery('simple', $2)
        )
        select id, team_id as "teamId", title,
               case when bool_or(source = 'issue') then 'issue' else 'comment' end as source,
               max(rank)::double precision as rank
        from hits group by id, team_id, title order by rank desc, id limit 25
        """,
        [principal.workspace_id, query]
      }
    end
  end

  defp issues_query(predicate, params) do
    {
      """
      select id, team_id as "teamId", number, title, description, state_id as "stateId",
             priority, assignee_id as "assigneeId", creator_id as "creatorId", estimate,
             due_date as "dueDate", parent_id as "parentId", project_id as "projectId",
             cycle_id as "cycleId", sort_order as "sortOrder", board_order as "boardOrder",
             archived_at as "archivedAt", created_at as "createdAt", updated_at as "updatedAt"
      from issues where workspace_id = $1 and #{predicate} order by sort_order, id
      """,
      params
    }
  end

  defp actor_id(principal), do: String.replace_prefix(principal.actor, "user:", "")
end
