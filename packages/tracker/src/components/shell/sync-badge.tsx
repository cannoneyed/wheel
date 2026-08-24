/**
 * Axle's sync badge: connection dot, queued/unsaved chip, and the
 * min-visibility in-flight chip — the shared/ demo pattern, tracker-styled.
 */
import { Show, createEffect } from 'solid-js';
import { componentRoot, connect, useSignal, view } from 'wheel/core';

import { SyncStatusService } from '../../services/sync-status-service';
import styles from './sync-badge.module.css';

const STATUS_COLORS: Record<string, string> = {
  connected: 'var(--ok)',
  connecting: 'var(--warn)',
  reconnecting: 'var(--warn)',
  offline: 'var(--danger)'
};

/** Minimum time the in-flight chip stays after pending returns to zero. */
export const CHIP_SETTLE_MS = 600;

const connectSyncBadge = connect('SyncBadge', (c) => {
  const syncService = c.service(SyncStatusService);
  return view({
    status: syncService.status,
    queued: syncService.queued,
    pending: syncService.pending,
    seq: syncService.seq
  });
});

/** Mounted in the shell header. */
export function SyncBadge() {
  const state = connectSyncBadge({});
  const [chip, setChip] = useSignal<'hidden' | 'active' | 'settled'>('hidden', 'chip');
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  // effect boundary: pending-counter watcher driving the chip's
  // minimum-visibility lifecycle (never flash on a fast confirm).
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
    <span use:componentRoot class={styles.badge} data-testid="sync-badge" title={`seq ${state.seq}`}>
      <span class={styles.dot} style={{ background: STATUS_COLORS[state.status] ?? 'var(--ink-muted)' }} />
      {state.status}
      <Show when={state.queued > 0}>
        <span class={styles.queued}>{state.queued} unsaved</span>
      </Show>
      <Show when={chip() !== 'hidden'}>
        <span class={chip() === 'settled' ? `${styles.pending} ${styles.settled}` : styles.pending}>
          {chip() === 'settled' ? '✓' : `${Math.max(state.pending, 1)}↑`}
        </span>
      </Show>
    </span>
  );
}
