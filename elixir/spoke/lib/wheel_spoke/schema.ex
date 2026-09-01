defmodule WheelSpoke.Schema do
  @moduledoc false

  def statements do
    [
      """
      create table if not exists spoke_members (
        workspace_id text not null, id text not null, name text not null,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists spoke_channels (
        workspace_id text not null, id text not null, name text not null,
        is_private boolean not null, created_at bigint not null,
        primary key (workspace_id, id))
      """,
      """
      create table if not exists spoke_channel_members (
        workspace_id text not null, channel_id text not null, member_id text not null,
        primary key (workspace_id, channel_id, member_id))
      """,
      """
      create table if not exists spoke_messages (
        workspace_id text not null, id text not null, channel_id text not null,
        author_id text not null, body text not null, created_at bigint not null,
        edited_at bigint, primary key (workspace_id, id))
      """,
      """
      create table if not exists spoke_channel_reads (
        workspace_id text not null, channel_id text not null, member_id text not null,
        last_read_at bigint not null,
        primary key (workspace_id, channel_id, member_id))
      """
    ]
  end
end
