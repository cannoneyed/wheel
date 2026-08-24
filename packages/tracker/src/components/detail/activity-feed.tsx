/**
 * The activity feed: the server's account of what happened,
 * newest 50 (server-capped + prune-scoped). Collapsed by default behind a
 * toggle so comments stay the primary conversation surface.
 */
import { For, Show } from 'solid-js';
import { componentRoot, connect, systemClock, useSignal, view } from 'wheel/core';

import { ActivityService } from '../../services/activity-service';
import { formatRelativeTime } from '../../utils/dates';
import styles from './activity-feed.module.css';

const connectActivityFeed = connect(
  (props: { teamId: string; issueId: string }) => `ActivityFeed:${props.issueId}`,
  (c, props: { teamId: string; issueId: string }) => {
    const activityService = c.service(ActivityService);
    return view(
      { feed: () => activityService.feedOf(props.issueId) },
      { describe: activityService.describe }
    );
  }
);

/** The collapsible activity block. */
export function ActivityFeed(props: { teamId: string; issueId: string }) {
  const state = connectActivityFeed(props);
  const [open, setOpen] = useSignal(false, 'open');
  return (
    <section use:componentRoot class={styles.section}>
      <button class={styles.toggle} onClick={() => setOpen(!open())}>
        {open() ? '▾' : '▸'} Activity ({state.feed.length})
      </button>
      <Show when={open()}>
        <For each={state.feed}>
          {(entry) => (
            <div class={styles.entry}>
              <span class={styles.text}>{state.describe(props.teamId, entry)}</span>
              <span class={styles.time}>{formatRelativeTime(entry.createdAt, systemClock.now())}</span>
            </div>
          )}
        </For>
      </Show>
    </section>
  );
}
