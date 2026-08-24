// @vitest-environment node
/**
 * Cycle time is reactive only at meaningful boundaries. The service schedules
 * one wake-up for the next cycle start/end instead of maintaining a global
 * ticking clock or putting ever-changing timestamps into computedFor keys.
 */
import { describe, expect, test } from 'vitest';

import { ServiceContext } from 'wheel/core';
import type { QueryHandle, SyncClient } from 'wheel/sync';

import { CycleService } from '../src/services/cycle-service';
import type { Cycle } from '../src/sync/cycles.sync';

describe('CycleService boundary clock', () => {
  test('wakes at start/end and cancels its pending wake-up on disposal', async () => {
    let now = 100;
    let scheduled:
      | { delay: number; run: () => void; cancelled: boolean }
      | undefined;
    let cycles: Cycle[] = [
      {
        id: 'cycle-1',
        teamId: 'team-1',
        number: 1,
        startsAt: 200,
        endsAt: 300
      }
    ];
    const client = {
      onChange: () => () => {},
      subscribe: () =>
        Promise.resolve({
          query: 'cycles.byTeam',
          subscriptionId: 'sub-cycle',
          rows: () => cycles,
          stale: () => false,
          release: () => {}
        } satisfies QueryHandle<Cycle>)
    } as unknown as SyncClient;
    const context = new ServiceContext({
      client,
      clock: { now: () => now },
      defer: {
        schedule: (delay, run) => {
          const job = { delay, run, cancelled: false };
          scheduled = job;
          return () => {
            job.cancelled = true;
          };
        }
      }
    });
    const service = context.get(CycleService);

    // First read starts the lazy subscription. The resolved handle invalidates
    // the memo, so the next read sees the row and schedules its start.
    expect(service.active('team-1')).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.active('team-1')).toBeUndefined();
    expect(scheduled?.delay).toBe(100);

    now = 200;
    scheduled?.run();
    expect(service.active('team-1')?.id).toBe('cycle-1');
    expect(service.ended(300)).toBe(false);
    expect(scheduled?.delay).toBe(100);

    now = 300;
    scheduled?.run();
    expect(service.active('team-1')).toBeUndefined();
    expect(service.ended(300)).toBe(true);

    // Add a future cycle so disposal has a live timer to cancel.
    cycles = [
      ...cycles,
      {
        id: 'cycle-2',
        teamId: 'team-1',
        number: 2,
        startsAt: 400,
        endsAt: 500
      }
    ];
    context.bump();
    expect(service.active('team-1')).toBeUndefined();
    expect(scheduled?.delay).toBe(100);
    expect(scheduled?.cancelled).toBe(false);

    context.dispose();
    expect(scheduled?.cancelled).toBe(true);
  });
});
