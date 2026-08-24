/**
 * What `/` renders, and what an unmatched URL falls back to: an empty state
 * pointing at the sidebar. Axle has no landing page — a workspace opens onto
 * whatever the user last had, and there is nothing useful to show before a
 * team is chosen.
 */
import { viewRoot } from 'wheel/core';

import styles from './app-shell.module.css';

/** Empty state for the index route and for URLs that match nothing. */
export function HomePlaceholder() {
  return (
    <div use:viewRoot={'HomePlaceholder'} class={styles.placeholder}>
      Select a team from the sidebar.
    </div>
  );
}
