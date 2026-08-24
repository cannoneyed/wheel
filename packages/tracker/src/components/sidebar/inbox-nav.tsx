/** The sidebar's Inbox + My Issues links, with the live unread badge. */
import { Show } from 'solid-js';
import { componentRoot, connect, view } from 'wheel/core';

import { InboxService } from '../../services/inbox-service';
import type { RouterService } from 'wheel/router';

import { trackerRouter, type TrackerRoutes } from '../../routes';
import styles from './sidebar.module.css';

const connectInboxNav = connect('InboxNav', (c) => {
  const inboxService = c.service(InboxService);
  const router = c.service(trackerRouter.Service) as RouterService<TrackerRoutes>;
  return view(
    {
      unread: inboxService.unreadCount,
      routeName: router.routeName
    },
    { navigate: router.navigate }
  );
});

/** Inbox (badged) + My Issues section. */
export function InboxNav() {
  const state = connectInboxNav({});
  return (
    <div use:componentRoot class={styles.section}>
      <button
        class={state.routeName === 'inbox' ? `${styles.item} ${styles.itemActive}` : styles.item}
        onClick={() => state.navigate('inbox')}
      >
        Inbox
        <Show when={state.unread > 0}>
          <span class={styles.badge}>{state.unread}</span>
        </Show>
      </button>
      <button
        class={state.routeName === 'myIssues' ? `${styles.item} ${styles.itemActive}` : styles.item}
        onClick={() => state.navigate('myIssues')}
      >
        My Issues
      </button>
    </div>
  );
}
