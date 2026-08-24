/**
 * Error capture — the "no raw text copy/pasting" story. Everything that goes
 * wrong in a wheel app lands in ONE window-scoped ring buffer with a stable
 * id, a message, and a stack whose frames are source-mapped at capture time
 * (dev), so every surface hands out `board-service.ts:87` — never
 * `chunk-ab12.js:1:48213`:
 *
 * - the debug panel's errors section (one-click copy per entry),
 * - `window.__wheel.errors()` — an agent's FIRST call when the app looks wrong,
 * - the playwright driver, which THROWS on new entries after every step,
 * - the behavior harness, which fails any behavior that captured errors.
 *
 * Sources captured:
 * - `window` `error` events (uncaught exceptions) — always,
 * - `unhandledrejection` — always,
 * - the `logger` sink (`logger.warn/error`) — always,
 * - a `console.error`/`console.warn` PATCH — dev mode only (patching globals
 *   in production from a library is invasive; prod capture flows through
 *   `logger`).
 *
 * The buffer is window-scoped, not per-app: uncaught errors don't carry an
 * app identity. Cap 100 entries, oldest dropped. Timestamps use the
 * diagnostics clock (`monotonicNowMs`) — capture runs outside any service
 * context, and error times are diagnostics, never behavior.
 */
import type { BridgeErrorEntry } from '../core/bridge-contract';
import { setLoggerSink, type LogLevel } from '../core/logger';
import { isWheelDevMode } from '../core/dev-mode';
import { monotonicNowMs } from '../core/runtime-defaults';

import { mapStack } from './source-map';

/** One captured error/warning, as every surface sees it. */
export interface CapturedError extends BridgeErrorEntry {
  /** Where it came from: an uncaught throw, a rejected promise, or a log call. */
  readonly source: 'uncaught' | 'rejection' | 'console' | 'logger';
  readonly level: LogLevel;
  /** False until (or unless) source-map resolution finished for the stack. */
  readonly mapped: boolean;
}

const MAX_ENTRIES = 100;

type Listener = () => void;

/** The window-scoped capture buffer (see module doc). */
export class ErrorLog {
  private readonly buffer: CapturedError[] = [];
  private readonly listeners = new Set<Listener>();
  private counter = 0;

  /** Every captured entry, oldest first. */
  entries(): readonly CapturedError[] {
    return [...this.buffer];
  }

  /** Empty the buffer (the panel's clear button; test isolation). */
  clear(): void {
    this.buffer.length = 0;
    this.notify();
  }

  /** Subscribe to buffer changes; returns the unsubscriber. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Record one entry; kicks off async source-mapping of its stack in dev. */
  record(source: CapturedError['source'], level: LogLevel, message: string, rawStack: string | null): void {
    this.counter += 1;
    const entry: CapturedError = {
      id: `err_${this.counter}`,
      source,
      level,
      message,
      stack: rawStack ? rawStack.split('\n').map((line) => line.trim()).filter(Boolean) : [],
      at: monotonicNowMs(),
      mapped: false
    };
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) this.buffer.shift();
    this.notify();
    if (rawStack && isWheelDevMode()) {
      // Resolve frames to original sources, then swap the entry in place.
      // Failures keep the raw frames — mapStack never throws.
      void mapStack(rawStack).then((frames) => {
        const index = this.buffer.indexOf(entry);
        if (index === -1) return; // already rotated out
        this.buffer[index] = { ...entry, stack: frames, mapped: true };
        this.notify();
      });
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stackOf(value: unknown): string | null {
  return value instanceof Error && value.stack ? value.stack : null;
}

/** A synthetic stack for logger calls without an Error arg — capture internals trimmed. */
function captureSiteStack(): string | null {
  const raw = new Error('logger').stack;
  if (!raw) return null;
  return raw
    .split('\n')
    .filter((line) => !/logger\.ts|error-capture\.ts/.test(line))
    .join('\n');
}

let installed: ErrorLog | null = null;

/** The live capture buffer, or null before any debug surface mounted. */
export function activeErrorLog(): ErrorLog | null {
  return installed;
}

/**
 * Install capture once per window (idempotent — every debug surface calls
 * this on mount and shares the buffer). There is deliberately NO uninstall:
 * capture is window-scoped diagnostics, and tearing down global handlers on
 * panel unmount would silently blind every other surface.
 */
export function startErrorCapture(): ErrorLog {
  if (installed) return installed;
  const log = new ErrorLog();
  installed = log;

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      log.record('uncaught', 'error', describe(event.error ?? event.message), stackOf(event.error));
    });
    window.addEventListener('unhandledrejection', (event) => {
      log.record('rejection', 'error', describe(event.reason), stackOf(event.reason));
    });
  }

  // Pre-patch console handles: the sink must forward to the REAL console —
  // routing through a patched method would capture the same call twice.
  // wheel-console: these bound originals are the capture system's own
  // forwarding path.
  const originals = {
    // wheel-console: the pre-patch handles ARE the capture system's one forwarding path
    debug: console.debug.bind(console),
    // wheel-console: the pre-patch handles ARE the capture system's one forwarding path
    info: console.info.bind(console),
    // wheel-console: the pre-patch handles ARE the capture system's one forwarding path
    warn: console.warn.bind(console),
    // wheel-console: the pre-patch handles ARE the capture system's one forwarding path
    error: console.error.bind(console)
  } as const;

  // Logger sink: captures logger.warn/error in EVERY build; forwards to the
  // (original) console so exactly one line still prints.
  setLoggerSink((level, parts) => {
    if (level === 'warn' || level === 'error') {
      const error = parts.find((part) => part instanceof Error) as Error | undefined;
      log.record('logger', level, parts.map(describe).join(' '), error?.stack ?? captureSiteStack());
    }
    originals[level](...parts);
  });

  // Dev-only console patch: raw console.error/warn from ANY code (third-party
  // included) lands in the buffer. `Error` args contribute their stack.
  if (isWheelDevMode() && typeof console !== 'undefined') {
    for (const level of ['error', 'warn'] as const) {
      console[level] = (...parts: unknown[]) => {
        const error = parts.find((part) => part instanceof Error) as Error | undefined;
        log.record('console', level, parts.map(describe).join(' '), error?.stack ?? null);
        originals[level](...parts);
      };
    }
  }
  return log;
}

/** One entry as a single pasteable text block (the panel's copy button). */
export function formatEntry(entry: CapturedError): string {
  const header = `[${entry.id}] ${entry.level.toUpperCase()} (${entry.source}) ${entry.message}`;
  return entry.stack.length > 0 ? `${header}\n  ${entry.stack.join('\n  ')}` : header;
}
