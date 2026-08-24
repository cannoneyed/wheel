/**
 * The inbox: unread-first list, click-through to the issue's full
 * page, mark one/all read (both undoable — mod+z works here too).
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, systemClock, view } from 'wheel/core';

import { InboxService } from '../../services/inbox-service';
import { IssueService } from '../../services/issue-service';
import { IssueInteractionService } from '../../services/issue-interaction-service';
import { formatRelativeTime } from '../../utils/dates';
import styles from './inbox-page.module.css';

const connectInboxPage = connect('InboxPage', (c) => {
  const inboxService = c.service(InboxService);
  const issueService = c.service(IssueService);
  const interactionService = c.service(IssueInteractionService);
  return view(
    {
      notifications: inboxService.notifications,
      unread: inboxService.unreadCount
    },
    {
      describe: inboxService.describe,
      issueTitle: (issueId: string) => issueService.locate(issueId)?.title ?? '…',
      markRead: inboxService.markRead,
      markUnread: inboxService.markUnread,
      markAllRead: inboxService.markAllRead,
      openIssue: interactionService.openFull
    }
  );
});

/** The inbox route. */
export function InboxPage() {
  const state = connectInboxPage({});
  return (
    <div use:componentRoot class={styles.page}>
      <header class={styles.header}>
        <h2 class={styles.title}>Inbox</h2>
        <span class={styles.count}>{state.unread} unread</span>
        <span class={styles.spacer} />
        <button class={styles.markAll} disabled={state.unread === 0} onClick={() => state.markAllRead()}>
          Mark all read
        </button>
      </header>
      <div class={styles.list}>
        <For each={state.notifications}>
          {(entry) => (
            <div class={styles.row} classList={{ [styles.rowUnread]: entry.readAt === null }}>
              <span class={styles.dot} classList={{ [styles.dotUnread]: entry.readAt === null }}>
                ●
              </span>
              <button class={styles.body} onClick={() => state.openIssue(entry.issueId)}>
                <span class={styles.sentence}>{state.describe(entry)}</span>
                <span class={styles.issueTitle}>{state.issueTitle(entry.issueId)}</span>
                <Show when={entry.detail !== ''}>
                  <span class={styles.detail}>{entry.detail}</span>
                </Show>
              </button>
              <span class={styles.time}>{formatRelativeTime(entry.createdAt, systemClock.now())}</span>
              <button
                class={styles.readToggle}
                title={entry.readAt === null ? 'Mark read' : 'Mark unread'}
                onClick={() => (entry.readAt === null ? state.markRead(entry.id) : state.markUnread(entry.id))}
              >
                {entry.readAt === null ? '✓' : '↺'}
              </button>
            </div>
          )}
        </For>
        <Show when={state.notifications.length === 0}>
          <div class={styles.empty}>Nothing here — assign yourself something or get @mentioned.</div>
        </Show>
      </div>
    </div>
  );
}
