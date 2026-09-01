defmodule WheelSpoke.Mutations do
  @moduledoc false

  @mutation_modules [
    {WheelSpoke.Mutation.ChannelCreate, "channel.create"},
    {WheelSpoke.Mutation.ChannelJoin, "channel.join"},
    {WheelSpoke.Mutation.MessageDelete, "message.delete"},
    {WheelSpoke.Mutation.MessageEdit, "message.edit"},
    {WheelSpoke.Mutation.MessageSend, "message.send"},
    {WheelSpoke.Mutation.ReadsMark, "reads.mark"}
  ]

  for {module, mutation_name} <- @mutation_modules do
    defmodule module do
      @behaviour WheelSync.Mutation
      @name mutation_name

      @impl true
      def name, do: @name

      @impl true
      def run(tx, args, ctx), do: WheelSpoke.Mutations.run(@name, tx, args, ctx)
    end
  end

  def modules, do: Enum.map(@mutation_modules, &elem(&1, 0))

  def run("message.send", tx, args, ctx) do
    member_id = require_member!(tx, args["channelId"], ctx.principal.actor)
    body = valid_text!(args["body"], 240, "invalid_message")

    WheelSync.Tx.exec!(
      tx,
      """
      insert into spoke_messages
        (workspace_id,id,channel_id,author_id,body,created_at,edited_at)
      values ($1,$2,$3,$4,$5,$6,null)
      """,
      [
        tx.workspace_id,
        WheelSync.Ctx.new_id!(ctx, "message"),
        args["channelId"],
        member_id,
        body,
        WheelSync.Ctx.now(ctx)
      ]
    )

    touch(tx, ["messages"])
  end

  def run("message.edit", tx, args, ctx) do
    require_author!(tx, args["messageId"], ctx.principal.actor)
    body = valid_text!(args["body"], 240, "invalid_message")

    WheelSync.Tx.exec!(
      tx,
      "update spoke_messages set body=$1,edited_at=$2 where workspace_id=$3 and id=$4",
      [body, WheelSync.Ctx.now(ctx), tx.workspace_id, args["messageId"]]
    )

    touch(tx, ["messages"])
  end

  def run("message.delete", tx, args, ctx) do
    require_author!(tx, args["messageId"], ctx.principal.actor)

    WheelSync.Tx.exec!(
      tx,
      "delete from spoke_messages where workspace_id=$1 and id=$2",
      [tx.workspace_id, args["messageId"]]
    )

    touch(tx, ["messages"])
  end

  def run("channel.create", tx, args, ctx) do
    name = valid_text!(args["name"], 40, "invalid_channel")
    channel_id = WheelSync.Ctx.new_id!(ctx, "channel")
    member_id = actor_member(ctx.principal.actor)

    WheelSync.Tx.exec!(
      tx,
      "insert into spoke_channels values ($1,$2,$3,$4,$5)",
      [tx.workspace_id, channel_id, name, args["private"], WheelSync.Ctx.now(ctx)]
    )

    WheelSync.Tx.exec!(
      tx,
      "insert into spoke_channel_members values ($1,$2,$3)",
      [tx.workspace_id, channel_id, member_id]
    )

    touch(tx, ["channels", "channel_members"])
  end

  def run("channel.join", tx, args, ctx) do
    case one(
           tx,
           "select is_private from spoke_channels where workspace_id=$1 and id=$2",
           [tx.workspace_id, args["channelId"]]
         ) do
      nil -> reject!("missing_channel", "The channel no longer exists.")
      [true] -> reject!("forbidden", "Private channels require an invitation.")
      [false] -> :ok
    end

    WheelSync.Tx.exec!(
      tx,
      """
      insert into spoke_channel_members values ($1,$2,$3)
      on conflict (workspace_id,channel_id,member_id) do nothing
      """,
      [tx.workspace_id, args["channelId"], actor_member(ctx.principal.actor)]
    )

    touch(tx, ["channel_members"])
  end

  def run("reads.mark", tx, args, ctx) do
    member_id = require_member!(tx, args["channelId"], ctx.principal.actor)

    WheelSync.Tx.exec!(
      tx,
      """
      insert into spoke_channel_reads values ($1,$2,$3,$4)
      on conflict (workspace_id,channel_id,member_id)
      do update set last_read_at=excluded.last_read_at
      """,
      [tx.workspace_id, args["channelId"], member_id, WheelSync.Ctx.now(ctx)]
    )

    touch(tx, ["channel_reads"])
  end

  defp require_member!(tx, channel_id, actor) do
    member_id = actor_member(actor)

    case one(
           tx,
           """
           select 1 from spoke_channel_members
           where workspace_id=$1 and channel_id=$2 and member_id=$3
           """,
           [tx.workspace_id, channel_id, member_id]
         ) do
      nil -> reject!("forbidden", "This channel is not visible to you.")
      _row -> member_id
    end
  end

  defp require_author!(tx, message_id, actor) do
    case one(
           tx,
           "select channel_id,author_id from spoke_messages where workspace_id=$1 and id=$2",
           [tx.workspace_id, message_id]
         ) do
      nil ->
        reject!("missing_message", "The message no longer exists.")

      [channel_id, author_id] ->
        member_id = require_member!(tx, channel_id, actor)

        if author_id != member_id,
          do: reject!("forbidden", "Only the author can change this message.")
    end
  end

  defp valid_text!(value, maximum, code) do
    value = String.trim(value)
    if value == "" or String.length(value) > maximum, do: reject!(code, "The value is invalid.")
    value
  end

  defp actor_member(actor), do: String.replace_prefix(actor, "user:", "")

  defp one(tx, sql, params) do
    case WheelSync.Tx.exec!(tx, sql, params).rows do
      [row | _] -> row
      [] -> nil
    end
  end

  defp touch(tx, tables), do: Enum.each(tables, &WheelSync.Tx.touch!(tx, &1))

  defp reject!(code, message), do: raise(WheelSync.Rejection, code: code, message: message)
end
