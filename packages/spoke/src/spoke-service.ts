import { SyncService, type MutationHandle } from 'wheel/sync';

import { SPOKE_IDENTITY } from './spoke-client';
import {
  channelCreate,
  channelJoin,
  channelsForMember,
  membersAll,
  messageDelete,
  messageEdit,
  messageSend,
  messagesByChannel,
  readsForMember,
  readsMark,
  spokePresence,
  unreadForMember,
  type Channel,
  type Message,
  type UnreadCount
} from './sync/spoke.sync';

interface ChannelPeer {
  readonly actor: string;
  readonly typing: boolean;
}

/** Owns Spoke subscriptions, channel selection, writes, and ephemeral presence. */
export class SpokeService extends SyncService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SpokeService';

  readonly members = this.liveQuery(membersAll, {});
  readonly channels = this.liveQuery(channelsForMember, {});
  readonly reads = this.liveQuery(readsForMember, {});
  readonly unread = this.liveQuery(unreadForMember, {});
  private readonly messageQueries = this.liveQueryFor(messagesByChannel, (channelId: string) => ({
    channelId,
    limit: 50
  }));
  private readonly selectedChannelId = this.atom(SPOKE_IDENTITY.channelId, 'selectedChannelId');

  readonly selectedChannel = this.computed(
    (): Channel | undefined => this.channels.rows.find((channel) => channel.id === this.selectedChannelId.get()),
    'selectedChannel'
  );
  readonly currentChannelId = this.computed(() => this.selectedChannelId.get(), 'currentChannelId');
  readonly messages = this.computed(
    (): readonly Message[] => this.messageQueries(this.selectedChannelId.get()).rows,
    'messages'
  );
  readonly messagesStatus = this.computed(
    () => this.messageQueries(this.selectedChannelId.get()).status,
    'messagesStatus'
  );
  readonly connection = this.clientRead(() => this.client.connectionStatus(), 'connection');
  readonly pending = this.clientRead(() => this.client.pendingMutations(), 'pending');

  private readonly peersOn = this.clientReadFor((channelId: string): readonly ChannelPeer[] => {
    const peers = this.client.peers(spokePresence);
    return [...peers.valid.entries()]
      .filter(([, state]) => state.channelId === channelId)
      .map(([clientId, state]) => ({ actor: peers.actors.get(clientId) ?? 'unknown', typing: state.typing }));
  }, 'peersOn');

  readonly onlineActors = this.computed(
    (): readonly string[] => [...new Set(this.peersOn(this.selectedChannelId.get()).map((peer) => peer.actor))],
    'onlineActors'
  );
  readonly typingActors = this.computed(
    (): readonly string[] => [
      ...new Set(this.peersOn(this.selectedChannelId.get()).filter((peer) => peer.typing).map((peer) => peer.actor))
    ],
    'typingActors'
  );

  readonly selectChannel = this.action((channelId: string) => {
    this.client.setPresence(spokePresence, null);
    this.selectedChannelId.set(channelId);
  }, 'selectChannel');

  readonly sendMessage = (body: string): MutationHandle =>
    this.mutate(messageSend, { channelId: this.selectedChannelId.get(), body });

  readonly editMessage = (messageId: string, body: string): MutationHandle =>
    this.mutate(messageEdit, { messageId, body });

  readonly deleteMessage = (messageId: string): MutationHandle =>
    this.mutate(messageDelete, { messageId });

  readonly createChannel = (name: string, privateChannel: boolean): MutationHandle =>
    this.mutate(channelCreate, { name, private: privateChannel });

  readonly joinChannel = (channelId: string): MutationHandle => this.mutate(channelJoin, { channelId });

  readonly markRead = (): MutationHandle =>
    this.mutate(readsMark, { channelId: this.selectedChannelId.get() });

  readonly setTyping = this.action((typing: boolean) => {
    this.client.setPresence(spokePresence, {
      channelId: this.selectedChannelId.get(),
      typing
    });
  }, 'setTyping');

  readonly clearPresence = this.action(() => {
    this.client.setPresence(spokePresence, null);
  }, 'clearPresence');

  readonly unreadFor = (channelId: string): UnreadCount | undefined =>
    this.unread.rows.find((entry) => entry.channelId === channelId);
}
