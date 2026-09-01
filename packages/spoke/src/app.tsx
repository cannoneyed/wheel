import { For, Show, onCleanup } from 'solid-js';
import { WheelApp } from 'wheel/debug';
import { componentRoot, connect, view } from 'wheel/core';

import { SPOKE_IDENTITY, spokeClient } from './spoke-client';
import { SpokeService } from './spoke-service';

const connectSpoke = connect('Spoke', (context) => {
  const spoke = context.service(SpokeService);
  return view(
    {
      members: () => spoke.members.rows,
      membersStatus: () => spoke.members.status.kind,
      channels: () => spoke.channels.rows,
      channelsStatus: () => spoke.channels.status.kind,
      selectedChannel: spoke.selectedChannel,
      currentChannelId: spoke.currentChannelId,
      messages: spoke.messages,
      messagesStatus: () => spoke.messagesStatus().kind,
      unread: () => spoke.unread.rows,
      unreadStatus: () => spoke.unread.status.kind,
      onlineActors: spoke.onlineActors,
      typingActors: spoke.typingActors,
      connection: spoke.connection,
      pending: spoke.pending
    },
    {
      selectChannel: spoke.selectChannel,
      sendMessage: spoke.sendMessage,
      editMessage: spoke.editMessage,
      deleteMessage: spoke.deleteMessage,
      markRead: spoke.markRead,
      setTyping: spoke.setTyping,
      clearPresence: spoke.clearPresence,
      unreadFor: spoke.unreadFor
    }
  );
});

function SpokeWorkspace() {
  const state = connectSpoke({});
  let composer!: HTMLInputElement;
  onCleanup(() => state.clearPresence());
  return (
    <main use:componentRoot>
      <header>
        <div>
          <p class="eyebrow">Spoke</p>
          <h1 data-testid="workspace-name">{SPOKE_IDENTITY.workspaceId}</h1>
          <span data-testid="actor-name">{SPOKE_IDENTITY.actor}</span>
        </div>
        <div class="status-panel">
          <strong data-testid="connection-state">{state.connection}</strong>
          <span data-testid="pending-state">pending {state.pending}</span>
        </div>
      </header>

      <section class="query-status" aria-label="Query status">
        <output data-testid="members-status">members: {state.membersStatus}</output>
        <output data-testid="channels-status">channels: {state.channelsStatus}</output>
        <output data-testid="messages-status">messages: {state.messagesStatus}</output>
        <output data-testid="unread-status">unread: {state.unreadStatus}</output>
      </section>

      <div class="workspace-grid">
        <aside>
          <h2>Channels</h2>
          <nav aria-label="Workspace channels">
            <For each={state.channels}>
              {(channel) => (
                <button
                  data-testid={`channel-${channel.id}`}
                  aria-current={state.currentChannelId === channel.id ? 'page' : undefined}
                  onClick={() => state.selectChannel(channel.id)}
                >
                  <span>{channel.private ? '🔒' : '#'} {channel.name}</span>
                  <span data-testid={`unread-${channel.id}`}>
                    {state.unreadFor(channel.id)?.count ?? 0}
                  </span>
                </button>
              )}
            </For>
          </nav>
          <h2>Members</h2>
          <ul data-testid="member-list">
            <For each={state.members}>{(member) => <li>{member.name}</li>}</For>
          </ul>
        </aside>

        <section class="channel-panel">
          <div class="channel-heading">
            <div>
              <h2 data-testid="channel-name">{state.selectedChannel?.name ?? state.currentChannelId}</h2>
              <span data-testid="active-channel-id">{state.currentChannelId}</span>
            </div>
            <button data-testid="mark-read" onClick={() => state.markRead()}>Mark read</button>
          </div>

          <div class="presence-panel">
            <output data-testid="online-members">online: {state.onlineActors.join(', ') || 'none'}</output>
            <output data-testid="typing-state">typing: {state.typingActors.join(', ') || 'none'}</output>
          </div>

          <div class="messages" data-testid="message-list">
            <For each={state.messages}>
              {(message) => (
                <article data-testid={`message-${message.id}`}>
                  <strong>{message.authorId}</strong>
                  <p>{message.body}</p>
                  <Show when={message.editedAt !== null}><small>edited</small></Show>
                </article>
              )}
            </For>
            <Show when={state.messages.length === 0}>
              <p data-testid="empty-messages">No visible messages.</p>
            </Show>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              state.sendMessage(composer.value);
              composer.value = '';
              state.setTyping(false);
            }}
          >
            <input
              ref={composer}
              data-testid="message-composer"
              aria-label="Message"
              onInput={(event) => state.setTyping(event.currentTarget.value.length > 0)}
              onBlur={() => state.setTyping(false)}
            />
            <button data-testid="send-message" type="submit">Send</button>
          </form>
        </section>
      </div>
    </main>
  );
}

/** Workspace chat app used by Wheel's authorization and delivery proofs. */
export function App() {
  return <WheelApp client={spokeClient()}><SpokeWorkspace /></WheelApp>;
}
