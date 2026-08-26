defmodule WheelTracker.Schema do
  @moduledoc false

  @workspace "workspace_id text not null default current_setting('wheel.workspace_id')"

  def statements do
    [
      """
      create table if not exists users (
        #{@workspace}, id text not null, name text not null, initials text not null,
        avatar_color text not null, primary key (workspace_id, id))
      """,
      """
      create table if not exists teams (
        #{@workspace}, id text not null, name text not null, key text not null,
        color text not null, icon text not null, cycle_length_weeks integer not null default 2,
        estimates_enabled boolean not null default true, position double precision not null default 0,
        primary key (workspace_id, id), unique (workspace_id, key))
      """,
      """
      create table if not exists workflow_states (
        #{@workspace}, id text not null, team_id text not null, name text not null,
        type text not null, color text not null, position double precision not null default 0,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists issues (
        #{@workspace}, id text not null, team_id text not null, number integer not null default 0,
        title text not null, description text not null default '', state_id text not null,
        priority integer not null default 0, assignee_id text, creator_id text not null,
        estimate integer, due_date text, parent_id text, project_id text, cycle_id text,
        sort_order double precision not null default 0, board_order double precision not null default 0,
        archived_at bigint, created_at bigint not null, updated_at bigint not null,
        primary key (workspace_id, id))
      """,
      "create index if not exists tracker_issues_team_idx on issues (workspace_id, team_id)",
      """
      create table if not exists issue_relations (
        #{@workspace}, id text not null, team_id text not null, issue_id text not null,
        related_id text not null, kind text not null, primary key (workspace_id, id))
      """,
      """
      create table if not exists labels (
        #{@workspace}, id text not null, team_id text, name text not null, color text not null,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists issue_labels (
        #{@workspace}, issue_id text not null, label_id text not null, team_id text not null,
        primary key (workspace_id, issue_id, label_id))
      """,
      """
      create table if not exists comments (
        #{@workspace}, id text not null, issue_id text not null, author_id text not null,
        body text not null, edited_at bigint, created_at bigint not null,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists reactions (
        #{@workspace}, comment_id text not null, issue_id text not null, user_id text not null,
        emoji text not null, primary key (workspace_id, comment_id, user_id, emoji))
      """,
      """
      create table if not exists activity (
        #{@workspace}, id text not null, issue_id text not null, kind text not null,
        actor_id text not null, detail text not null default '', created_at bigint not null,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists projects (
        #{@workspace}, id text not null, name text not null, description text not null default '',
        status_kind text not null default 'planned', lead_id text, target_date text,
        position double precision not null default 0, primary key (workspace_id, id))
      """,
      """
      create table if not exists cycles (
        #{@workspace}, id text not null, team_id text not null, number integer not null,
        starts_at bigint not null, ends_at bigint not null, primary key (workspace_id, id))
      """,
      """
      create table if not exists notifications (
        #{@workspace}, id text not null, user_id text not null, issue_id text not null,
        kind text not null, actor_id text not null, detail text not null default '',
        read_at bigint, created_at bigint not null, primary key (workspace_id, id))
      """,
      """
      create table if not exists views (
        #{@workspace}, id text not null, team_id text not null, name text not null,
        creator_id text not null, filters text not null, display text not null,
        created_at bigint not null, primary key (workspace_id, id))
      """,
      """
      create table if not exists favorites (
        #{@workspace}, id text not null, user_id text not null, kind text not null,
        target_id text not null, position double precision not null default 0,
        primary key (workspace_id, id))
      """
    ]
  end
end
