// @vitest-environment jsdom
/**
 * The toast pacing contract: a fast confirm can never flash, a re-begin cancels
 * a pending dismissal, and `flash` self-dismisses. Fake timers drive the
 * lifecycle deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';

import { ServiceContext, ServiceProvider, connect } from '../core/index';
import { ToastService, ToastSystem } from './toast';

describe('ToastService lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a toast at least 500ms even when success arrives instantly', () => {
    const context = new ServiceContext();
    const toasts = context.get(ToastService);

    toasts.begin('sync', 'Saving 1 change…');
    // Success 20ms later — the fast-server flash case.
    vi.advanceTimersByTime(20);
    toasts.succeed('sync', '✓ Saved');

    // Still showing "Saving…" (progress) until the 500ms floor.
    vi.advanceTimersByTime(300);
    expect(toasts.toasts.get()[0].text).toBe('Saving 1 change…');

    vi.advanceTimersByTime(200); // 520ms total → success text lands
    expect(toasts.toasts.get()[0].text).toBe('✓ Saved');
    expect(toasts.toasts.get()[0].kind).toBe('success');

    // Holds ~900ms, then leaves, then removes.
    vi.advanceTimersByTime(900);
    expect(toasts.toasts.get()[0]?.state).toBe('leaving');
    vi.advanceTimersByTime(250);
    expect(toasts.toasts.get().length).toBe(0);
    context.dispose();
  });

  it('re-begin during resolve cancels the dismissal and keeps the toast', () => {
    const context = new ServiceContext();
    const toasts = context.get(ToastService);

    toasts.begin('sync', 'Saving 1 change…');
    vi.advanceTimersByTime(600);
    toasts.succeed('sync', '✓ Saved');
    // A new mutation lands while the success is holding:
    vi.advanceTimersByTime(100);
    toasts.begin('sync', 'Saving 1 change…');
    vi.advanceTimersByTime(2000);
    // Never dismissed — still on screen in progress state.
    expect(toasts.toasts.get().length).toBe(1);
    expect(toasts.toasts.get()[0].kind).toBe('progress');
    context.dispose();
  });

  it('stacks independent toasts', () => {
    const context = new ServiceContext();
    const toasts = context.get(ToastService);
    toasts.begin('sync', 'Saving…');
    toasts.begin('offline', '2 unsaved changes — offline', 'warn');
    expect(toasts.toasts.get().map((t) => t.id)).toEqual(['sync', 'offline']);
    context.dispose();
  });

  it('uses the owning context clock and scheduler', () => {
    let now = 1_000;
    const scheduled: Array<{ ms: number; cancelled: boolean }> = [];
    const context = new ServiceContext({
      clock: { now: () => now },
      defer: {
        schedule: (ms) => {
          const task = { ms, cancelled: false };
          scheduled.push(task);
          return () => {
            task.cancelled = true;
          };
        }
      }
    });
    const toasts = context.get(ToastService);

    toasts.begin('sync', 'Saving…');
    expect(toasts.toasts.get()[0].shownAt).toBe(1_000);
    expect(scheduled[0].ms).toBe(30);
    now = 1_200;
    toasts.succeed('sync', 'Saved');
    expect(scheduled[0].cancelled).toBe(true);
    expect(scheduled[1].ms).toBe(300);
    context.dispose();
  });

  it('flash shows a self-dismissing toast that fades on its own', () => {
    const context = new ServiceContext();
    const toasts = context.get(ToastService);

    toasts.flash('rejected', 'Cannot delete: item in use');
    vi.advanceTimersByTime(30); // enter → active
    expect(toasts.toasts.get()[0].text).toBe('Cannot delete: item in use');
    expect(toasts.toasts.get()[0].kind).toBe('warn');
    expect(toasts.toasts.get()[0].state).toBe('active');

    // Lives ~3200ms, then leaves, then removes — no dismiss() call needed.
    vi.advanceTimersByTime(3200);
    expect(toasts.toasts.get()[0].state).toBe('leaving');
    vi.advanceTimersByTime(250);
    expect(toasts.toasts.get().length).toBe(0);
    context.dispose();
  });

  it('re-beginning an id cancels that id’s old flash generation', () => {
    const context = new ServiceContext();
    const toasts = context.get(ToastService);

    toasts.flash('sync', 'Connection lost');
    vi.advanceTimersByTime(100);
    toasts.begin('sync', 'Reconnecting…', 'progress');
    vi.advanceTimersByTime(4000);

    expect(toasts.toasts.get()).toHaveLength(1);
    expect(toasts.toasts.get()[0]).toMatchObject({
      id: 'sync',
      text: 'Reconnecting…',
      kind: 'progress',
      state: 'active'
    });
    context.dispose();
  });

  it('announces updates and lets keyboard users dismiss a toast', () => {
    let service!: ToastService;
    const connectProbe = connect('ToastProbe', (c) => {
      service = c.service(ToastService);
      return {};
    });
    function Probe() {
      connectProbe({});
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dispose = render(
      () => (
        <ServiceProvider scopeId="toast-a11y">
          <Probe />
          <ToastSystem />
        </ServiceProvider>
      ),
      host
    );
    try {
      service.begin('saved', 'Saving…');
      const stack = host.querySelector('[data-testid=wheel-toast-stack]') as HTMLElement;
      const toast = stack.querySelector('[data-toast-id=saved]') as HTMLElement;
      expect(stack.getAttribute('role')).toBe('status');
      expect(stack.getAttribute('aria-live')).toBe('polite');
      expect(toast.getAttribute('role')).toBe('button');
      expect(toast.tabIndex).toBe(0);

      toast.focus();
      toast.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(service.toasts.get()[0].state).toBe('leaving');
      expect(
        host.querySelector('[data-toast-id=saved]')?.getAttribute('data-state')
      ).toBe('leaving');
    } finally {
      dispose();
      host.remove();
    }
  });
});
