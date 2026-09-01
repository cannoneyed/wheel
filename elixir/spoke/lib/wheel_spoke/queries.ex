defmodule WheelSpoke.Queries do
  @moduledoc false

  @query_modules [
    {WheelSpoke.Query.ChannelReadsForMember, "channel_reads.forMember"},
    {WheelSpoke.Query.ChannelsForMember, "channels.forMember"},
    {WheelSpoke.Query.MembersAll, "members.all"},
    {WheelSpoke.Query.MessagesByChannel, "messages.byChannel"},
    {WheelSpoke.Query.UnreadCountsForMember, "unread_counts.forMember"}
  ]

  for {module, query_name} <- @query_modules do
    defmodule module do
      @behaviour WheelSync.Query
      @name query_name

      @impl true
      def name, do: @name

      @impl true
      def sql(params, principal), do: WheelSpoke.Queries.sql(@name, params, principal)
    end
  end

  def modules, do: Enum.map(@query_modules, &elem(&1, 0))

  def sql("members.all", _params, principal) do
    {"select id,name from spoke_members where workspace_id=$1 order by name,id",
     [principal.workspace_id]}
  end

  def sql("channels.forMember", _params, principal) do
    {"""
     select c.id,c.name,c.is_private as private,c.created_at as "createdAt"
     from spoke_channels c
     join spoke_channel_members cm on cm.workspace_id=c.workspace_id and cm.channel_id=c.id
     where c.workspace_id=$1 and cm.member_id=$2 order by c.name,c.id
     """, [principal.workspace_id, actor_member(principal.actor)]}
  end

  def sql("messages.byChannel", params, principal) do
    limit = params["limit"] |> trunc() |> max(1) |> min(100)

    {"""
     select m.id,m.channel_id as "channelId",m.author_id as "authorId",m.body,
            m.created_at as "createdAt",m.edited_at as "editedAt"
     from spoke_messages m
     where m.workspace_id=$1 and m.channel_id=$2 and exists (
       select 1 from spoke_channel_members cm
       where cm.workspace_id=m.workspace_id and cm.channel_id=m.channel_id and cm.member_id=$3)
     order by m.created_at,m.id limit $4
     """, [principal.workspace_id, params["channelId"], actor_member(principal.actor), limit]}
  end

  def sql("channel_reads.forMember", _params, principal) do
    {"""
     select channel_id || ':' || member_id as id,channel_id as "channelId",
            member_id as "memberId",last_read_at as "lastReadAt"
     from spoke_channel_reads where workspace_id=$1 and member_id=$2 order by channel_id
     """, [principal.workspace_id, actor_member(principal.actor)]}
  end

  def sql("unread_counts.forMember", _params, principal) do
    member_id = actor_member(principal.actor)

    {"""
     select c.id || ':' || $2 as id,c.id as "channelId",$2::text as "memberId",
            count(m.id) as count
     from spoke_channels c
     join spoke_channel_members cm on cm.workspace_id=c.workspace_id and cm.channel_id=c.id
                                  and cm.member_id=$2
     left join spoke_channel_reads r on r.workspace_id=c.workspace_id and r.channel_id=c.id
                                    and r.member_id=$2
     left join spoke_messages m on m.workspace_id=c.workspace_id and m.channel_id=c.id
                               and m.author_id<>$2 and m.created_at>coalesce(r.last_read_at,0)
     where c.workspace_id=$1 group by c.id order by c.id
     """, [principal.workspace_id, member_id]}
  end

  defp actor_member(actor), do: String.replace_prefix(actor, "user:", "")
end
