defmodule WheelSpoke.Presence do
  @moduledoc false

  def visible?(sender, recipient, %{"channelId" => channel_id}) do
    if sender.workspace_id != recipient.workspace_id do
      false
    else
      sender_id = actor_member(sender.actor)
      recipient_id = actor_member(recipient.actor)

      [[count]] =
        Postgrex.query!(
          WheelSpoke.Sync.Postgres,
          """
          select count(*) from spoke_channel_members
          where workspace_id=$1 and channel_id=$2 and member_id=any($3)
          """,
          [sender.workspace_id, channel_id, Enum.uniq([sender_id, recipient_id])]
        ).rows

      count == length(Enum.uniq([sender_id, recipient_id]))
    end
  end

  def visible?(_sender, _recipient, _presence), do: false

  defp actor_member(actor), do: String.replace_prefix(actor, "user:", "")
end
