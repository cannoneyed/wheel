/**
 * The resident half of the annotator: one recorder, alive for the session.
 *
 * This module exists so a production build can pay 2.4 KB gzipped and still
 * have the last minute already recorded when someone finally presses the
 * chord. Everything else — the picker, the composer, voice, note rendering —
 * arrives later through a dynamic import, and adopts the buffer this module
 * has been filling all along.
 *
 * That ordering is the whole point. A recorder that starts when you arm can
 * only ever show you the future, and by the time you noticed the bug the
 * interesting part is already in the past.
 *
 * Keep the import graph here TINY. Anything this module pulls in is paid for
 * by every page load, so it may reach the recorder and nothing else.
 */
import type { DebugRegistry } from '../core/debug-registry';

import { Recorder } from './recorder';

let session: Recorder | null = null;
let mounts = 0;

/** What the resident recorder needs to run. */
export interface AnnotateSessionOptions {
  /** The injected clock, so timestamps match the services'. */
  readonly now: () => number;
  /** The component registry, for mapping events to components. */
  readonly registry: DebugRegistry;
}

/**
 * Start the rolling buffer, or return the one already running.
 *
 * Idempotent: several `WheelAnnotate` mounts (a docs page with two embedded
 * apps) share one recorder, exactly as they share one kernel tap.
 */
export function startAnnotateSession(options: AnnotateSessionOptions): Recorder {
  mounts += 1;
  if (!session) {
    session = new Recorder(options);
    session.install();
  }
  return session;
}

/** The running recorder, or null when annotation is not enabled on this page. */
export function annotateRecorder(): Recorder | null {
  return session;
}

/**
 * Release one mount's claim on the session; the last one out tears it down.
 *
 * Refcounted because a docs page can embed several wheel apps, and the first
 * one to unmount must not take the shared taps with it.
 */
export function stopAnnotateSession(): void {
  mounts = Math.max(0, mounts - 1);
  if (mounts > 0) return;
  session?.uninstall();
  session = null;
}
