/** Headless: turns pending/queued transitions into paced toast lifecycles. */
// wheel-component-root: headless — renders no DOM, drives the sync toasts
import { createEffect } from 'solid-js';
import { connect, view } from 'wheel/core';

import { ToastService } from 'wheel/kit';

import { SyncStatusService } from '../services/sync-status-service';

const connectSyncActivity = connect('SyncActivity', (c) => {
  const syncService = c.service(SyncStatusService);
  const toastService = c.service(ToastService);
  return view(
    { pending: syncService.pending, queued: syncService.queued },
    { begin: toastService.begin, succeed: toastService.succeed }
  );
});

/** Renders nothing; drives the sync toasts. Mounted by ConnectionPanel. */
export function SyncActivity() {
  const state = connectSyncActivity({});
  let wasPending = 0;
  let wasQueued = 0;
  // effect boundary: watches the sync counters and drives toast transitions.
  createEffect(() => {
    const pending = state.pending;
    const queued = state.queued;
    if (pending > 0) {
      state.begin('sync', `Saving ${pending} change${pending === 1 ? '' : 's'}…`, 'progress');
    } else if (wasPending > 0 && queued === 0) {
      state.succeed('sync', '✓ Saved');
    }
    if (queued > 0) {
      state.begin('offline', `${queued} unsaved change${queued === 1 ? '' : 's'} — offline`, 'warn');
    } else if (wasQueued > 0) {
      state.succeed('offline', '✓ Queued changes synced');
    }
    wasPending = pending;
    wasQueued = queued;
  });
  return null;
}
