// @vitest-environment jsdom
/**
 * Error capture: window handlers, the logger sink (single console line, no
 * double capture with the dev patch), ring cap, and the copy format.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';

import { logger, setWheelDevMode } from '../core';

import { startErrorCapture, formatEntry, type ErrorLog } from './error-capture';

let log: ErrorLog;

beforeAll(() => {
  setWheelDevMode(true);
  // One shared install for the whole file — capture is window-scoped and
  // deliberately has no uninstall.
  log = startErrorCapture();
});

describe('startErrorCapture', () => {
  it('is idempotent — the second start returns the same buffer', () => {
    expect(startErrorCapture()).toBe(log);
  });

  it('captures window error events with the thrown stack', () => {
    log.clear();
    const boom = new Error('kaboom');
    window.dispatchEvent(new ErrorEvent('error', { error: boom, message: 'kaboom' }));
    const [entry] = log.entries();
    expect(entry).toMatchObject({ source: 'uncaught', level: 'error', message: 'Error: kaboom' });
    expect(entry.stack.length).toBeGreaterThan(0);
  });

  it('captures unhandled rejections (when the environment can dispatch them)', () => {
    log.clear();
    type RejectionEventCtor = new (type: string, init: { reason: unknown; promise: Promise<unknown> }) => Event;
    const Ctor = (window as Window & { PromiseRejectionEvent?: RejectionEventCtor }).PromiseRejectionEvent;
    if (!Ctor) return; // jsdom without PromiseRejectionEvent — nothing to dispatch
    const rejected = Promise.reject(new Error('lost promise'));
    rejected.catch(() => {}); // keep the fixture promise from ACTUALLY going unhandled
    window.dispatchEvent(new Ctor('unhandledrejection', { reason: new Error('lost promise'), promise: rejected }));
    expect(log.entries()[0]).toMatchObject({ source: 'rejection', message: 'Error: lost promise' });
  });

  it('logger.error is captured once and prints exactly one console line', () => {
    log.clear();
    const spy = vi.spyOn(console, 'error');
    logger.error('mutation rejected', new Error('nope'));
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]).toMatchObject({
      source: 'logger',
      level: 'error',
      message: 'mutation rejected Error: nope'
    });
    // The sink forwards through the pre-patch original, so the patched
    // console.error spy sees nothing — one line, no double capture.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('raw console.error is captured by the dev patch', () => {
    log.clear();
    console.error('raw failure', new Error('from console'));
    expect(log.entries()).toHaveLength(1);
    expect(log.entries()[0]).toMatchObject({ source: 'console', level: 'error' });
    expect(log.entries()[0].stack.length).toBeGreaterThan(0);
  });

  it('logger.info is forwarded but never captured', () => {
    log.clear();
    logger.info('just so you know');
    expect(log.entries()).toHaveLength(0);
  });

  it('the buffer caps at 100, dropping oldest', () => {
    log.clear();
    for (let index = 0; index < 105; index += 1) {
      log.record('logger', 'error', `e${index}`, null);
    }
    const entries = log.entries();
    expect(entries).toHaveLength(100);
    expect(entries[0].message).toBe('e5');
  });

  it('formatEntry produces one pasteable block: header + indented frames', () => {
    log.clear();
    log.record('console', 'error', 'broke', 'Error: broke\n  at doThing (app.ts:3:5)');
    const text = formatEntry(log.entries()[0]);
    expect(text).toMatch(/^\[err_\d+\] ERROR \(console\) broke\n  Error: broke\n  at doThing \(app.ts:3:5\)$/);
  });
});
