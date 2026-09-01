import { collection, mutation, orphan, presence, query, t, type Infer } from 'wheel/sync';

/** One member in the current workspace. */
export const MemberRow = t.object({
  id: t.string(),
  name: t.string()
});

/** One public or private channel visible to the current principal. */
export const ChannelRow = t.object({
  id: t.string(),
  name: t.string(),
  private: t.boolean(),
  createdAt: t.number()
});

/** One ordered channel message. */
export const MessageRow = t.object({
  id: t.string(),
  channelId: t.string(),
  authorId: t.string(),
  body: t.string(),
  createdAt: t.number(),
  editedAt: t.number().nullable()
});

/** The current principal's read marker for one channel. */
export const ChannelReadRow = t.object({
  id: t.string(),
  channelId: t.string(),
  memberId: t.string(),
  lastReadAt: t.number()
});

/** Internal join-table shape used only for dependency invalidation. */
export const ChannelMemberRow = t.object({
  channelId: t.string(),
  memberId: t.string()
});

/** Derived unread messages for one visible channel. */
export const UnreadCountRow = t.object({
  id: t.string(),
  channelId: t.string(),
  memberId: t.string(),
  count: t.number()
});

export const members = collection({ name: 'members', type: MemberRow, key: (row) => row.id });
export const channels = collection({ name: 'channels', type: ChannelRow, key: (row) => row.id });
export const messages = collection({ name: 'messages', type: MessageRow, key: (row) => row.id });
export const channelReads = collection({ name: 'channel_reads', type: ChannelReadRow, key: (row) => row.id });
export const channelMembers = collection({
  name: 'channel_members',
  type: ChannelMemberRow,
  key: (row) => `${row.channelId}:${row.memberId}`,
  keySpec: { fields: ['channelId', 'memberId'] }
});
export const unreadCounts = collection({ name: 'unread_counts', type: UnreadCountRow, key: (row) => row.id });

export const membersAll = query({
  name: 'members.all',
  params: t.object({}),
  into: members,
  projection: {
    filter: () => true,
    sort: (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  }
});

export const channelsForMember = query({
  name: 'channels.forMember',
  params: t.object({}),
  into: channels,
  dependsOn: ['channels', 'channel_members'],
  projection: {
    filter: () => true,
    sort: (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  }
});

export const messagesByChannel = query({
  name: 'messages.byChannel',
  params: t.object({ channelId: t.string(), limit: t.number() }),
  into: messages,
  dependsOn: ['messages', 'channel_members'],
  projection: {
    filter: (row, params) => row.channelId === params.channelId,
    sort: (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)
  }
});

export const readsForMember = query({
  name: 'channel_reads.forMember',
  params: t.object({}),
  into: channelReads
});

export const unreadForMember = query({
  name: 'unread_counts.forMember',
  params: t.object({}),
  into: unreadCounts,
  dependsOn: ['messages', 'channel_reads', 'channel_members']
});

export const spokePresence = presence({
  name: 'spoke',
  state: t.object({ channelId: t.string(), typing: t.boolean() })
});

export const messageSend = mutation({
  name: 'message.send',
  args: t.object({ channelId: t.string(), body: t.string() }),
  optimistic: (cache, args, context) => {
    if (!cache.get(channels, args.channelId)) throw orphan(`channel ${args.channelId} is unavailable`);
    cache.put(messages, {
      id: context.newId('message'),
      channelId: args.channelId,
      authorId: context.actor.replace(/^user:/, ''),
      body: args.body,
      createdAt: context.now(),
      editedAt: null
    });
  }
});

export const messageEdit = mutation({
  name: 'message.edit',
  args: t.object({ messageId: t.string(), body: t.string() }),
  optimistic: (cache, args, context) => {
    if (!cache.get(messages, args.messageId)) throw orphan(`message ${args.messageId} is unavailable`);
    cache.update(messages, args.messageId, { body: args.body, editedAt: context.now() });
  }
});

export const messageDelete = mutation({
  name: 'message.delete',
  args: t.object({ messageId: t.string() }),
  optimistic: (cache, args) => {
    if (!cache.get(messages, args.messageId)) throw orphan(`message ${args.messageId} is unavailable`);
    cache.delete(messages, args.messageId);
  }
});

export const channelCreate = mutation({
  name: 'channel.create',
  args: t.object({ name: t.string(), private: t.boolean() }),
  optimistic: (cache, args, context) => {
    cache.put(channels, {
      id: context.newId('channel'),
      name: args.name,
      private: args.private,
      createdAt: context.now()
    });
  }
});

export const channelJoin = mutation({
  name: 'channel.join',
  args: t.object({ channelId: t.string() })
});

export const readsMark = mutation({
  name: 'reads.mark',
  args: t.object({ channelId: t.string() }),
  optimistic: (cache, args, context) => {
    const memberId = context.actor.replace(/^user:/, '');
    const id = `${args.channelId}:${memberId}`;
    cache.put(channelReads, { id, channelId: args.channelId, memberId, lastReadAt: context.now() });
    if (cache.get(unreadCounts, id)) cache.update(unreadCounts, id, { count: 0 });
  }
});

export type Member = Infer<typeof MemberRow>;
export type Channel = Infer<typeof ChannelRow>;
export type Message = Infer<typeof MessageRow>;
export type UnreadCount = Infer<typeof UnreadCountRow>;
