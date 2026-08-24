// @vitest-environment jsdom
/**
 * The in-flight chip's minimum-visibility machine: a 20ms confirm can't
 * flash. Driven with a signal-backed fake SyncStatusService + fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { ServiceProvider, fakeService } from 'wheel/core';

import { SyncStatusService } from './services/sync-status-service';
import { CHIP_SETTLE_MS, SyncBadge } from './components/sync-badge';

describe('SyncBadge in-flight chip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appears with pending work, settles to ✓, holds, then exits', () => {
    const [pending, setPending] = createSignal(0);
    const fake = fakeService(SyncStatusService, {
      status: (() => 'connected') as SyncStatusService['status'],
      queued: (() => 0) as SyncStatusService['queued'],
      pending: pending as unknown as SyncStatusService['pending']
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider
          scopeId="badge-test"
          overrides={[{ original: SyncStatusService, replacement: fake, ownership: 'caller' }]}
        >
          <SyncBadge />
        </ServiceProvider>
      ),
      host
    );
    const chip = () => host.querySelector('[data-testid=inflight-chip]');
    try {
      expect(chip()).toBeNull();

      setPending(2);
      expect(chip()!.textContent).toBe('2 in flight');

      // Instant confirm: chip must NOT vanish — it settles and holds.
      setPending(0);
      expect(chip()!.textContent).toBe('✓ synced');
      vi.advanceTimersByTime(CHIP_SETTLE_MS - 100);
      expect(chip()).not.toBeNull();
      vi.advanceTimersByTime(150);
      expect(chip()).toBeNull();

      // New work during the settle hold re-activates cleanly.
      setPending(1);
      setPending(0);
      vi.advanceTimersByTime(100);
      setPending(3);
      expect(chip()!.textContent).toBe('3 in flight');
      vi.advanceTimersByTime(CHIP_SETTLE_MS + 100);
      expect(chip()!.textContent).toBe('3 in flight'); // still pending — no timer may hide it
    } finally {
      dispose();
      host.remove();
    }
  });
});
