/**
 * The sync badge: connection dot + queued chip + the in-flight chip.
 *
 * The in-flight chip has its own little display state machine so a fast
 * server can't flash it: it appears with pending work, and after the last
 * confirm it holds a settled "✓" for CHIP_SETTLE_MS before leaving.
 */
import { Show, createEffect } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { SyncStatusService } from '../services/sync-status-service';
import styles from './connection.module.css';

/** The dot's fill per connection status, as design tokens (see
    packages/wheel/src/styles/tokens.css). The status palette is FIXED — a
    live green dot means the same thing in light and dark. */
const STATUS_COLORS: Record<string, string> = {
  connected: 'var(--wheel-ok)',
  connecting: 'var(--wheel-warn)',
  reconnecting: 'var(--wheel-warn)',
  offline: 'var(--wheel-danger)'
};

/** Minimum time the chip stays after pending returns to zero. */
export const CHIP_SETTLE_MS = 600;

const connectSyncBadge = connect('SyncBadge', (c) => {
  const syncService = c.service(SyncStatusService);
  return view({
    status: syncService.status,
    queued: syncService.queued,
    pending: syncService.pending
  });
});

/** Dot + label + queued/in-flight chips. Mount once per demo header. */
export function SyncBadge() {
  const state = connectSyncBadge({});
  // Chip machine: 'hidden' → 'active' (pending > 0) → 'settled' (✓, holds
  // CHIP_SETTLE_MS) → 'hidden'. Ephemeral presentation state — a local signal.
  const [chip, setChip] = useSignal<'hidden' | 'active' | 'settled'>('hidden', 'chip');
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  // effect boundary: watches the pending counter and drives the chip's
  // minimum-visibility lifecycle.
  createEffect(() => {
    if (state.pending > 0) {
      clearTimeout(settleTimer);
      setChip('active');
    } else if (chip() === 'active') {
      setChip('settled');
      clearTimeout(settleTimer);
      // wheel-view-timing: keep the transient synced state visible long enough to read
      settleTimer = setTimeout(() => setChip('hidden'), CHIP_SETTLE_MS);
    }
  });
  return (
    <span use:componentRoot class={styles.badge} data-testid="sync-badge">
      <span class={styles.dot} style={{ background: STATUS_COLORS[state.status] ?? 'var(--wheel-ink-muted)' }} />
      {state.status}
      <Show when={state.queued > 0}>
        <span class={styles.queued}>{state.queued} unsaved</span>
      </Show>
      <Show when={chip() !== 'hidden'}>
        <span
          class={chip() === 'settled' ? `${styles.pending} ${styles.pendingSettled}` : styles.pending}
          data-testid="inflight-chip"
        >
          {chip() === 'settled' ? '✓ synced' : `${Math.max(state.pending, 1)} in flight`}
        </span>
      </Show>
    </span>
  );
}
